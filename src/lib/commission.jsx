// Commission calculation logic — mirrors the HTML prototype exactly

export function fmt$(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPct(n) {
  return Number(n || 0).toFixed(1) + '%'
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
  const totalGross = (txn.sale_price || 0) * ((txn.selling_commission_pct || 0) / 100)
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
  const adminFee = isPrimary ? (feeItem?.amt || 0) : 0
  const adminFeePayer = ta?.locked_admin_fee_payer || txn.admin_fee_payer || feeItem?.payer || 'client'

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
 * Get cap progress for an agent from their closed transaction_agents rows
 */
export function getCapProgress(closedRows, capAmount) {
  if (!capAmount) return null
  const paid = closedRows.reduce((s, r) => s + (r.locked_broker_net || 0), 0)
  const capped = Math.min(paid, capAmount)
  return {
    paid: capped,
    cap: capAmount,
    remaining: Math.max(0, capAmount - capped),
    pct: Math.min(100, (capped / capAmount) * 100),
    hit: paid >= capAmount,
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
