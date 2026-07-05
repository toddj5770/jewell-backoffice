// Commission calculation logic — mirrors the HTML prototype exactly

export function fmt$(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPct(n) {
  return Number(n || 0).toFixed(1) + '%'
}

/**
 * Total gross commission for a transaction, honoring commission_type.
 * Single source of truth for "what did this deal gross" — use everywhere a
 * live GCI/gross figure is computed so flat-fee (referral) deals count too.
 *
 * - 'flat'    → the flat dollar amount (selling_commission_flat).
 *               Used for referrals and any flat-fee deal.
 * - 'percent' → sale_price × selling_commission_pct.
 *               The default, and how every legacy row (commission_type null)
 *               is treated.
 */
export function txnGross(txn) {
  if (!txn) return 0
  if (txn.commission_type === 'flat') {
    return Number(txn.selling_commission_flat || 0)
  }
  return Number(txn.sale_price || 0) * (Number(txn.selling_commission_pct || 0) / 100)
}

/**
 * Calculate commission for a transaction_agent row
 * @param {object} txn - transaction record
 * @param {object} ta - transaction_agents row (with split_value, split_type, volume_pct, plan)
 * @param {object} plan - the plan record
 * @param {number} brokerPaidYTD - running broker total for this agent this year (for cap)
 */
export function calcCommission(txn, ta, plan, brokerPaidYTD = 0, isPrimary = true) {
  // If locked values exist (closed txn), use them directly
  if (ta?.locked_agent_net !== null && ta?.locked_agent_net !== undefined) {
    return {
      gross:            ta.locked_gross,
      pct:              ta.locked_agent_pct,
      agent_gross:      ta.locked_agent_gross,
      agent_net:        ta.locked_agent_net,
      broker_net:       ta.locked_broker_net,
      admin_fee:        ta.locked_admin_fee,
      admin_fee_payer:  ta.locked_admin_fee_payer,
    }
  }

  // --- Compute gross for this agent's split ---
  // txnGross honors commission_type: percent (sale_price × pct) or flat
  // (selling_commission_flat, used for referrals). Everything downstream —
  // split %, cap tiers, admin fee, locking — is unchanged.
  const totalGross = txnGross(txn)
  let agentGross = totalGross

  if (ta) {
    if (ta.split_type === 'percent') {
      agentGross = totalGross * (ta.split_value / 100)
    } else if (ta.split_type === 'dollar') {
      agentGross = ta.split_value
    }
  }

  if (!plan) {
    return {
      gross: agentGross,
      pct: 100,
      agent_gross: agentGross,
      agent_net: agentGross,
      broker_net: 0,
      admin_fee: 0,
      admin_fee_payer: 'client',
    }
  }

  // --- Admin fee --- only charged once per transaction (primary agent only)
  const feeItem = (plan.fees || []).find(f => f.name === 'Admin Fee')
  const adminFeePayer = ta?.locked_admin_fee_payer || txn.admin_fee_payer || feeItem?.payer || 'client'
  // When waived, admin fee is $0 regardless of plan amount
  const adminFee = (adminFeePayer === 'waived') ? 0 : (isPrimary ? (feeItem?.amt || 0) : 0)

  // --- Determine agent split % ---
  let agentPct = 100
  let brokerNet = 0
  let agentNet = agentGross

  if (plan.type === 'flat') {
    agentPct = plan.agent_pct || 80
    const brokerShare = agentGross * ((100 - agentPct) / 100)
    agentNet = agentGross * (agentPct / 100)
    brokerNet = brokerShare

  } else if (plan.type === 'cap') {
    const cap = plan.cap_amount || 10000
    const levels = plan.cap_levels || []
    const capRemaining = Math.max(0, cap - brokerPaidYTD)

    if (capRemaining <= 0) {
      // Post-cap: agent gets 100%
      agentPct = 100
      agentNet = agentGross
      brokerNet = 0
    } else {
      // Find which level we're in
      const level = levels.find(l => brokerPaidYTD >= l.from && (l.to === null || brokerPaidYTD < l.to))
        || levels[0]
      agentPct = level?.pct || 90
      const brokerRate = (100 - agentPct) / 100
      const preCap = agentGross * brokerRate

      if (preCap <= capRemaining) {
        brokerNet = preCap
        agentNet = agentGross - preCap
      } else {
        // Straddles cap
        brokerNet = capRemaining
        const brokerPortion = capRemaining / brokerRate
        const postCapPortion = agentGross - brokerPortion
        agentNet = agentGross - capRemaining
      }
    }
  }

  // Apply admin fee payer adjustments
  // 'waived' = $0 fee, no adjustment to anyone's share
  // 'client' = added to gross, no impact on agent or broker shares
  if (adminFeePayer === 'agent') {
    agentNet -= adminFee
  } else if (adminFeePayer === 'broker') {
    brokerNet -= adminFee
  }

  return {
    gross: agentGross,
    pct: agentPct,
    agent_gross: agentGross,
    agent_net: agentNet,
    broker_net: Math.max(0, brokerNet),
    admin_fee: adminFee,
    admin_fee_payer: adminFeePayer,
  }
}

/**
 * Get cap progress for an agent from their closed transaction_agents rows.
 * Callers should pre-filter `closedRows` to the current cap window using
 * filterRowsToCapWindow().
 *
 * Returns an object that exposes BOTH the actual paid total (which may
 * exceed the cap on a straddle deal) AND a clamped value for progress bars.
 *
 * - paid:         true total paid this period (CAN exceed cap)
 * - paid_clamped: paid capped at capAmount (for progress bars)
 * - overage:      max(0, paid - cap) — how much over the cap they went
 * - cap:          the cap amount
 * - remaining:    max(0, cap - paid) — how much room is left
 * - pct:          paid as a % of cap, capped at 100 (for progress bars)
 * - hit:          whether they've reached or passed the cap
 */
export function getCapProgress(closedRows, capAmount) {
  if (!capAmount) return null
  const paid = closedRows.reduce((s, r) => s + (r.locked_broker_net || 0), 0)
  const capped = Math.min(paid, capAmount)
  return {
    paid:         paid,
    paid_clamped: capped,
    cap:          capAmount,
    remaining:    Math.max(0, capAmount - paid),
    overage:      Math.max(0, paid - capAmount),
    pct:          Math.min(100, capAmount > 0 ? (paid / capAmount) * 100 : 0),
    hit:          paid >= capAmount,
  }
}

export function licenseStatus(expDate) {
  if (!expDate) return 'unknown'
  const now = new Date()
  const exp = new Date(expDate)
  const days = Math.floor((exp - now) / 86400000)
  if (days < 0) return 'expired'
  if (days < 30) return 'critical'
  if (days < 90) return 'warning'
  return 'ok'
}

export function statusBadge(status) {
  const map = {
    active:    ['badge-green',  'Active'],
    pending:   ['badge-amber',  'Pending'],
    closed:    ['badge-navy',   'Closed'],
    cancelled: ['badge-red',    'Cancelled'],
    paid:      ['badge-green',  'Paid'],
    unpaid:    ['badge-amber',  'Unpaid'],
    inactive:  ['badge-grey',   'Inactive'],
    archived:  ['badge-grey',   'Archived'],
    complete:  ['badge-green',  'Complete'],
    in_progress: ['badge-amber','In Progress'],
    not_started: ['badge-grey', 'Not Started'],
    held:      ['badge-amber',  'Held'],
    released:  ['badge-green',  'Released'],
  }
  const [cls, label] = map[status] || ['badge-grey', status]
  return <span className={`badge ${cls}`}>{label}</span>
}

// ══════════════════════════════════════════════════════════════════════
// ROLLOVER WINDOW LOGIC
// ══════════════════════════════════════════════════════════════════════
//
// All cap math depends on knowing how much broker_net the agent has paid
// "this period." The period boundaries depend on the plan's rollover_type.
//
// computeCapWindow returns { windowStart, windowEnd } as Date objects.
// Any closed transaction with close_date in [windowStart, windowEnd]
// counts toward the agent's broker_paid for this period.
//
// loadBrokerPaidYTD does the Supabase query against that window and
// returns the sum of locked_broker_net.
//
// filterRowsToCapWindow is for cases where the caller already has the
// transaction_agents rows in memory (Dashboard, AgentDashboard, AgentDetail)
// and just needs to filter to the current cap window.
//
// Defensive behavior: if any required date is missing (e.g. agent has
// no start_date but plan is rollover_type='start_date'), falls back to
// calendar_year with a console.warn so the page still works and the
// missing data is visible to the developer.

/**
 * Compute the cap rollover window for a plan + agent at a given date.
 * @param {object} plan         - plan record (must have rollover_type; may have rollover_date)
 * @param {object} agent        - agent record (may have start_date)
 * @param {Date|string} asOf    - the date we're evaluating around (typically close_date)
 * @returns {{windowStart: Date, windowEnd: Date, rolloverType: string}}
 */
export function computeCapWindow(plan, agent, asOf) {
  const asOfDate = (asOf instanceof Date) ? asOf : new Date(asOf)
  if (!asOfDate || isNaN(asOfDate.getTime())) {
    // Garbage asOf — return calendar year of today as a safe default
    const y = new Date().getFullYear()
    return { windowStart: new Date(y, 0, 1), windowEnd: new Date(y, 11, 31, 23, 59, 59), rolloverType: 'calendar_year' }
  }

  const rolloverType = plan?.rollover_type || 'calendar_year'

  // Helper: the most recent occurrence of (month, day) on or before asOfDate.
  function lastAnniversaryOnOrBefore(month /* 0-11 */, day, refDate) {
    const y = refDate.getFullYear()
    let candidate = new Date(y, month, day)
    if (candidate > refDate) {
      candidate = new Date(y - 1, month, day)
    }
    return candidate
  }

  function addYears(d, n) {
    return new Date(d.getFullYear() + n, d.getMonth(), d.getDate())
  }

  function lastDayOfMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0, 23, 59, 59)
  }

  switch (rolloverType) {
    case 'start_date': {
      const start = agent?.start_date ? new Date(agent.start_date) : null
      if (!start || isNaN(start.getTime())) {
        console.warn(`[cap window] Plan uses rollover_type='start_date' but agent has no start_date. Falling back to calendar_year.`, { agent })
        return computeCapWindow({ ...plan, rollover_type: 'calendar_year' }, agent, asOfDate)
      }
      const anniv = lastAnniversaryOnOrBefore(start.getMonth(), start.getDate(), asOfDate)
      const windowEnd = new Date(addYears(anniv, 1).getTime() - 1)
      return { windowStart: anniv, windowEnd, rolloverType }
    }

    case 'custom_date': {
      const rollover = plan?.rollover_date ? new Date(plan.rollover_date) : null
      if (!rollover || isNaN(rollover.getTime())) {
        console.warn(`[cap window] Plan uses rollover_type='custom_date' but has no rollover_date. Falling back to calendar_year.`, { plan })
        return computeCapWindow({ ...plan, rollover_type: 'calendar_year' }, agent, asOfDate)
      }
      const anniv = lastAnniversaryOnOrBefore(rollover.getMonth(), rollover.getDate(), asOfDate)
      const windowEnd = new Date(addYears(anniv, 1).getTime() - 1)
      return { windowStart: anniv, windowEnd, rolloverType }
    }

    case 'calendar_year': {
      const y = asOfDate.getFullYear()
      return { windowStart: new Date(y, 0, 1), windowEnd: new Date(y, 11, 31, 23, 59, 59), rolloverType }
    }

    case 'monthly': {
      const y = asOfDate.getFullYear()
      const m = asOfDate.getMonth()
      return { windowStart: new Date(y, m, 1), windowEnd: lastDayOfMonth(y, m), rolloverType }
    }

    case 'rolling':
    case 'rolling_rollover': {
      const windowEnd = asOfDate
      const windowStart = new Date(asOfDate.getFullYear() - 1, asOfDate.getMonth(), asOfDate.getDate() + 1)
      return { windowStart, windowEnd, rolloverType: 'rolling' }
    }

    case 'none': {
      return { windowStart: new Date(0), windowEnd: asOfDate, rolloverType }
    }

    default: {
      console.warn(`[cap window] Unknown rollover_type='${rolloverType}'. Falling back to calendar_year.`)
      const y = asOfDate.getFullYear()
      return { windowStart: new Date(y, 0, 1), windowEnd: new Date(y, 11, 31, 23, 59, 59), rolloverType: 'calendar_year' }
    }
  }
}

/**
 * Format a cap window for display in a UI subtitle.
 * Example: "Mar 15, 2026 – Mar 14, 2027"
 */
export function formatCapWindow(plan, agent, asOf = new Date()) {
  const { windowStart, windowEnd } = computeCapWindow(plan, agent, asOf)
  const opts = { month: 'short', day: 'numeric', year: 'numeric' }
  return windowStart.toLocaleDateString('en-US', opts) + ' – ' + windowEnd.toLocaleDateString('en-US', opts)
}

/**
 * Filter a pre-loaded list of transaction_agent rows down to only those
 * whose linked transaction.close_date falls inside the agent's current
 * cap window for the given plan.
 *
 * Each row must include nested `transactions.close_date` and `transactions.status`.
 * Only rows with status='closed' AND close_date inside the window pass through.
 *
 * Use this on Dashboard / AgentDashboard / AgentDetail where the rows are
 * already in memory and you want to compute cap progress without an extra
 * Supabase round-trip.
 */
export function filterRowsToCapWindow(rows, plan, agent, asOf = new Date()) {
  if (!rows || rows.length === 0) return []
  const { windowStart, windowEnd } = computeCapWindow(plan, agent, asOf)
  return rows.filter(r => {
    const t = r.transactions
    if (!t) return false
    if (t.status !== 'closed') return false
    if (!t.close_date) return false
    const d = new Date(t.close_date)
    return d >= windowStart && d <= windowEnd
  })
}

/**
 * Sum an agent's net commission YTD across a pre-filtered list of rows.
 * Reads locked_agent_net when present (the immutable, correct value for
 * closed deals). Falls back to calcCommission for any row that's not
 * locked (shouldn't happen for closed deals, but degrades safely).
 */
export function sumAgentNetYTD(rows) {
  if (!rows) return 0
  return rows.reduce((s, ta) => {
    if (ta.locked_agent_net !== null && ta.locked_agent_net !== undefined) {
      return s + Number(ta.locked_agent_net || 0)
    }
    // Fallback for rows missing locked values (defensive — closed deals
    // should always have them)
    const t = ta.transactions
    if (!t) return s
    const c = calcCommission(t, ta, ta.plans || null, 0, true)
    return s + (c?.agent_net || 0)
  }, 0)
}

/**
 * Load the broker_paid total for an agent over their plan's current cap window.
 * @param {object}  supabase     - supabase client
 * @param {string}  agentId      - the agent's UUID
 * @param {object}  plan         - plan record (provides rollover_type and rollover_date)
 * @param {object}  agent        - agent record (provides start_date)
 * @param {Date|string} asOf     - date to evaluate the window around (default: now)
 * @param {string?} excludeTxnId - optional transaction id to exclude
 * @returns {Promise<number>}    - total locked_broker_net for closed deals in window
 */
export async function loadBrokerPaidYTD(supabase, agentId, plan, agent, asOf = new Date(), excludeTxnId = null) {
  const { windowStart, windowEnd } = computeCapWindow(plan, agent, asOf)
  const startStr = windowStart.toISOString().slice(0, 10)
  const endStr   = windowEnd.toISOString().slice(0, 10)

  let query = supabase
    .from('transaction_agents')
    .select('locked_broker_net,transactions!inner(status,close_date,id)')
    .eq('agent_id', agentId)
    .eq('transactions.status', 'closed')
    .gte('transactions.close_date', startStr)
    .lte('transactions.close_date', endStr)

  if (excludeTxnId) {
    query = query.neq('transactions.id', excludeTxnId)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[loadBrokerPaidYTD] Supabase query failed:', error)
    return 0
  }
  return (data || []).reduce((s, r) => s + (r.locked_broker_net || 0), 0)
}
