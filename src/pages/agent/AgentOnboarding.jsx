import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function AgentOnboarding() {
  const { profile } = useAuth()
  const [assignment, setAssignment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if(profile?.agent_id) load() }, [profile])

  async function load() {
    const { data } = await supabase
      .from('onboard_assignments')
      .select('*, onboard_templates(*)')
      .eq('agent_id', profile.agent_id)
      .maybeSingle()
    setAssignment(data)
    setLoading(false)
  }

  async function toggleItem(itemId) {
    if (!assignment) return
    setSaving(true)
    const completed = assignment.completed_items || []
    const updated = completed.includes(itemId)
      ? completed.filter(id => id !== itemId)
      : [...completed, itemId]
    await supabase.from('onboard_assignments').update({ completed_items: updated }).eq('id', assignment.id)
    setAssignment(a => ({ ...a, completed_items: updated }))
    setSaving(false)
  }

  if (loading) return <div className="loading"><div className="spinner"/>Loading…</div>
  if (!assignment) return <div style={{padding:40,textAlign:'center',color:'var(--txt3)'}}>No onboarding template assigned. Contact your broker.</div>

  const tmpl = assignment.onboard_templates
  const completed = assignment.completed_items || []
  const pct = tmpl?.items?.length ? Math.round(completed.length / tmpl.items.length * 100) : 0

  const grouped = {}
  ;(tmpl?.items || []).forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  })

  return (
    <div>
      <div className="sec-hdr"><div><div className="sec-title">Onboarding Checklist</div><div className="sec-sub">{tmpl?.name}</div></div></div>
      <div className="card" style={{marginBottom:18}}>
        <div className="card-body">
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:13,fontWeight:600}}>Overall Progress</span>
            <span style={{fontWeight:700,color:pct===100?'var(--green)':'var(--amber)'}}>{pct}%</span>
          </div>
          <div className="prog-wrap" style={{height:14,marginBottom:8}}><div className={`prog-bar${pct===100?' capped':''}`} style={{width:`${pct}%`}}/></div>
          <div style={{fontSize:11,color:'var(--txt3)'}}>{completed.length} of {tmpl?.items?.length||0} items complete</div>
          {pct===100&&<div className="alert-bar success" style={{marginTop:12}}>🎉 Onboarding complete!</div>}
        </div>
      </div>
      <div className="card">
        <div style={{padding:0}}>
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div style={{padding:'10px 16px',background:'var(--surf)',borderBottom:'1px solid var(--bdr)',display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--txt3)'}}>{cat}</span>
                <span style={{fontSize:10,color:'var(--txt3)'}}>{items.filter(i=>completed.includes(i.id)).length}/{items.length}</span>
              </div>
              {items.map(item => {
                const done = completed.includes(item.id)
                return (
                  <div key={item.id} onClick={()=>!saving&&toggleItem(item.id)}
                    style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 16px',borderBottom:'1px solid var(--bdr)',cursor:'pointer',transition:'background .1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--surf)'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <div style={{width:22,height:22,borderRadius:'50%',border:`2px solid ${done?'var(--teal)':'var(--bdr)'}`,background:done?'var(--teal)':'white',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>
                      {done&&<svg width="12" height="12" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,color:done?'var(--txt3)':'var(--navy)',textDecoration:done?'line-through':'none'}}>{item.title}</div>
                      {item.notes&&<div style={{fontSize:11,color:'var(--txt3)',marginTop:2}}>{item.notes}</div>}
                    </div>
                    <span className={`badge ${item.required?'badge-navy':'badge-grey'}`} style={{fontSize:9}}>{item.required?'Required':'Optional'}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
