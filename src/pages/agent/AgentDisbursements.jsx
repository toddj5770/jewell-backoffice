import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt$, calcCommission } from '../../lib/commission'
import { useAuth } from '../../hooks/useAuth'

export default function AgentDisbursements() {
  const { profile } = useAuth()
  const [disbs, setDisbs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if(profile?.agent_id) load() }, [profile])

  async function load() {
    const { data } = await supabase
      .from('disbursements')
      .select('*, transactions(street_address,city,state,sale_price,selling_commission_pct,close_date,admin_fee_payer,deductions_withheld,deductions_detail,transaction_agents(*,plans(*)))')
      .eq('agent_id', profile.agent_id)
      .order('created_at', { ascending: false })
    setDisbs(data || [])
    setLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner"/>Loading…</div>

  return (
    <div>
      <div className="sec-hdr"><div><div className="sec-title">My Disbursements</div><div className="sec-sub">Your commission statements</div></div></div>
      {disbs.length === 0 && <div style={{padding:40,textAlign:'center',color:'var(--txt3)'}}>No disbursements yet.</div>}
      {disbs.map(d => {
        const t = d.transactions; if(!t) return null
        const ta = (t.transaction_agents||[]).find(ta=>ta.agent_id===profile.agent_id)
        const plan = ta?.plans||null
        const comm = ta ? calcCommission(t, ta, plan, 0) : null
        const agentNet = comm ? comm.agent_net - (t.deductions_withheld||0) : 0
        return (
          <div key={d.id} className="card" style={{marginBottom:14}}>
            <div className="card-hdr">
              <div>
                <div style={{fontWeight:700,color:'var(--navy)'}}>{t.street_address}, {t.city}, {t.state}</div>
                <div style={{fontSize:11,color:'var(--txt3)'}}>Close Date: {t.close_date}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                {d.paid ? <span className="badge badge-green">Paid</span> : <span className="badge badge-amber">Pending Payment</span>}
              </div>
            </div>
            <div className="card-body">
              <div style={{background:'var(--surf)',borderRadius:'var(--r)',padding:14,border:'1px solid var(--bdr)'}}>
                <div className="fee-row"><span style={{color:'var(--txt2)'}}>Gross Commission (your split)</span><span style={{fontWeight:600}}>{comm?fmt$(comm.gross):'—'}</span></div>
                <div className="fee-row"><span style={{color:'var(--txt2)'}}>Your Split ({comm?`${comm.pct}%`:''})</span><span>{comm?fmt$(comm.agent_gross):'—'}</span></div>
                {(t.deductions_withheld>0) && (t.deductions_detail||[]).map((dd,i)=>(
                  <div key={i} className="fee-row"><span style={{color:'var(--amber)'}}>Expense Withheld: {dd.desc}</span><span style={{color:'var(--amber)'}}>−{fmt$(dd.amount)}</span></div>
                ))}
                <div className="fee-row" style={{borderTop:'2px solid var(--navy)',paddingTop:10,marginTop:4}}>
                  <span style={{fontWeight:700,fontSize:15}}>Your Net Commission</span>
                  <span style={{fontWeight:800,fontSize:20,color:'var(--teal)'}}>{fmt$(agentNet)}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
