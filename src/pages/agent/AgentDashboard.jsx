import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmt$, statusBadge, getCapProgress, licenseStatus } from '../../lib/commission'
import { useAuth } from '../../hooks/useAuth'

export default function AgentDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const agentId = profile?.agent_id

  useEffect(() => {
    if (agentId) load()
  }, [agentId])

  async function load() {
    const thisYear = new Date().getFullYear()

    const [agentRes, txnAgentsRes, disbRes, assignRes] = await Promise.all([
      supabase.from('agents').select('*, plans(*)').eq('id', agentId).single(),
      supabase.from('transaction_agents').select('*, transactions(*)').eq('agent_id', agentId),
      supabase.from('disbursements').select('*, transactions(street_address, city, state, sale_price, selling_commission_pct, close_date, admin_fee_payer)').eq('agent_id', agentId),
      supabase.from('onboard_assignments').select('*, onboard_templates(*)').eq('agent_id', agentId).maybeSingle(),
    ])

    setData({
      agent: agentRes.data,
      txnAgents: txnAgentsRes.data || [],
      disbursements: disbRes.data || [],
      assignment: assignRes.data,
      thisYear,
    })
    setLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner" />Loading…</div>
  if (!data?.agent) return <div className="loading">Agent profile not found. Contact your broker.</div>

  const { agent, txnAgents, disbursements, assignment, thisYear } = data

  const closedRows = txnAgents.filter(ta => ta.transactions?.status === 'closed' && new Date(ta.transactions.close_date).getFullYear() === thisYear)
  const ytdGCI = closedRows.reduce((s, ta) =>
    s + (ta.transactions?.sale_price || 0) * ((ta.transactions?.selling_commission_pct || 0) / 100) * (ta.split_value / 100), 0)

  const cp = agent.plans?.type === 'cap'
    ? getCapProgress(closedRows, agent.plans.cap_amount)
    : null

  const unpaidDisbs = disbursements.filter(d => !d.paid)

  const ls = licenseStatus(agent.license_expiration)

  // Onboarding progress
  let obPct = 0, obDone = 0, obTotal = 0
  if (assignment?.onboard_templates?.items) {
    obTotal = assignment.onboard_templates.items.length
    obDone = (assignment.completed_items || []).length
    obPct = obTotal ? Math.round(obDone / obTotal * 100) : 0
  }

  return (
    <div>
      <div className="sec-hdr">
        <div>
          <div className="sec-title">Welcome, {agent.first_name}</div>
          <div className="sec-sub">{agent.office} Office — {thisYear}</div>
        </div>
      </div>

      {ls !== 'ok' && (
        <div className={`alert-bar ${ls === 'expired' ? 'danger' : ls === 'critical' ? 'danger' : 'warn'}`}>
          {ls === 'expired' ? '🚨 Your license has expired.' : `⚠ Your license expires ${agent.license_expiration} — please renew soon.`}
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-num">{fmt$(ytdGCI)}</div>
          <div className="stat-lbl">My YTD GCI</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{txnAgents.filter(ta => ta.transactions?.status === 'active' || ta.transactions?.status === 'pending').length}</div>
          <div className="stat-lbl">Active Deals</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{unpaidDisbs.length}</div>
          <div className="stat-lbl">Pending Disbursements</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Cap progress */}
        {cp && (
          <div className="card">
            <div className="card-hdr"><span className="card-title">Cap Progress {thisYear}</span></div>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--txt3)' }}>Broker Paid YTD</span>
                <strong>{fmt$(cp.paid)}</strong>
              </div>
              <div className="prog-wrap" style={{ marginBottom: 8 }}>
                <div className={`prog-bar${cp.hit ? ' capped' : ''}`} style={{ width: `${cp.pct}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--txt3)' }}>
                <span>{fmt$(0)}</span><span>Cap: {fmt$(cp.cap)}</span>
              </div>
              {cp.hit && <div className="alert-bar success" style={{ marginTop: 12 }}>🎯 Cap hit! You're at 100% split.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                <div style={{ textAlign: 'center', padding: 10, background: 'var(--teal-lt)', borderRadius: 'var(--r)' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)' }}>{fmt$(cp.paid)}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)' }}>Paid to Broker</div>
                </div>
                <div style={{ textAlign: 'center', padding: 10, background: 'var(--surf)', borderRadius: 'var(--r)' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{fmt$(cp.remaining)}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)' }}>Remaining</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Onboarding */}
        {assignment && (
          <div className="card">
            <div className="card-hdr">
              <span className="card-title">Onboarding</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/my-onboarding')}>View Checklist →</button>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--txt3)' }}>{assignment.onboard_templates?.name}</span>
                <span style={{ fontWeight: 700, color: obPct === 100 ? 'var(--green)' : 'var(--amber)' }}>{obPct}%</span>
              </div>
              <div className="prog-wrap">
                <div className={`prog-bar${obPct === 100 ? ' capped' : ''}`} style={{ width: `${obPct}%` }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 6 }}>{obDone} of {obTotal} items complete</div>
            </div>
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-hdr">
          <span className="card-title">My Transactions</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/my-transactions')}>View All</button>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Property</th><th>Type</th><th>Close Date</th><th>My Split</th><th>Status</th></tr>
            </thead>
            <tbody>
              {txnAgents.slice(0, 6).map(ta => {
                const t = ta.transactions
                if (!t) return null
                const myGross = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100) * (ta.split_value / 100)
                return (
                  <tr key={ta.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/my-transactions/${t.id}`)}>
                    <td><span className="tbl-link">{t.street_address}, {t.city}</span></td>
                    <td><span className="badge badge-navy">{t.type}</span></td>
                    <td>{t.close_date || '—'}</td>
                    <td style={{ color: 'var(--teal)', fontWeight: 600 }}>{fmt$(myGross)}</td>
                    <td>{statusBadge(t.status)}</td>
                  </tr>
                )
              })}
              {txnAgents.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--txt3)', padding: 20 }}>No transactions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
