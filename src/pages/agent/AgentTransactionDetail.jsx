import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmt$, calcCommission, statusBadge } from '../../lib/commission'
import { useAuth } from '../../hooks/useAuth'

export default function AgentTransactionDetail() {
  const { profile } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const [txn, setTxn] = useState(null)
  const [originalTxn, setOriginalTxn] = useState(null)  // for dirty detection
  const [tas, setTas] = useState([])
  const [myTa, setMyTa] = useState(null)
  const [myPlan, setMyPlan] = useState(null)
  const [disb, setDisb] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('deal')

  useEffect(() => { if (profile?.agent_id && id) load() }, [profile, id])

  async function load() {
    setLoading(true)
    const [tr, tar, dr, sr] = await Promise.all([
      supabase.from('transactions').select('*').eq('id', id).single(),
      supabase.from('transaction_agents')
        .select('*, agents(id,first_name,last_name), plans(*)')
        .eq('transaction_id', id)
        .order('sort_order'),
      supabase.from('disbursements')
        .select('*')
        .eq('transaction_id', id)
        .or(`agent_id.eq.${profile.agent_id},agent_id.is.null`),
      supabase.from('settings').select('*').single(),
    ])

    if (tr.error || !tr.data) { setLoading(false); return }
    if (tar.data) {
      const mine = tar.data.find(t => t.agent_id === profile.agent_id)
      if (!mine) { navigate('/my-transactions'); return }
      setTas(tar.data)
      setMyTa(mine)
      setMyPlan(mine.plans || null)
    }
    setTxn(tr.data)
    setOriginalTxn(tr.data)
    setSettings(sr.data)
    if (dr.data && dr.data.length > 0) {
      const mine = dr.data.find(d => d.agent_id === profile.agent_id)
      setDisb(mine || dr.data.find(d => d.agent_id === null) || null)
    }
    setLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner"/>Loading…</div>
  if (!txn || !myTa) return <div style={{padding:30,textAlign:'center',color:'var(--txt3)'}}>Transaction not found.</div>

  const isClosed = txn.status === 'closed'
  const isCancelled = txn.status === 'cancelled'
  const canEdit = !isClosed && !isCancelled      // agents can edit active or pending only
  const myIndex = tas.findIndex(t => t.agent_id === profile.agent_id)
  const isPrimary = myIndex === 0
  const comm = calcCommission(txn, myTa, myPlan, 0, isPrimary)
  const volumeCredit = (Number(txn.sale_price) || 0) * ((Number(myTa.volume_pct) || 0) / 100)

  const isDirty = originalTxn && JSON.stringify(txn) !== JSON.stringify(originalTxn)

  function f(k, v) { setTxn(t => ({ ...t, [k]: v })) }

  function addParty(side) { f(side, [...(txn[side] || []), { name: '', phone: '', email: '' }]) }
  function updParty(side, i, k, v) {
    const list = [...(txn[side] || [])]
    list[i] = { ...list[i], [k]: v }
    f(side, list)
  }
  function delParty(side, i) { f(side, (txn[side] || []).filter((_, j) => j !== i)) }

  async function save() {
    if (!txn.street_address || !txn.city) { alert('Street address and city are required.'); return }
    setSaving(true)
    const payload = {
      // Bucket A — deal details
      street_address: txn.street_address,
      city: txn.city,
      state: txn.state,
      zip: txn.zip,
      property_type: txn.property_type || null,
      mls_number: txn.mls_number || null,
      mortgage_company: txn.mortgage_company || null,
      lead_source: txn.lead_source || null,
      contract_acceptance_date: txn.contract_acceptance_date || null,
      estimated_close_date: txn.estimated_close_date || null,
      co_broke_company: txn.co_broke_company || null,
      co_broke_agent: txn.co_broke_agent || null,
      outside_referral_company: txn.outside_referral_company || null,
      outside_referral_agent: txn.outside_referral_agent || null,
      buyers: txn.buyers || [],
      sellers: txn.sellers || [],
      // Bucket B — deal money
      type: txn.type,
      sale_price: txn.sale_price ? Number(txn.sale_price) : null,
      selling_commission_pct: txn.selling_commission_pct ? Number(txn.selling_commission_pct) : null,
    }
    const { error } = await supabase.from('transactions').update(payload).eq('id', id)
    setSaving(false)
    if (error) { alert('Could not save: ' + error.message); return }
    await load()
  }

  function cancelChanges() {
    if (!isDirty) return
    if (window.confirm('Discard your unsaved changes?')) {
      setTxn(originalTxn)
    }
  }

  function printStatement() {
    const isDraft = !isClosed
    const vol = volumeCredit
    const agentName = (profile?.first_name || '') + ' ' + (profile?.last_name || '')
    const fp = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const adminRow = comm.admin_fee > 0
      ? '<tr><td style="padding:7px 0;border-bottom:1px solid #eee;color:#666;">Admin Fee (' + comm.admin_fee_payer + ' pays)</td><td style="padding:7px 0;border-bottom:1px solid #eee;color:#888;text-align:right;">' + (comm.admin_fee_payer === 'agent' ? '-' : '+') + fp(comm.admin_fee) + '</td></tr>'
      : ''

    const deductions = (txn.deductions_detail || [])
    let deductionRows = ''
    let totalWithheld = 0
    deductions.forEach(d => {
      totalWithheld += Number(d.amount) || 0
      deductionRows += '<tr><td style="padding:7px 0;border-bottom:1px solid #eee;color:#b45309;">Expense Withheld: ' + (d.desc || '') + '</td><td style="padding:7px 0;border-bottom:1px solid #eee;color:#b45309;text-align:right;">-' + fp(d.amount) + '</td></tr>'
    })
    const netAfterDeductions = comm.agent_net - totalWithheld

    const draftBanner = isDraft
      ? '<div style="text-align:center;background:#fef3c7;border:2px solid #fbbf24;padding:10px;border-radius:6px;font-weight:700;color:#b45309;margin-bottom:20px;font-size:16px;letter-spacing:.1em;">⚠ DRAFT — NOT YET CLOSED</div>'
      : ''
    const status = isDraft ? 'DRAFT' : 'FINAL'
    const closeInfo = txn.close_date || txn.estimated_close_date || 'TBD'
    const mlsRow = txn.mls_number ? '<div style="font-size:11px;color:#999;">MLS # ' + txn.mls_number + '</div>' : ''

    let body = '<div style="margin-bottom:32px;border:1px solid #ddd;border-radius:8px;overflow:hidden;">'
    body += '<div style="background:#0f2744;color:#fff;padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Commission Statement — ' + agentName + '</div>'
    body += '<div style="padding:16px;"><table style="width:100%;border-collapse:collapse;">'
    body += '<tr><td style="padding:7px 0;border-bottom:1px solid #eee;color:#666;width:55%;">Sale Price</td><td style="padding:7px 0;border-bottom:1px solid #eee;font-weight:600;text-align:right;">' + fp(txn.sale_price) + '</td></tr>'
    body += '<tr><td style="padding:7px 0;border-bottom:1px solid #eee;color:#666;">Commission Rate</td><td style="padding:7px 0;border-bottom:1px solid #eee;text-align:right;">' + (txn.selling_commission_pct || 0) + '%</td></tr>'
    body += '<tr><td style="padding:7px 0;border-bottom:1px solid #eee;color:#666;">Gross Commission (your split)</td><td style="padding:7px 0;border-bottom:1px solid #eee;font-weight:600;text-align:right;">' + fp(comm.gross) + '</td></tr>'
    body += '<tr><td style="padding:7px 0;border-bottom:1px solid #eee;color:#666;">Your Split (' + comm.pct + '%)</td><td style="padding:7px 0;border-bottom:1px solid #eee;text-align:right;">' + fp(comm.agent_gross) + '</td></tr>'
    body += adminRow
    body += deductionRows
    body += '<tr><td style="padding:10px 0;border-bottom:2px solid #0f2744;font-weight:700;font-size:15px;">Net to You</td><td style="padding:10px 0;border-bottom:2px solid #0f2744;font-weight:800;font-size:18px;color:#1a7a6e;text-align:right;">' + fp(netAfterDeductions) + '</td></tr>'
    body += '<tr><td style="padding:7px 0;border-bottom:1px solid #eee;color:#666;">Volume Credit (cap)</td><td style="padding:7px 0;text-align:right;">' + fp(vol) + '</td></tr>'
    body += '<tr><td style="padding:7px 0;color:#666;">Commission Plan</td><td style="padding:7px 0;text-align:right;">' + (myPlan?.name || '—') + '</td></tr>'
    body += '</table></div>'
    body += '<div style="padding:14px 16px;background:#f8f8f8;border-top:1px solid #eee;">'
    body += '<div style="display:flex;justify-content:space-between;">'
    body += '<div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.06em;">Agent Approval</div><div style="border-bottom:1px solid #333;width:200px;margin-top:20px;"></div><div style="font-size:11px;color:#666;margin-top:4px;">' + agentName + ' &nbsp;·&nbsp; Date</div></div>'
    body += '<div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.06em;">Broker Approval</div><div style="border-bottom:1px solid #333;width:200px;margin-top:20px;"></div><div style="font-size:11px;color:#666;margin-top:4px;">Jewell Real Estate &nbsp;·&nbsp; Date</div></div>'
    body += '</div></div></div>'

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Commission Statement</title>'
      + '<style>body{font-family:Segoe UI,system-ui,sans-serif;font-size:13px;color:#1a1a1a;margin:0;padding:0;}@media print{.no-print{display:none!important;}}</style>'
      + '</head><body style="padding:32px;max-width:800px;margin:0 auto;">'
      + draftBanner
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #0f2744;">'
      + '<div><div style="font-size:24px;font-weight:800;color:#0f2744;">Jewell Real Estate</div><div style="font-size:12px;color:#888;margin-top:2px;">Commission Statement</div></div>'
      + '<div style="text-align:right;"><div style="font-size:11px;color:#888;">' + status + ' · ' + new Date().toLocaleDateString() + '</div>'
      + '<div style="font-size:13px;font-weight:700;margin-top:4px;">' + (txn.street_address || '') + '</div>'
      + '<div style="font-size:12px;color:#666;">' + (txn.city || '') + ', ' + (txn.state || '') + ' ' + (txn.zip || '') + '</div>'
      + '<div style="font-size:12px;color:#666;">Close: ' + closeInfo + '</div>'
      + mlsRow + '</div></div>'
      + body
      + '<div class="no-print" style="text-align:center;margin-top:20px;">'
      + '<button onclick="window.print()" style="background:#0f2744;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;">⎙ Print / Save as PDF</button>'
      + '</div></body></html>'

    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  // Activity timeline
  const activity = []
  if (txn.contract_acceptance_date) activity.push({ date: txn.contract_acceptance_date, label: 'Contract accepted', kind: 'info' })
  if (txn.estimated_close_date && !txn.close_date) activity.push({ date: txn.estimated_close_date, label: 'Estimated close date', kind: 'info' })
  if (txn.close_date) activity.push({ date: txn.close_date, label: 'Transaction closed', kind: 'good' })
  if (txn.status === 'pending' && !txn.close_date) activity.push({ date: txn.updated_at || txn.created_at, label: 'Moved to pending', kind: 'info' })
  if (isCancelled) activity.push({ date: txn.updated_at || txn.created_at, label: 'Cancelled' + (txn.cancelled_reason ? ': ' + txn.cancelled_reason : ''), kind: 'bad' })
  activity.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const totalWithheld = (txn.deductions_detail || []).reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const myNetAfterWithheld = comm.agent_net - totalWithheld

  const txTypes = settings?.transaction_types || ['selling', 'listing', 'dual', 'rental', 'referral']
  const propTypes = settings?.property_types || ['Residential', 'Condo', 'Commercial', 'Land']
  const mortgageCos = settings?.mortgage_companies || ['Cash', 'Wells Fargo', 'Rocket Mortgage']
  const leadSources = settings?.lead_sources || []

  return (
    <div>
      <div className="back-btn" onClick={() => {
        if (isDirty && !window.confirm('You have unsaved changes. Leave anyway?')) return
        navigate('/my-transactions')
      }}>← Back to My Transactions</div>

      <div className="sec-hdr">
        <div>
          <div className="sec-title">{txn.street_address || 'Transaction'}</div>
          <div className="sec-sub">
            {txn.city}, {txn.state} {txn.zip} &nbsp;·&nbsp; {statusBadge(txn.status)}
            {isPrimary ? <span className="badge badge-navy" style={{ marginLeft: 8 }}>Primary Agent</span> : <span className="badge badge-grey" style={{ marginLeft: 8 }}>Co-Agent</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && isDirty && (
            <button className="btn btn-ghost" onClick={cancelChanges} disabled={saving}>Discard</button>
          )}
          {canEdit && (
            <button className="btn btn-gold" onClick={save} disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={printStatement}>⎙ Print Commission Statement</button>
        </div>
      </div>

      {isCancelled && <div className="alert-bar danger">✕ Cancelled{txn.cancelled_reason ? ` — ${txn.cancelled_reason}` : ''}</div>}
      {isClosed && <div className="alert-bar success">✓ Closed {txn.close_date} — transaction locked, no changes allowed</div>}
      {!canEdit && <div className="alert-bar" style={{background:'var(--surf)',color:'var(--txt2)',fontSize:12}}>This transaction is read-only. Contact your broker if changes are needed.</div>}

      <div className="tab-bar">
        {['deal', 'commission', 'parties', 'activity', ...(disb ? ['disbursement'] : [])].map(t => (
          <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t}
          </div>
        ))}
      </div>

      {/* DEAL TAB — editable when canEdit */}
      {tab === 'deal' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="card">
          <div className="card-hdr"><span className="card-title">Property</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Street Address <span className="req">*</span></label>
              <input className="form-ctrl" value={txn.street_address || ''} disabled={!canEdit} onChange={e => f('street_address', e.target.value)} />
            </div>
            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label">City <span className="req">*</span></label>
                <input className="form-ctrl" value={txn.city || ''} disabled={!canEdit} onChange={e => f('city', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <input className="form-ctrl" value={txn.state || ''} disabled={!canEdit} onChange={e => f('state', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">ZIP</label>
                <input className="form-ctrl" value={txn.zip || ''} disabled={!canEdit} onChange={e => f('zip', e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-ctrl" value={txn.type || 'selling'} disabled={!canEdit} onChange={e => f('type', e.target.value)}>
                  {txTypes.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Property Type</label>
                <select className="form-ctrl" value={txn.property_type || ''} disabled={!canEdit} onChange={e => f('property_type', e.target.value)}>
                  <option value="">— Select —</option>
                  {propTypes.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">MLS #</label>
                <input className="form-ctrl" value={txn.mls_number || ''} disabled={!canEdit} onChange={e => f('mls_number', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Mortgage Company</label>
                <select className="form-ctrl" value={txn.mortgage_company || 'Cash'} disabled={!canEdit} onChange={e => f('mortgage_company', e.target.value)}>
                  {mortgageCos.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hdr"><span className="card-title">Deal Terms & Dates</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Sale Price</label>
                <input className="form-ctrl" type="number" value={txn.sale_price || ''} disabled={!canEdit} onChange={e => f('sale_price', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Commission %</label>
                <input className="form-ctrl" type="number" step="0.1" value={txn.selling_commission_pct || ''} disabled={!canEdit} onChange={e => f('selling_commission_pct', e.target.value)} />
              </div>
            </div>
            {Number(txn.sale_price) > 0 && Number(txn.selling_commission_pct) > 0 && (
              <div style={{ padding: '10px 14px', background: 'var(--teal-lt)', borderRadius: 'var(--r)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--txt2)', fontSize: 12 }}>Total Gross Commission</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal)' }}>
                  {fmt$((Number(txn.sale_price) || 0) * ((Number(txn.selling_commission_pct) || 0) / 100))}
                </span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Lead Source</label>
              <select className="form-ctrl" value={txn.lead_source || ''} disabled={!canEdit} onChange={e => f('lead_source', e.target.value)}>
                <option value="">— Select —</option>
                {leadSources.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Contract Date</label>
                <input className="form-ctrl" type="date" value={txn.contract_acceptance_date || ''} disabled={!canEdit} onChange={e => f('contract_acceptance_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Est. Close Date</label>
                <input className="form-ctrl" type="date" value={txn.estimated_close_date || ''} disabled={!canEdit} onChange={e => f('estimated_close_date', e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Co-Broke Company</label>
                <input className="form-ctrl" value={txn.co_broke_company || ''} disabled={!canEdit} onChange={e => f('co_broke_company', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Co-Broke Agent</label>
                <input className="form-ctrl" value={txn.co_broke_agent || ''} disabled={!canEdit} onChange={e => f('co_broke_agent', e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Outside Referral Company</label>
                <input className="form-ctrl" value={txn.outside_referral_company || ''} disabled={!canEdit} onChange={e => f('outside_referral_company', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Outside Referral Agent</label>
                <input className="form-ctrl" value={txn.outside_referral_agent || ''} disabled={!canEdit} onChange={e => f('outside_referral_agent', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {tas.length > 1 && <div className="card" style={{ gridColumn: '1 / span 2' }}>
          <div className="card-hdr"><span className="card-title">Agents on This Deal</span></div>
          <div className="card-body">
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 10 }}>
              You co-represented this transaction with the agent(s) below. Individual compensation details are not shown.
            </div>
            {tas.map((ta, i) => {
              const a = ta.agents || {}
              const isMe = ta.agent_id === profile.agent_id
              return (
                <div key={ta.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < tas.length - 1 ? '1px solid var(--bdr)' : 'none' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{a.first_name} {a.last_name}</span>
                    {isMe && <span className="badge badge-gold" style={{ marginLeft: 8 }}>You</span>}
                  </div>
                  <span className="badge badge-grey">{i === 0 ? 'Primary Agent' : `Co-Agent ${i + 1}`}</span>
                </div>
              )
            })}
          </div>
        </div>}
      </div>}

      {/* COMMISSION TAB — read-only preview */}
      {tab === 'commission' && <div>
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">{isClosed ? 'Your Locked Commission' : 'Your Commission Preview'}</span>
            {!isClosed && <span className="badge badge-amber">Preview — not yet closed</span>}
          </div>
          <div className="card-body">
            <div style={{ background: 'var(--surf)', borderRadius: 'var(--r)', padding: 16, border: '1px solid var(--bdr)' }}>
              <div className="fee-row"><span style={{ color: 'var(--txt2)' }}>Sale Price</span><span style={{ fontWeight: 600 }}>{fmt$(txn.sale_price)}</span></div>
              <div className="fee-row"><span style={{ color: 'var(--txt2)' }}>Commission Rate</span><span>{txn.selling_commission_pct || 0}%</span></div>
              <div className="fee-row"><span style={{ color: 'var(--txt2)' }}>Gross Commission (your split)</span><span style={{ fontWeight: 600 }}>{fmt$(comm.gross)}</span></div>
              <div className="fee-row"><span style={{ color: 'var(--txt2)' }}>Your Split ({comm.pct}%)</span><span>{fmt$(comm.agent_gross)}</span></div>
              {comm.admin_fee > 0 && (
                <div className="fee-row">
                  <span style={{ color: 'var(--txt2)' }}>Admin Fee ({comm.admin_fee_payer} pays)</span>
                  <span style={{ color: comm.admin_fee_payer === 'agent' ? 'var(--amber)' : 'var(--txt3)' }}>
                    {comm.admin_fee_payer === 'agent' ? '−' : '+'}{fmt$(comm.admin_fee)}
                  </span>
                </div>
              )}
              {(txn.deductions_detail || []).map((d, i) => (
                <div key={i} className="fee-row">
                  <span style={{ color: 'var(--amber)' }}>Expense Withheld: {d.desc}</span>
                  <span style={{ color: 'var(--amber)' }}>−{fmt$(d.amount)}</span>
                </div>
              ))}
              <div className="fee-row" style={{ borderTop: '2px solid var(--navy)', paddingTop: 12, marginTop: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Your Net Commission</span>
                <span style={{ fontWeight: 800, fontSize: 22, color: 'var(--teal)' }}>{fmt$(myNetAfterWithheld)}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
              <div style={{ padding: '12px 14px', background: 'var(--surf)', borderRadius: 'var(--r)', border: '1px solid var(--bdr)' }}>
                <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Volume Credit (toward your cap)</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{fmt$(volumeCredit)}</div>
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--surf)', borderRadius: 'var(--r)', border: '1px solid var(--bdr)' }}>
                <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Commission Plan</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{myPlan?.name || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>}

      {/* PARTIES TAB — editable when canEdit */}
      {tab === 'parties' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {['buyers', 'sellers'].map(side => (
          <div className="card" key={side}>
            <div className="card-hdr">
              <span className="card-title">{side === 'buyers' ? 'Buyers' : 'Sellers'}</span>
              {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => addParty(side)}>+ Add</button>}
            </div>
            <div className="card-body">
              {(txn[side] || []).length === 0 && <div style={{ color: 'var(--txt3)', fontSize: 12 }}>None entered.</div>}
              {(txn[side] || []).map((p, i) => (
                <div key={i} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: i < (txn[side] || []).length - 1 ? '1px solid var(--bdr)' : 'none' }}>
                  {canEdit ? (
                    <>
                      <div className="form-grid" style={{ marginBottom: 8 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Name</label>
                          <input className="form-ctrl" value={p.name || ''} onChange={e => updParty(side, i, 'name', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Phone</label>
                          <input className="form-ctrl" value={p.phone || ''} onChange={e => updParty(side, i, 'phone', e.target.value)} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                          <label className="form-label">Email</label>
                          <input className="form-ctrl" value={p.email || ''} onChange={e => updParty(side, i, 'email', e.target.value)} />
                        </div>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => delParty(side, i)}>✕</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600 }}>{p.name || '—'}</div>
                      {p.phone && <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{p.phone}</div>}
                      {p.email && <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{p.email}</div>}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>}

      {/* ACTIVITY TAB */}
      {tab === 'activity' && <div className="card">
        <div className="card-hdr"><span className="card-title">Activity Timeline</span></div>
        <div className="card-body">
          {activity.length === 0 && <div style={{ color: 'var(--txt3)', fontSize: 12 }}>No activity recorded yet.</div>}
          {activity.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: i < activity.length - 1 ? '1px solid var(--bdr)' : 'none' }}>
              <div style={{
                minWidth: 10, height: 10, borderRadius: '50%', marginTop: 6,
                background: e.kind === 'good' ? 'var(--green)' : e.kind === 'bad' ? 'var(--red)' : 'var(--navy)'
              }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{e.label}</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{e.date ? new Date(e.date).toLocaleDateString() : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>}

      {/* DISBURSEMENT TAB */}
      {tab === 'disbursement' && disb && <div className="card">
        <div className="card-hdr">
          <span className="card-title">Disbursement</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {disb.paid ? <span className="badge badge-green">Paid</span> : <span className="badge badge-amber">Pending Payment</span>}
            <button className="btn btn-gold btn-sm" onClick={printStatement}>⎙ Print / Save PDF</button>
          </div>
        </div>
        <div className="card-body">
          <div style={{ background: 'var(--surf)', borderRadius: 'var(--r)', padding: 16, border: '1px solid var(--bdr)' }}>
            <div className="fee-row"><span style={{ color: 'var(--txt2)' }}>Gross Commission (your split)</span><span style={{ fontWeight: 600 }}>{fmt$(comm.gross)}</span></div>
            <div className="fee-row"><span style={{ color: 'var(--txt2)' }}>Your Split ({comm.pct}%)</span><span>{fmt$(comm.agent_gross)}</span></div>
            {comm.admin_fee > 0 && comm.admin_fee_payer === 'agent' && (
              <div className="fee-row"><span style={{ color: 'var(--amber)' }}>Admin Fee</span><span style={{ color: 'var(--amber)' }}>−{fmt$(comm.admin_fee)}</span></div>
            )}
            {(txn.deductions_detail || []).map((d, i) => (
              <div key={i} className="fee-row">
                <span style={{ color: 'var(--amber)' }}>Expense Withheld: {d.desc}</span>
                <span style={{ color: 'var(--amber)' }}>−{fmt$(d.amount)}</span>
              </div>
            ))}
            <div className="fee-row" style={{ borderTop: '2px solid var(--navy)', paddingTop: 12, marginTop: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Your Net Commission</span>
              <span style={{ fontWeight: 800, fontSize: 22, color: 'var(--teal)' }}>{fmt$(myNetAfterWithheld)}</span>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--txt3)' }}>
            {disb.created_at && <div>Created: <strong style={{ color: 'var(--txt1)' }}>{disb.created_at.slice(0, 10)}</strong></div>}
            {disb.paid && disb.paid_date && <div>Paid: <strong style={{ color: 'var(--green)' }}>{disb.paid_date}</strong></div>}
            {disb.agent_id === null && <div><em>Combined disbursement — broker has not yet generated an individual statement for you.</em></div>}
          </div>
        </div>
      </div>}
    </div>
  )
}
