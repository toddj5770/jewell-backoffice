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
      .select('*, transactions(street_address,city,state,sale_price,selling_commission_pct,close_date,admin_fee_payer,deductions_withheld,type,transaction_agents(*,agents(first_name,last_name),plans(*))), agents(first_name,last_name)')
      .order('created_at', { ascending: false })
    setDisbs(data || [])
    setLoading(false)
  }

  async function markPaid(id) {
    await supabase.from('disbursements').update({ paid: true, paid_date: new Date().toISOString().slice(0,10) }).eq('id', id)
    await load()
  }

  const filtered = disbs.filter(d => filter === 'all' || (filter === 'paid' ? d.paid : !d.paid))

  const totalPaid = disbs.filter(d=>d.paid).reduce((s,d) => {
    const t = d.transactions; if(!t) return s
    return s + (t.sale_price||0)*((t.selling_commission_pct||0)/100)
  }, 0)
  const totalUnpaid = disbs.filter(d=>!d.paid).reduce((s,d) => {
    const t = d.transactions; if(!t) return s
    return s + (t.sale_price||0)*((t.selling_commission_pct||0)/100)
  }, 0)

  if (loading) return <div className="loading"><div className="spinner"/>Loading…</div>

  return (
    <div>
      <div className="sec-hdr">
        <div><div className="sec-title">Disbursements</div><div className="sec-sub">Commission payments to agents</div></div>
      </div>
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:18}}>
        <div className="stat-card"><div className="stat-num">{disbs.length}</div><div className="stat-lbl">Total Disbursements</div></div>
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
                const ta = isCombined
                  ? t.transaction_agents?.[0]
                  : t.transaction_agents?.find(ta => ta.agent_id === d.agent_id)
                const plan = ta?.plans || null
                const comm = ta ? calcCommission(t, ta, plan, 0) : null
                const agentNet = comm ? comm.agent_net - (t.deductions_withheld||0) : 0
                const agentName = isCombined
                  ? (t.transaction_agents||[]).map(ta=>ta.agents?.first_name).filter(Boolean).join(' + ')
                  : d.agents ? `${d.agents.first_name} ${d.agents.last_name}` : '—'
                return (
                  <tr key={d.id} style={{cursor:'pointer'}} onClick={()=>navigate(`/transactions/${d.transaction_id}`)}>
                    <td><span className="tbl-link">{t.street_address}</span><div style={{fontSize:11,color:'var(--txt3)'}}>{t.city}, {t.state}</div></td>
                    <td><span className="badge badge-navy" style={{fontSize:9}}>{isCombined?'Combined':'Individual'}</span></td>
                    <td style={{fontSize:12}}>{agentName}</td>
                    <td style={{color:'var(--txt2)'}}>{t.close_date}</td>
                    <td style={{color:'var(--teal)',fontWeight:700}}>{fmt$(agentNet)}</td>
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
