import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmt$, calcCommission, statusBadge } from '../../lib/commission'

export default function Money() {
  const navigate = useNavigate()
  const [disbs, setDisbs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, unpaid, paid

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('disbursements')
      .select('*, transactions(street_address,city,state,sale_price,selling_commission_pct,close_date,admin_fee_payer,deductions_withheld,type,status,transaction_agents(*,agents(first_name,last_name),plans(*))), agents(first_name,last_name)')
      .order('created_at', { ascending: false })
    setDisbs(data || [])
    setLoading(false)
  }

  async function markPaid(id) {
    await supabase.from('disbursements').update({ paid: true, paid_date: new Date().toISOString().slice(0,10) }).eq('id', id)
    await load()
  }

  // ── Derive the amount that should appear on a disbursement row ────────
  // For closed deals this reads locked_agent_net from transaction_agents
  // (the immutable source of truth). For pre-close or unlocked rows it
  // falls back to calcCommission. The combined row sums every agent on
  // the deal; individual rows show just that agent's net.
  function rowAmount(d) {
    const t = d.transactions
    if (!t) return 0
    const isCombined = d.agent_id === null
    const tas = t.transaction_agents || []
    const deduct = t.deductions_withheld || 0

    function netFor(ta) {
      // Prefer locked value on closed deals (immutable)
      if (ta.locked_agent_net !== null && ta.locked_agent_net !== undefined) {
        return Number(ta.locked_agent_net) || 0
      }
      // Fallback: recompute (open/unlocked deals only)
      const comm = calcCommission(t, ta, ta.plans || null, 0, tas.indexOf(ta) === 0)
      return comm?.agent_net || 0
    }

    if (isCombined) {
      // Combined row = sum of every agent's net on the deal
      return tas.reduce((s, ta) => s + netFor(ta), 0) - deduct
    }
    const ta = tas.find(x => x.agent_id === d.agent_id)
    if (!ta) return 0
    return netFor(ta) - deduct
  }

  // ── Hide redundant Combined rows ──────────────────────────────────────
  // For each transaction_id, if any Individual disbursement rows exist,
  // hide the Combined row (it would double-count). Keep Combined rows
  // only when no Individuals exist (single-agent deals).
  const txnHasIndividual = new Set(
    disbs.filter(d => d.agent_id !== null).map(d => d.transaction_id)
  )
  const visibleDisbs = disbs.filter(d => {
    if (d.agent_id === null && txnHasIndividual.has(d.transaction_id)) return false
    return true
  })

  const filtered = visibleDisbs.filter(d => filter === 'all' || (filter === 'paid' ? d.paid : !d.paid))

  // Totals run on the visible (deduplicated) set so a deal is never counted twice
  const totalPaid = visibleDisbs.filter(d => d.paid).reduce((s, d) => s + rowAmount(d), 0)
  const totalUnpaid = visibleDisbs.filter(d => !d.paid).reduce((s, d) => s + rowAmount(d), 0)

  if (loading) return <div className="loading"><div className="spinner"/>Loading…</div>

  return (
    <div>
      <div className="sec-hdr">
        <div><div className="sec-title">Disbursements</div><div className="sec-sub">Commission payments to agents</div></div>
      </div>
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:18}}>
        <div className="stat-card"><div className="stat-num">{visibleDisbs.length}</div><div className="stat-lbl">Total Disbursements</div></div>
        <div className="stat-card"><div className="stat-num" style={{color:'var(--amber)'}}>{fmt$(totalUnpaid)}</div><div className="stat-lbl">Pending Payment</div></div>
        <div className="stat-card"><div className="stat-num" style={{color:'var(--green)'}}>{fmt$(totalPaid)}</div><div className="stat-lbl">Total Paid</div></div>
      </div>
      <div style={{marginBottom:14}}>
        {['all','unpaid','paid'].map(f=>(
          <button key={f} className={`btn ${filter===f?'btn-navy':'btn-ghost'}`} style={{marginRight:6,textTransform:'capitalize'}} onClick={()=>setFilter(f)}>{f}</button>
        ))}
      </div>
      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Property</th><th>Type</th><th>Agent</th><th>Close Date</th><th>Agent Net</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(d => {
                const t = d.transactions
                if (!t) return null
                const isCombined = d.agent_id === null
                const agentName = isCombined
                  ? (t.transaction_agents||[]).map(ta=>ta.agents?.first_name).filter(Boolean).join(' + ')
                  : d.agents ? `${d.agents.first_name} ${d.agents.last_name}` : '—'
                const amount = rowAmount(d)
                return (
                  <tr key={d.id} style={{cursor:'pointer'}} onClick={()=>navigate(`/transactions/${d.transaction_id}`)}>
                    <td><span className="tbl-link">{t.street_address}</span><div style={{fontSize:11,color:'var(--txt3)'}}>{t.city}, {t.state}</div></td>
                    <td><span className="badge badge-navy" style={{fontSize:9}}>{isCombined?'Combined':'Individual'}</span></td>
                    <td style={{fontSize:12}}>{agentName}</td>
                    <td style={{color:'var(--txt2)'}}>{t.close_date}</td>
                    <td style={{color:'var(--teal)',fontWeight:700}}>{fmt$(amount)}</td>
                    <td>{d.paid?<span className="badge badge-green">Paid</span>:<span className="badge badge-amber">Pending</span>}</td>
                    <td onClick={e=>e.stopPropagation()}>
                      {!d.paid&&<button className="btn btn-teal btn-sm" onClick={()=>markPaid(d.id)}>✓ Mark Paid</button>}
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0&&<tr><td colSpan={7} style={{textAlign:'center',color:'var(--txt3)',padding:30}}>No disbursements.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
