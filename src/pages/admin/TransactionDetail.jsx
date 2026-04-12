import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmt$, fmtPct, calcCommission, statusBadge } from '../../lib/commission'

const EMPTY = {
  type:'selling',status:'active',street_address:'',city:'',state:'TN',zip:'',
  sale_price:'',selling_commission_pct:3,lead_source:'',mortgage_company:'Cash',mls_number:'',
  close_date:'',estimated_close_date:'',contract_acceptance_date:'',
  admin_fee_payer:'client',buyers:[],sellers:[],
  co_broke_company:'',co_broke_agent:'',outside_referral_company:'',outside_referral_agent:'',
}

export default function TransactionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id==='new'
  const [txn, setTxn] = useState(EMPTY)
  const [tas, setTas] = useState([])
  const [agents, setAgents] = useState([])
  const [plans, setPlans] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('deal')
  const [ytdMap, setYtdMap] = useState({})
  const [disbs, setDisbs] = useState([])

  useEffect(() => { loadMeta(); if(!isNew) loadTxn() }, [id])

  async function loadMeta() {
    const [ar,pr,sr] = await Promise.all([
      supabase.from('agents').select('id,first_name,last_name,plan_id,plans(*)').eq('status','active'),
      supabase.from('plans').select('*').eq('status','active'),
      supabase.from('settings').select('*').single(),
    ])
    setAgents(ar.data||[])
    setPlans(pr.data||[])
    setSettings(sr.data)
  }

  async function loadTxn() {
    const [tr,tar,dr] = await Promise.all([
      supabase.from('transactions').select('*').eq('id',id).single(),
      supabase.from('transaction_agents').select('*,agents(id,first_name,last_name),plans(*)').eq('transaction_id',id).order('sort_order'),
      supabase.from('disbursements').select('*').eq('transaction_id',id),
    ])
    if(tr.data) setTxn(tr.data)
    if(tar.data) { setTas(tar.data); loadYTD(tar.data.map(t=>t.agent_id)) }
    if(dr.data) setDisbs(dr.data)
    setLoading(false)
  }

  async function loadYTD(ids) {
    const yr = new Date().getFullYear()
    const map = {}
    for(const aid of ids) {
      const {data} = await supabase.from('transaction_agents')
        .select('locked_broker_net,transactions!inner(status,close_date)')
        .eq('agent_id',aid).eq('transactions.status','closed')
      map[aid] = (data||[]).filter(r=>new Date(r.transactions?.close_date).getFullYear()===yr).reduce((s,r)=>s+(r.locked_broker_net||0),0)
    }
    setYtdMap(map)
  }

  function f(k,v) { setTxn(t=>({...t,[k]:v})) }
  function getPlan(ta) {
    if(ta.plan_id) return plans.find(p=>p.id===ta.plan_id)||ta.plans||null
    return agents.find(a=>a.id===ta.agent_id)?.plans||null
  }
  function addTA() {
    setTas(rows=>[...rows,{_new:true,agent_id:'',split_type:'percent',split_value:rows.length===0?100:0,volume_pct:rows.length===0?100:0,plan_id:null,sort_order:rows.length}])
  }
  function updTA(i,c) { setTas(rows=>rows.map((r,j)=>j===i?{...r,...c}:r)) }
  function delTA(i) { setTas(rows=>rows.filter((_,j)=>j!==i)) }
  function addParty(side) { f(side,[...(txn[side]||[]),{name:'',phone:'',email:''}]) }
  function updParty(side,i,k,v) { const l=[...(txn[side]||[])]; l[i]={...l[i],[k]:v}; f(side,l) }
  function delParty(side,i) { f(side,(txn[side]||[]).filter((_,j)=>j!==i)) }

  async function save() {
    setSaving(true)
    if(!txn.street_address||!txn.city){alert('Address required');setSaving(false);return}
    if(tas.length===0){alert('Add at least one agent');setSaving(false);return}
    if(tas.some(t=>!t.agent_id)){alert('Select an agent for each row');setSaving(false);return}
    const tot=tas.reduce((s,t)=>s+Number(t.split_value||0),0)
    if(tas.length>1&&tas[0].split_type==='percent'&&Math.abs(tot-100)>0.01){if(!window.confirm(`Splits total ${tot}% not 100%. Save?`)){setSaving(false);return}}
    let tid=id
    const d={...txn,sale_price:txn.sale_price?Number(txn.sale_price):null,selling_commission_pct:txn.selling_commission_pct?Number(txn.selling_commission_pct):null}
    if(isNew){const{data,error}=await supabase.from('transactions').insert(d).select().single();if(error){alert(error.message);setSaving(false);return};tid=data.id}
    else await supabase.from('transactions').update(d).eq('id',tid)
    await supabase.from('transaction_agents').delete().eq('transaction_id',tid)
    await supabase.from('transaction_agents').insert(tas.map((ta,i)=>({transaction_id:tid,agent_id:ta.agent_id,split_type:ta.split_type,split_value:Number(ta.split_value)||0,volume_pct:Number(ta.volume_pct)||0,plan_id:ta.plan_id||null,sort_order:i})))
    setSaving(false)
    if(isNew)navigate(`/transactions/${tid}`)
    else await loadTxn()
  }

  async function closeTransaction() {
    const cd=window.prompt('Close date (YYYY-MM-DD):',new Date().toISOString().slice(0,10))
    if(!cd)return
    for(const ta of tas) {
      const plan=getPlan(ta); const ytd=ytdMap[ta.agent_id]||0
      const c=calcCommission(txn,ta,plan,ytd)
      await supabase.from('transaction_agents').update({locked_gross:c.gross,locked_agent_pct:c.pct,locked_agent_gross:c.agent_gross,locked_agent_net:c.agent_net,locked_broker_net:c.broker_net,locked_admin_fee:c.admin_fee,locked_admin_fee_payer:c.admin_fee_payer}).eq('id',ta.id)
    }
    await supabase.from('transactions').update({status:'closed',close_date:cd,locked_at:new Date().toISOString()}).eq('id',id)
    if(!disbs.find(d=>d.agent_id===null)) await supabase.from('disbursements').insert({transaction_id:id,agent_id:null,paid:false})
    await loadTxn(); setTab('disbursement')
  }

  async function genIndivDisb(agentId) {
    if(disbs.find(d=>d.agent_id===agentId)){alert('Already exists');return}
    await supabase.from('disbursements').insert({transaction_id:id,agent_id:agentId,paid:false})
    await loadTxn()
  }

  async function markPaid(disbId) {
    await supabase.from('disbursements').update({paid:true,paid_date:new Date().toISOString().slice(0,10)}).eq('id',disbId)
    await loadTxn()
  }

  if(loading) return <div className="loading"><div className="spinner"/>Loading…</div>

  const isClosed=txn.status==='closed', isCancelled=txn.status==='cancelled', canEdit=!isClosed&&!isCancelled
  const gross=(Number(txn.sale_price)||0)*((Number(txn.selling_commission_pct)||0)/100)
  const totalSplit=tas.reduce((s,t)=>s+Number(t.split_value||0),0)
  const combinedDisb=disbs.find(d=>d.agent_id===null)
  const indivDisbs=disbs.filter(d=>d.agent_id!==null)

  return (
    <div>
      <div className="back-btn" onClick={()=>navigate('/transactions')}>← Back to Transactions</div>
      <div className="sec-hdr">
        <div>
          <div className="sec-title">{isNew?'New Transaction':txn.street_address||'Transaction'}</div>
          <div className="sec-sub">{!isNew&&<>{txn.city}, {txn.state} &nbsp;·&nbsp; {statusBadge(txn.status)}</>}</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {canEdit&&!isNew&&<>
            {txn.status==='active'&&<button className="btn btn-ghost" onClick={()=>supabase.from('transactions').update({status:'pending'}).eq('id',id).then(loadTxn)}>Mark Pending</button>}
            {txn.status==='pending'&&<button className="btn btn-ghost" onClick={()=>supabase.from('transactions').update({status:'active'}).eq('id',id).then(loadTxn)}>Back to Active</button>}
            <button className="btn btn-teal" onClick={closeTransaction}>✓ Close Transaction</button>
            <button className="btn btn-ghost" style={{color:'var(--red)'}} onClick={()=>{const r=window.prompt('Cancellation reason:');if(r)supabase.from('transactions').update({status:'cancelled',cancelled_reason:r}).eq('id',id).then(loadTxn)}}>✕ Cancel</button>
          </>}
          <button className="btn btn-gold" onClick={save} disabled={saving}>{saving?'Saving…':isNew?'Create Transaction':'Save Changes'}</button>
        </div>
      </div>

      {isClosed&&<div className="alert-bar success">✓ Closed {txn.close_date} — commission locked</div>}
      {isCancelled&&<div className="alert-bar danger">✕ Cancelled{txn.cancelled_reason?` — ${txn.cancelled_reason}`:''}</div>}

      <div className="tab-bar">
        {['deal','agents','parties',...(isClosed?['disbursement']:[])] .map(t=>(
          <div key={t} className={`tab${tab===t?' active':''}`} onClick={()=>setTab(t)} style={{textTransform:'capitalize'}}>{t}</div>
        ))}
      </div>

      {/* DEAL TAB */}
      {tab==='deal'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
        <div className="card">
          <div className="card-hdr"><span className="card-title">Property</span></div>
          <div className="card-body">
            <div className="form-group"><label className="form-label">Street Address <span className="req">*</span></label><input className="form-ctrl" value={txn.street_address} disabled={isClosed} onChange={e=>f('street_address',e.target.value)}/></div>
            <div className="form-grid-3">
              <div className="form-group"><label className="form-label">City <span className="req">*</span></label><input className="form-ctrl" value={txn.city} disabled={isClosed} onChange={e=>f('city',e.target.value)}/></div>
              <div className="form-group"><label className="form-label">State</label><input className="form-ctrl" value={txn.state} disabled={isClosed} onChange={e=>f('state',e.target.value)}/></div>
              <div className="form-group"><label className="form-label">ZIP</label><input className="form-ctrl" value={txn.zip||''} disabled={isClosed} onChange={e=>f('zip',e.target.value)}/></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Type</label><select className="form-ctrl" value={txn.type} disabled={isClosed} onChange={e=>f('type',e.target.value)}>{(settings?.transaction_types||['selling','listing','dual','rental','referral']).map(t=><option key={t} value={t} style={{textTransform:'capitalize'}}>{t}</option>)}</select></div>
              <div className="form-group"><label className="form-label">MLS #</label><input className="form-ctrl" value={txn.mls_number||''} disabled={isClosed} onChange={e=>f('mls_number',e.target.value)}/></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Mortgage Co.</label><select className="form-ctrl" value={txn.mortgage_company||'Cash'} disabled={isClosed} onChange={e=>f('mortgage_company',e.target.value)}>{(settings?.mortgage_companies||['Cash','Wells Fargo','Rocket Mortgage']).map(m=><option key={m}>{m}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Property Type</label><select className="form-ctrl" value={txn.property_type||''} disabled={isClosed} onChange={e=>f('property_type',e.target.value)}><option value="">— Select —</option>{(settings?.property_types||['Residential','Condo','Commercial','Land']).map(p=><option key={p}>{p}</option>)}</select></div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hdr"><span className="card-title">Commission & Dates</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Sale Price</label><input className="form-ctrl" type="number" value={txn.sale_price||''} disabled={isClosed} onChange={e=>f('sale_price',e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Commission %</label><input className="form-ctrl" type="number" step="0.1" value={txn.selling_commission_pct||''} disabled={isClosed} onChange={e=>f('selling_commission_pct',e.target.value)}/></div>
            </div>
            {gross>0&&<div style={{padding:'10px 14px',background:'var(--teal-lt)',borderRadius:'var(--r)',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{color:'var(--txt2)',fontSize:12}}>Gross Commission</span><span style={{fontSize:20,fontWeight:800,color:'var(--teal)'}}>{fmt$(gross)}</span></div>}
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Lead Source</label><select className="form-ctrl" value={txn.lead_source||''} disabled={isClosed} onChange={e=>f('lead_source',e.target.value)}><option value="">— Select —</option>{(settings?.lead_sources||[]).map(l=><option key={l}>{l}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Admin Fee Payer</label><select className="form-ctrl" value={txn.admin_fee_payer} disabled={isClosed} onChange={e=>f('admin_fee_payer',e.target.value)}><option value="client">Client</option><option value="agent">Agent</option><option value="broker">Broker</option></select></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Contract Date</label><input className="form-ctrl" type="date" value={txn.contract_acceptance_date||''} disabled={isClosed} onChange={e=>f('contract_acceptance_date',e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Est. Close Date</label><input className="form-ctrl" type="date" value={txn.estimated_close_date||''} disabled={isClosed} onChange={e=>f('estimated_close_date',e.target.value)}/></div>
            </div>
            <div className="form-group"><label className="form-label">Co-Broke Company <span style={{fontSize:10,color:'var(--txt3)'}}>— informational only</span></label><input className="form-ctrl" value={txn.co_broke_company||''} onChange={e=>f('co_broke_company',e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Outside Referral</label><input className="form-ctrl" value={txn.outside_referral_company||''} onChange={e=>f('outside_referral_company',e.target.value)}/></div>
          </div>
        </div>
      </div>}

      {/* AGENTS TAB */}
      {tab==='agents'&&<div>
        <div className="card" style={{marginBottom:18}}>
          <div className="card-hdr"><span className="card-title">Agent Splits</span>{canEdit&&<button className="btn btn-ghost btn-sm" onClick={addTA} disabled={tas.length>=4}>+ Add Agent</button>}</div>
          <div>
            {tas.length===0&&<div style={{padding:30,textAlign:'center',color:'var(--txt3)'}}>No agents. <button className="btn btn-ghost btn-sm" onClick={addTA}>Add Agent</button></div>}
            {tas.map((ta,i)=>{
              const plan=getPlan(ta); const ytd=ytdMap[ta.agent_id]||0
              const comm=ta.agent_id?calcCommission(txn,ta,plan,ytd):null
              return <div key={i} style={{padding:'18px 20px',borderBottom:'1px solid var(--bdr)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
                  <span style={{fontWeight:700,color:'var(--navy)'}}>{i===0?'Primary Agent':`Co-Agent ${i+1}`}</span>
                  {canEdit&&tas.length>1&&<button className="btn btn-ghost btn-sm" style={{color:'var(--red)'}} onClick={()=>delTA(i)}>Remove</button>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:12,marginBottom:12}}>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Agent</label>
                    <select className="form-ctrl" value={ta.agent_id||''} disabled={isClosed} onChange={e=>{const a=agents.find(ag=>ag.id===e.target.value);updTA(i,{agent_id:e.target.value,plan_id:a?.plan_id||null})}}>
                      <option value="">— Select —</option>
                      {agents.map(a=><option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Plan Override</label>
                    <select className="form-ctrl" value={ta.plan_id||''} disabled={isClosed} onChange={e=>updTA(i,{plan_id:e.target.value||null})}>
                      <option value="">Agent Default</option>
                      {plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Split Type</label>
                    <select className="form-ctrl" value={ta.split_type} disabled={isClosed} onChange={e=>updTA(i,{split_type:e.target.value})}>
                      <option value="percent">Percent %</option>
                      <option value="dollar">Flat $</option>
                    </select>
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">{ta.split_type==='percent'?'Split %':'Split $'}</label>
                    <input className="form-ctrl" type="number" value={ta.split_value||''} disabled={isClosed} onChange={e=>updTA(i,{split_value:e.target.value})}/>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 3fr',gap:12,marginBottom:12}}>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Volume Credit %</label>
                    <input className="form-ctrl" type="number" step="1" min="0" max="100" value={ta.volume_pct||''} disabled={isClosed} onChange={e=>updTA(i,{volume_pct:e.target.value})}/>
                    <div className="form-hint">% of sale price toward cap</div>
                  </div>
                  {ta.agent_id&&txn.sale_price&&<div style={{padding:'10px 14px',background:'var(--surf)',borderRadius:'var(--r)',border:'1px solid var(--bdr)',fontSize:12,display:'flex',gap:24}}>
                    <div><div style={{color:'var(--txt3)',fontSize:10}}>Volume Credit</div><div style={{fontWeight:700,fontSize:15}}>{fmt$((Number(txn.sale_price)||0)*((Number(ta.volume_pct)||0)/100))}</div></div>
                    <div><div style={{color:'var(--txt3)',fontSize:10}}>Plan</div><div style={{fontWeight:600}}>{plan?.name||'—'}</div></div>
                  </div>}
                </div>
                {comm&&ta.agent_id&&<div style={{background:'var(--navy)',borderRadius:'var(--r)',padding:'12px 16px',color:'#fff'}}>
                  <div style={{fontSize:10,opacity:.6,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:10}}>{isClosed?'Locked Commission':'Commission Preview'}</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                    <div><div style={{fontSize:10,opacity:.6}}>Gross (this split)</div><div style={{fontWeight:700}}>{fmt$(comm.gross)}</div></div>
                    <div><div style={{fontSize:10,opacity:.6}}>Agent Net</div><div style={{fontWeight:700,color:'var(--gold-lt)',fontSize:15}}>{fmt$(comm.agent_net)}</div></div>
                    <div><div style={{fontSize:10,opacity:.6}}>Broker Retention</div><div style={{fontWeight:700}}>{fmt$(comm.broker_net)}</div></div>
                    <div><div style={{fontSize:10,opacity:.6}}>Split %</div><div style={{fontWeight:700}}>{fmtPct(comm.pct)}</div></div>
                  </div>
                  {isClosed&&<div style={{marginTop:12,paddingTop:12,borderTop:'1px solid rgba(255,255,255,.15)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:11,opacity:.7}}>{disbs.find(d=>d.agent_id===ta.agent_id)?'✓ Individual disbursement created':'No individual disbursement yet'}</span>
                    {!disbs.find(d=>d.agent_id===ta.agent_id)&&<button className="btn btn-gold btn-sm" onClick={()=>genIndivDisb(ta.agent_id)}>Generate Individual Disbursement</button>}
                  </div>}
                </div>}
              </div>
            })}
            {tas.length>1&&<div style={{padding:'10px 20px',background:'var(--surf)',borderTop:'1px solid var(--bdr)',display:'flex',justifyContent:'space-between',fontSize:12}}>
              <span style={{color:'var(--txt3)'}}>Total split</span>
              <span style={{fontWeight:700,color:Math.abs(totalSplit-100)<0.01?'var(--green)':'var(--red)'}}>{totalSplit}% {Math.abs(totalSplit-100)<0.01?'✓':'— must equal 100%'}</span>
            </div>}
          </div>
        </div>
      </div>}

      {/* PARTIES TAB */}
      {tab==='parties'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
        {['buyers','sellers'].map(side=>(
          <div className="card" key={side}>
            <div className="card-hdr"><span className="card-title">{side==='buyers'?'Buyers':'Sellers'}</span>{canEdit&&<button className="btn btn-ghost btn-sm" onClick={()=>addParty(side)}>+ Add</button>}</div>
            <div className="card-body">
              {(txn[side]||[]).length===0&&<div style={{color:'var(--txt3)',fontSize:12}}>None entered.</div>}
              {(txn[side]||[]).map((p,i)=>(
                <div key={i} style={{paddingBottom:12,marginBottom:12,borderBottom:'1px solid var(--bdr)'}}>
                  <div className="form-grid" style={{marginBottom:8}}>
                    <div className="form-group" style={{marginBottom:0}}><label className="form-label">Name</label><input className="form-ctrl" value={p.name||''} disabled={isClosed} onChange={e=>updParty(side,i,'name',e.target.value)}/></div>
                    <div className="form-group" style={{marginBottom:0}}><label className="form-label">Phone</label><input className="form-ctrl" value={p.phone||''} disabled={isClosed} onChange={e=>updParty(side,i,'phone',e.target.value)}/></div>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                    <div className="form-group" style={{marginBottom:0,flex:1}}><label className="form-label">Email</label><input className="form-ctrl" value={p.email||''} disabled={isClosed} onChange={e=>updParty(side,i,'email',e.target.value)}/></div>
                    {canEdit&&<button className="btn btn-ghost btn-sm" style={{color:'var(--red)'}} onClick={()=>delParty(side,i)}>✕</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>}

      {/* DISBURSEMENT TAB */}
      {tab==='disbursement'&&isClosed&&<div>
        {combinedDisb&&<div className="card" style={{marginBottom:18}}>
          <div className="card-hdr">
            <span className="card-title">Combined Disbursement — Broker View</span>
            <div style={{display:'flex',gap:8}}>
              {combinedDisb.paid?<span className="badge badge-green">All Paid</span>:<button className="btn btn-teal btn-sm" onClick={()=>markPaid(combinedDisb.id)}>✓ Mark All Paid</button>}
            </div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Agent</th><th>Split</th><th>Plan</th><th>Agent Net</th><th>Broker Net</th><th>Volume Credit</th><th>Individual Disb</th></tr></thead>
              <tbody>
                {tas.map((ta,i)=>{
                  const plan=getPlan(ta); const comm=calcCommission(txn,ta,plan,ytdMap[ta.agent_id]||0)
                  const ao=agents.find(a=>a.id===ta.agent_id)||ta.agents
                  const vol=(Number(txn.sale_price)||0)*((Number(ta.volume_pct)||0)/100)
                  const indiv=disbs.find(d=>d.agent_id===ta.agent_id)
                  return <tr key={i}>
                    <td style={{fontWeight:600}}>{ao?.first_name} {ao?.last_name}</td>
                    <td>{ta.split_type==='percent'?`${ta.split_value}%`:fmt$(ta.split_value)}</td>
                    <td style={{fontSize:11}}>{plan?.name||'—'}</td>
                    <td style={{color:'var(--teal)',fontWeight:700}}>{fmt$(comm.agent_net)}</td>
                    <td>{fmt$(comm.broker_net)}</td>
                    <td>{fmt$(vol)}</td>
                    <td>{indiv?<span className={`badge ${indiv.paid?'badge-green':'badge-amber'}`}>{indiv.paid?'Paid':'Pending'}</span>:<button className="btn btn-ghost btn-sm" onClick={()=>genIndivDisb(ta.agent_id)}>Generate</button>}</td>
                  </tr>
                })}
                <tr style={{background:'var(--surf)',fontWeight:700}}>
                  <td colSpan={3} style={{textAlign:'right'}}>Totals</td>
                  <td style={{color:'var(--teal)'}}>{fmt$(tas.reduce((s,ta)=>{const c=calcCommission(txn,ta,getPlan(ta),ytdMap[ta.agent_id]||0);return s+c.agent_net},0))}</td>
                  <td>{fmt$(tas.reduce((s,ta)=>{const c=calcCommission(txn,ta,getPlan(ta),ytdMap[ta.agent_id]||0);return s+c.broker_net},0))}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>}
        {indivDisbs.length>0&&<div className="card">
          <div className="card-hdr"><span className="card-title">Individual Agent Disbursements</span></div>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Agent</th><th>Agent Net</th><th>Created</th><th>Status</th><th></th></tr></thead>
            <tbody>{indivDisbs.map(d=>{
              const ta=tas.find(t=>t.agent_id===d.agent_id)
              const comm=ta?calcCommission(txn,ta,getPlan(ta),ytdMap[ta.agent_id]||0):null
              const ao=agents.find(a=>a.id===d.agent_id)||ta?.agents
              return <tr key={d.id}>
                <td style={{fontWeight:600}}>{ao?.first_name} {ao?.last_name}</td>
                <td style={{color:'var(--teal)',fontWeight:700}}>{comm?fmt$(comm.agent_net):'—'}</td>
                <td>{d.created_at?.slice(0,10)}</td>
                <td>{d.paid?<span className="badge badge-green">Paid</span>:<span className="badge badge-amber">Pending</span>}</td>
                <td>{!d.paid&&<button className="btn btn-teal btn-sm" onClick={()=>markPaid(d.id)}>✓ Mark Paid</button>}</td>
              </tr>
            })}</tbody>
          </table></div>
        </div>}
      </div>}
    </div>
  )
}
