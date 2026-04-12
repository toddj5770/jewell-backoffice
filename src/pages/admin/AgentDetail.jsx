import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmt$, licenseStatus, statusBadge, getCapProgress } from '../../lib/commission'

const EMPTY = {first_name:'',last_name:'',email:'',phone_mobile:'',office:'',status:'active',start_date:'',plan_id:'',license_number:'',license_type:'salesperson',license_state:'TN',license_expiration:'',eando_expiration:'',mls_id:'',w9_on_file:false,onboard_status:'not_started'}

export default function AgentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'
  const [agent, setAgent] = useState(EMPTY)
  const [plans, setPlans] = useState([])
  const [settings, setSettings] = useState(null)
  const [txnAgents, setTxnAgents] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(isNew)

  useEffect(() => { loadMeta(); if(!isNew) load() }, [id])

  async function loadMeta() {
    const [pr,sr] = await Promise.all([supabase.from('plans').select('*').eq('status','active'), supabase.from('settings').select('*').single()])
    setPlans(pr.data||[]); setSettings(sr.data)
  }

  async function load() {
    const [ar,tar] = await Promise.all([
      supabase.from('agents').select('*').eq('id',id).single(),
      supabase.from('transaction_agents').select('*,transactions(street_address,city,sale_price,selling_commission_pct,status,close_date)').eq('agent_id',id).order('created_at',{ascending:false})
    ])
    if(ar.data) setAgent(ar.data)
    if(tar.data) setTxnAgents(tar.data)
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    if(!agent.first_name||!agent.email){alert('Name and email required');setSaving(false);return}
    if(isNew){
      const{data,error}=await supabase.from('agents').insert(agent).select().single()
      if(error){alert(error.message);setSaving(false);return}
      setSaving(false); navigate(`/agents/${data.id}`)
    } else {
      await supabase.from('agents').update(agent).eq('id',id)
      setSaving(false); setEditing(false); await load()
    }
  }

  if(loading) return <div className="loading"><div className="spinner"/>Loading…</div>

  const ls = licenseStatus(agent.license_expiration)
  const thisYear = new Date().getFullYear()
  const closedRows = txnAgents.filter(ta=>ta.transactions?.status==='closed'&&new Date(ta.transactions.close_date).getFullYear()===thisYear)
  const plan = plans.find(p=>p.id===agent.plan_id)
  const cp = plan?.type==='cap' ? getCapProgress(closedRows, plan.cap_amount) : null

  return (
    <div>
      <div className="back-btn" onClick={()=>navigate('/agents')}>← Back to Agents</div>
      <div className="sec-hdr">
        <div><div className="sec-title">{isNew?'New Agent':`${agent.first_name} ${agent.last_name}`}</div><div className="sec-sub">{agent.office||''} {!isNew&&<>&nbsp;·&nbsp; {statusBadge(agent.status)}</>}</div></div>
        <div style={{display:'flex',gap:8}}>
          {!isNew&&!editing&&<button className="btn btn-ghost" onClick={()=>setEditing(true)}>✏ Edit</button>}
          {(isNew||editing)&&<><button className="btn btn-ghost" onClick={()=>{if(isNew)navigate('/agents');else setEditing(false)}}>Cancel</button><button className="btn btn-gold" onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</button></>}
        </div>
      </div>

      {ls!=='ok'&&!isNew&&<div className={`alert-bar ${ls==='expired'?'danger':'warn'}`}>{ls==='expired'?'🚨 License EXPIRED':'⚠ License expiring soon'} — {agent.license_expiration}</div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginBottom:18}}>
        <div className="card">
          <div className="card-hdr"><span className="card-title">Contact Info</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group"><label className="form-label">First Name <span className="req">*</span></label><input className="form-ctrl" value={agent.first_name||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,first_name:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Last Name</label><input className="form-ctrl" value={agent.last_name||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,last_name:e.target.value}))}/></div>
            </div>
            <div className="form-group"><label className="form-label">Email <span className="req">*</span></label><input className="form-ctrl" type="email" value={agent.email||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,email:e.target.value}))}/></div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Mobile</label><input className="form-ctrl" value={agent.phone_mobile||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,phone_mobile:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Office</label><select className="form-ctrl" value={agent.office||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,office:e.target.value}))}><option value="">— Select —</option>{(settings?.offices||['Athens','Etowah','Madisonville']).map(o=><option key={o}>{o}</option>)}</select></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Start Date</label><input className="form-ctrl" type="date" value={agent.start_date||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,start_date:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Status</label><select className="form-ctrl" value={agent.status} disabled={!editing} onChange={e=>setAgent(a=>({...a,status:e.target.value}))}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hdr"><span className="card-title">License & Plan</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group"><label className="form-label">License #</label><input className="form-ctrl" value={agent.license_number||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,license_number:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">License Type</label><select className="form-ctrl" value={agent.license_type||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,license_type:e.target.value}))}><option value="salesperson">Salesperson</option><option value="broker_associate">Associate Broker</option><option value="broker">Broker</option></select></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">License Expiration</label><input className="form-ctrl" type="date" value={agent.license_expiration||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,license_expiration:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">E&O Expiration</label><input className="form-ctrl" type="date" value={agent.eando_expiration||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,eando_expiration:e.target.value}))}/></div>
            </div>
            <div className="form-group"><label className="form-label">Commission Plan</label><select className="form-ctrl" value={agent.plan_id||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,plan_id:e.target.value||null}))}><option value="">— No plan —</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">MLS ID</label><input className="form-ctrl" value={agent.mls_id||''} disabled={!editing} onChange={e=>setAgent(a=>({...a,mls_id:e.target.value}))}/></div>
              <div className="form-group" style={{paddingTop:22}}><label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}><input type="checkbox" checked={!!agent.w9_on_file} disabled={!editing} onChange={e=>setAgent(a=>({...a,w9_on_file:e.target.checked}))}/><span>W-9 On File</span></label></div>
            </div>
          </div>
        </div>
      </div>

      {cp&&!isNew&&<div className="card" style={{marginBottom:18}}>
        <div className="card-hdr"><span className="card-title">Cap Progress {thisYear}</span></div>
        <div className="card-body">
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><span style={{color:'var(--txt3)',fontSize:12}}>Broker Paid YTD</span><strong>{fmt$(cp.paid)}</strong></div>
          <div className="prog-wrap" style={{marginBottom:8}}><div className={`prog-bar${cp.hit?' capped':''}`} style={{width:`${cp.pct}%`}}/></div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--txt3)'}}><span>{fmt$(0)}</span><span>Cap: {fmt$(cp.cap)}</span></div>
          {cp.hit&&<div className="alert-bar success" style={{marginTop:12}}>🎯 Cap hit! Agent is at 100% split.</div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}>
            <div style={{textAlign:'center',padding:10,background:'var(--teal-lt)',borderRadius:'var(--r)'}}><div style={{fontSize:18,fontWeight:700,color:'var(--teal)'}}>{fmt$(cp.paid)}</div><div style={{fontSize:10,color:'var(--txt3)'}}>Paid to Broker</div></div>
            <div style={{textAlign:'center',padding:10,background:'var(--surf)',borderRadius:'var(--r)'}}><div style={{fontSize:18,fontWeight:700,color:'var(--navy)'}}>{fmt$(cp.remaining)}</div><div style={{fontSize:10,color:'var(--txt3)'}}>Remaining</div></div>
          </div>
        </div>
      </div>}

      {!isNew&&<div className="card">
        <div className="card-hdr"><span className="card-title">Transactions</span></div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Property</th><th>Status</th><th>Close Date</th><th>Split</th></tr></thead>
          <tbody>
            {txnAgents.map(ta=>{const t=ta.transactions;if(!t)return null;return(
              <tr key={ta.id}><td><span className="tbl-link" style={{cursor:'pointer'}} onClick={()=>navigate(`/transactions/${ta.transaction_id}`)}>{t.street_address},{t.city}</span></td><td>{statusBadge(t.status)}</td><td>{t.close_date||'—'}</td><td>{ta.split_value}{ta.split_type==='percent'?'%':' (flat)'}</td></tr>
            )})}
            {txnAgents.length===0&&<tr><td colSpan={4} style={{textAlign:'center',color:'var(--txt3)',padding:20}}>No transactions</td></tr>}
          </tbody>
        </table></div>
      </div>}
    </div>
  )
}
