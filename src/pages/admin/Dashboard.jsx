import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmt$, calcCommission, licenseStatus, statusBadge, getCapProgress, filterRowsToCapWindow, formatCapWindow, txnGross } from '../../lib/commission'

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const thisYear = new Date().getFullYear()

    const [txns, agents, disbs, plans] = await Promise.all([
      supabase.from('transactions').select('*, transaction_agents(*)'),
      supabase.from('agents').select('*, plans(*)'),
      supabase.from('disbursements').select('*, transactions(sale_price, selling_commission_pct, admin_fee_payer, deductions_withheld, transaction_agents(*, plans(*)))'),
      supabase.from('plans').select('*'),
    ])

    setData({
      transactions: txns.data || [],
      agents: agents.data || [],
      disbursements: disbs.data || [],
      plans: plans.data || [],
      thisYear,
    })
    setLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner" />Loading dashboard…</div>

  const { transactions, agents, disbursements, thisYear } = data

  const closed = transactions.filter(t => t.status === 'closed')
  const active = transactions.filter(t => t.status === 'active')
  const pending = transactions.filter(t => t.status === 'pending')

  // YTD GCI — still calendar year, since this is a brokerage-wide metric, not per-agent cap
  const ytdClosed = closed.filter(t => t.close_date && new Date(t.close_date).getFullYear() === thisYear)
  const ytdGCI = ytdClosed.reduce((s, t) => s + txnGross(t), 0)

  // ── Pending disbursements ─────────────────────────────────────────────
  // Mirror Money.jsx exactly so the two screens never disagree.
  // (1) Amount owed on a row is the AGENT NET, read from the immutable
  //     locked_agent_net on closed deals — NOT the full deal GCI.
  // (2) Combined rows (agent_id === null) are hidden whenever Individual
  //     rows exist for the same transaction, because payment is marked on
  //     the Individual rows; counting the Combined row too would resurrect
  //     fully-paid deals as "pending."
  function rowAmount(d) {
    const t = d.transactions
    if (!t) return 0
    const isCombined = d.agent_id === null
    const tas = t.transaction_agents || []
    const deduct = t.deductions_withheld || 0

    function netFor(ta) {
      // Prefer locked value on closed deals (immutable source of truth)
      if (ta.locked_agent_net !== null && ta.locked_agent_net !== undefined) {
        return Number(ta.locked_agent_net) || 0
      }
      // Fallback: recompute (open/unlocked deals only)
      const comm = calcCommission(t, ta, ta.plans || null, 0, tas.indexOf(ta) === 0)
      return comm?.agent_net || 0
    }

    if (isCombined) {
      return tas.reduce((s, ta) => s + netFor(ta), 0) - deduct
    }
    const ta = tas.find(x => x.agent_id === d.agent_id)
    if (!ta) return 0
    return netFor(ta) - deduct
  }

  const txnHasIndividual = new Set(
    disbursements.filter(d => d.agent_id !== null).map(d => d.transaction_id)
  )
  const visibleDisbs = disbursements.filter(d => {
    if (d.agent_id === null && txnHasIndividual.has(d.transaction_id)) return false
    return true
  })

  const unpaidTotal = visibleDisbs
    .filter(d => !d.paid)
    .reduce((s, d) => s + rowAmount(d), 0)

  // License alerts
  const licAlerts = agents.filter(a => {
    const s = licenseStatus(a.license_expiration)
    return s === 'expired' || s === 'critical' || s === 'warning'
  })

  // Active agents with cap plans
  const capAgents = agents.filter(a => a.plans?.type === 'cap' && a.status === 'active')

  // Resolve agent_id -> "First Last" for display (agents already loaded)
  const agentName = (id) => {
    const a = agents.find(x => x.id === id)
    return a ? `${a.first_name} ${a.last_name}` : id
  }

  return (
    <div>
      <div className="sec-hdr">
        <div>
          <div className="sec-title">Dashboard</div>
          <div className="sec-sub">Jewell Real Estate — {thisYear} Overview</div>
        </div>
        <button className="btn btn-gold" onClick={() => navigate('/transactions/new')}>+ New Transaction</button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/transactions?status=closed')}>
          <div className="stat-num">{fmt$(ytdGCI)}</div>
          <div className="stat-lbl">YTD GCI</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/transactions?status=active')}>
          <div className="stat-num">{active.length}</div>
          <div className="stat-lbl">Active Deals</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/transactions?status=pending')}>
          <div className="stat-num">{pending.length}</div>
          <div className="stat-lbl">Under Contract</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/money')}>
          <div className="stat-num">{fmt$(unpaidTotal)}</div>
          <div className="stat-lbl">Pending Disbursements</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Cap Progress — windowed per agent's plan rollover */}
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">Cap Progress</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {capAgents.length === 0 && (
              <div style={{ padding: 20, color: 'var(--txt3)', fontSize: 12 }}>No agents on cap plans.</div>
            )}
            {capAgents.map(agent => {
              const plan = agent.plans
              if (!plan) return null

              // Build agent's transaction_agents rows with their parent transactions,
              // so we can use filterRowsToCapWindow exactly like the other pages.
              const allRows = transactions.flatMap(t =>
                (t.transaction_agents || [])
                  .filter(ta => ta.agent_id === agent.id)
                  .map(ta => ({ ...ta, transactions: t }))
              )
              const rowsInWindow = filterRowsToCapWindow(allRows, plan, agent, new Date())
              const cp = getCapProgress(rowsInWindow, plan.cap_amount)
              if (!cp) return null

              const windowLabel = formatCapWindow(plan, agent, new Date())

              return (
                <div
                  key={agent.id}
                  style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', cursor: 'pointer' }}
                  onClick={() => navigate(`/agents/${agent.id}`)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{agent.first_name} {agent.last_name}</span>
                    <span style={{ fontSize: 11, color: cp.hit ? 'var(--gold)' : 'var(--txt3)' }}>
                      {cp.overage > 0
                        ? `🎯 Capped + ${fmt$(cp.overage)} over`
                        : cp.hit
                          ? '🎯 Capped'
                          : `${fmt$(cp.remaining)} remaining`}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 6 }}>{windowLabel}</div>
                  <div className="prog-wrap">
                    <div className={`prog-bar${cp.hit ? ' capped' : ''}`} style={{ width: `${cp.pct}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>
                    <span>{fmt$(cp.paid)} paid</span>
                    <span>Cap: {fmt$(cp.cap)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* License Alerts */}
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">License Alerts</span>
            <span className="badge badge-red">{licAlerts.length}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {licAlerts.length === 0 && (
              <div style={{ padding: 20, color: 'var(--txt3)', fontSize: 12 }}>✓ All licenses current</div>
            )}
            {licAlerts.map(agent => {
              const ls = licenseStatus(agent.license_expiration)
              return (
                <div
                  key={agent.id}
                  style={{ padding: '10px 16px', borderBottom: '1px solid var(--bdr)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onClick={() => navigate(`/agents/${agent.id}`)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{agent.first_name} {agent.last_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Exp: {agent.license_expiration}</div>
                  </div>
                  <span className={`badge ${ls === 'expired' ? 'badge-red' : ls === 'critical' ? 'badge-red' : 'badge-amber'}`}>
                    {ls === 'expired' ? 'EXPIRED' : ls === 'critical' ? '< 30 days' : '< 90 days'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Recent closed transactions */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-hdr">
          <span className="card-title">Recent Closings</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/transactions?status=closed')}>View All</button>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Property</th>
                <th>Close Date</th>
                <th>Sale Price</th>
                <th>GCI</th>
                <th>Agent(s)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {closed.slice(0, 8).map(t => {
                const gci = txnGross(t)
                const agentNames = (t.transaction_agents || []).map(ta => agentName(ta.agent_id)).join(', ')
                return (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/transactions/${t.id}`)}>
                    <td><span className="tbl-link">{t.street_address ? `${t.street_address}, ${t.city}` : (t.client_name || '—')}</span></td>
                    <td>{t.close_date}</td>
                    <td>{fmt$(t.sale_price)}</td>
                    <td>{fmt$(gci)}</td>
                    <td style={{ fontSize: 11, color: 'var(--txt3)' }}>{agentNames || '—'}</td>
                    <td>{statusBadge('closed')}</td>
                  </tr>
                )
              })}
              {closed.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--txt3)', padding: 20 }}>No closed transactions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
