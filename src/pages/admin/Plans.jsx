import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt$ } from '../../lib/commission'

const ROLLOVER_LABELS = {
  start_date:      'Agent Start Date Anniversary',
  custom_date:     'Custom Date (set below)',
  calendar_year:   'Calendar Year (Jan 1)',
  none:            'Never Resets',
  monthly:         'Monthly',
  rolling_rollover:'Rolling 12 Months',
}

const PAYER_LABELS = { client: 'Client Pays', agent: 'Agent Pays', broker: 'Broker Pays' }

function emptyPlan() {
  return {
    name: '',
    type: 'cap',
    status: 'active',
    agent_pct: 80,
    cap_amount: 10000,
    rollover_type: 'start_date',
    rollover_date: '',
    cap_on_fees: false,
    cap_levels: [
      { from: 0, to: 10000, pct: 90 },
      { from: 10000, to: null, pct: 100 },
    ],
    fees: [
      { name: 'Admin Fee', dir: 'debit', basis: 'flat', amt: 195, payer: 'client' }
    ],
  }
}

export default function Plans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // list | edit
  const [plan, setPlan] = useState(null)
  const [saving, setSaving] = useState(false)
  const [agentCounts, setAgentCounts] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [planRes, agentRes] = await Promise.all([
      supabase.from('plans').select('*').order('created_at'),
      supabase.from('agents').select('plan_id, status').eq('status', 'active'),
    ])
    const plans = planRes.data || []
    const counts = {}
    ;(agentRes.data || []).forEach(a => {
      if (a.plan_id) counts[a.plan_id] = (counts[a.plan_id] || 0) + 1
    })
    setPlans(plans)
    setAgentCounts(counts)
    setLoading(false)
  }

  function newPlan() {
    setPlan(emptyPlan())
    setView('edit')
  }

  function editPlan(p) {
    setPlan({
      ...p,
      cap_levels: p.cap_levels || [],
      fees: p.fees || [],
    })
    setView('edit')
  }

  async function savePlan() {
    if (!plan.name.trim()) { alert('Plan name is required.'); return }
    setSaving(true)
    const payload = {
      name: plan.name,
      type: plan.type,
      status: plan.status,
      agent_pct: plan.type === 'flat' ? Number(plan.agent_pct) : null,
      cap_amount: plan.type === 'cap' ? Number(plan.cap_amount) : null,
      rollover_type: plan.type === 'cap' ? plan.rollover_type : null,
      rollover_date: plan.type === 'cap' && plan.rollover_type === 'custom_date' ? plan.rollover_date || null : null,
      cap_on_fees: plan.type === 'cap' ? plan.cap_on_fees : false,
      cap_levels: plan.type === 'cap' ? plan.cap_levels : [],
      fees: plan.fees,
    }
    if (plan.id) {
      await supabase.from('plans').update(payload).eq('id', plan.id)
    } else {
      await supabase.from('plans').insert(payload)
    }
    setSaving(false)
    setView('list')
    load()
  }

  async function archivePlan(id) {
    if (!window.confirm('Archive this plan? It will no longer be available for new agents but existing agents will keep it.')) return
    await supabase.from('plans').update({ status: 'archived' }).eq('id', id)
    load()
  }

  async function restorePlan(id) {
    await supabase.from('plans').update({ status: 'active' }).eq('id', id)
    load()
  }

  // ── Fee helpers ───────────────────────────────────────────
  function addFee() {
    setPlan(p => ({ ...p, fees: [...p.fees, { name: '', dir: 'debit', basis: 'flat', amt: 0, payer: 'client' }] }))
  }
  function updFee(i, key, val) {
    setPlan(p => { const f = [...p.fees]; f[i] = { ...f[i], [key]: val }; return { ...p, fees: f } })
  }
  function removeFee(i) {
    setPlan(p => ({ ...p, fees: p.fees.filter((_, j) => j !== i) }))
  }

  // ── Cap level helpers ─────────────────────────────────────
  function addLevel() {
    const last = plan.cap_levels[plan.cap_levels.length - 1]
    const newFrom = last?.to || 0
    setPlan(p => ({
      ...p,
      cap_levels: [
        ...p.cap_levels.slice(0, -1).map(l => ({ ...l, to: l.to })),
        { ...p.cap_levels[p.cap_levels.length - 1], to: newFrom },
        { from: newFrom, to: null, pct: 100 }
      ]
    }))
  }
  function updLevel(i, key, val) {
    setPlan(p => {
      const levels = [...p.cap_levels]
      levels[i] = { ...levels[i], [key]: val === '' ? null : Number(val) }
      // Auto-sync from of next level
      if (key === 'to' && levels[i + 1]) {
        levels[i + 1] = { ...levels[i + 1], from: val === '' ? null : Number(val) }
      }
      return { ...p, cap_levels: levels }
    })
  }
  function removeLevel(i) {
    if (plan.cap_levels.length <= 1) return
    setPlan(p => ({ ...p, cap_levels: p.cap_levels.filter((_, j) => j !== i) }))
  }

  // ── EDIT VIEW ─────────────────────────────────────────────
  if (view === 'edit' && plan) {
    const isNew = !plan.id
    return (
      <div>
        <div className="back-btn" onClick={() => setView('list')}>← Back to Plans</div>
        <div className="sec-hdr">
          <div>
            <div className="sec-title">{isNew ? 'New Commission Plan' : 'Edit: ' + plan.name}</div>
            <div className="sec-sub">{plan.type === 'cap' ? 'Cap Plan' : 'Flat Percent Plan'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setView('list')}>Cancel</button>
            <button className="btn btn-gold" onClick={savePlan} disabled={saving}>{saving ? 'Saving…' : 'Save Plan'}</button>
          </div>
        </div>

        {/* Basic info */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-hdr"><span className="card-title">Plan Info</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Plan Name <span className="req">*</span></label>
                <input className="form-ctrl" value={plan.name} placeholder="e.g. Experienced Agent, New Agent 70%" onChange={e => setPlan(p => ({ ...p, name: e.target.value }))} />
                <div className="form-hint">Name is a label only — commission logic lives in the fields below, not the name.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Plan Type</label>
                <select className="form-ctrl" value={plan.type} onChange={e => setPlan(p => ({ ...p, type: e.target.value }))}>
                  <option value="cap">Cap Plan — agent pays broker until cap is met, then gets higher split</option>
                  <option value="flat">Flat Percent Split — fixed agent % on every deal</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-ctrl" value={plan.status} onChange={e => setPlan(p => ({ ...p, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Flat plan fields */}
        {plan.type === 'flat' && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-hdr"><span className="card-title">Flat Percent Split</span></div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Agent Percent %</label>
                  <input className="form-ctrl" type="number" min="0" max="100" step="0.1" value={plan.agent_pct} onChange={e => setPlan(p => ({ ...p, agent_pct: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Broker Percent % (computed)</label>
                  <input className="form-ctrl" value={(100 - Number(plan.agent_pct || 0)).toFixed(2) + '%'} disabled style={{ background: 'var(--surf)', color: 'var(--txt3)' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cap plan fields */}
        {plan.type === 'cap' && (
          <>
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-hdr"><span className="card-title">Cap Settings</span></div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Cap Amount ($)</label>
                    <input className="form-ctrl" type="number" value={plan.cap_amount} onChange={e => setPlan(p => ({ ...p, cap_amount: e.target.value }))} />
                    <div className="form-hint">Total broker share the agent must pay before reaching the post-cap split.</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cap Rollover</label>
                    <select className="form-ctrl" value={plan.rollover_type} onChange={e => setPlan(p => ({ ...p, rollover_type: e.target.value }))}>
                      {Object.entries(ROLLOVER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  {plan.rollover_type === 'custom_date' && (
                    <div className="form-group">
                      <label className="form-label">Custom Rollover Date</label>
                      <input className="form-ctrl" type="date" value={plan.rollover_date || ''} onChange={e => setPlan(p => ({ ...p, rollover_date: e.target.value }))} />
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={plan.cap_on_fees} onChange={e => setPlan(p => ({ ...p, cap_on_fees: e.target.checked }))} />
                      Transaction fees count toward cap
                    </label>
                    <div className="form-hint">If checked, admin fees paid by the agent also count toward reaching the cap.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cap levels */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-hdr">
                <span className="card-title">Commission Levels / Tiers</span>
                <button className="btn btn-ghost btn-sm" onClick={addLevel}>+ Add Level</button>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left', borderBottom: '1px solid var(--bdr)' }}>Broker Paid From</th>
                      <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left', borderBottom: '1px solid var(--bdr)' }}>Up To</th>
                      <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left', borderBottom: '1px solid var(--bdr)' }}>Agent Gets %</th>
                      <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left', borderBottom: '1px solid var(--bdr)' }}>Broker Gets %</th>
                      <th style={{ padding: '10px 16px', borderBottom: '1px solid var(--bdr)' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.cap_levels.map((level, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--surf)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <input className="form-ctrl" type="number" value={level.from ?? ''} disabled style={{ width: 120, background: 'var(--surf)', color: 'var(--txt3)' }} />
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {i < plan.cap_levels.length - 1 ? (
                            <input className="form-ctrl" type="number" value={level.to ?? ''} style={{ width: 120 }} onChange={e => updLevel(i, 'to', e.target.value)} />
                          ) : (
                            <input className="form-ctrl" value="Any Amount Above" disabled style={{ width: 160, background: 'var(--surf)', color: 'var(--txt3)' }} />
                          )}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input className="form-ctrl" type="number" min="0" max="100" step="0.1" value={level.pct ?? ''} style={{ width: 90 }} onChange={e => updLevel(i, 'pct', e.target.value)} />
                            <span style={{ color: 'var(--txt3)', fontSize: 12 }}>%</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--navy)' }}>
                          {(100 - Number(level.pct || 0)).toFixed(1)}%
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {plan.cap_levels.length > 1 && (
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => removeLevel(i)}>✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--txt3)', borderTop: '1px solid var(--bdr)' }}>
                  💡 Example: Jewell Real Estate — 90% agent until $10,000 broker paid, then 100% agent after cap.
                </div>
              </div>
            </div>
          </>
        )}

        {/* Fees / Pre-commission adjustments */}
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">Fees & Pre-Commission Adjustments</span>
            <button className="btn btn-ghost btn-sm" onClick={addFee}>+ Add Fee</button>
          </div>
          {plan.fees.length === 0 && (
            <div style={{ padding: 20, color: 'var(--txt3)', fontSize: 12 }}>No fees on this plan. Click "+ Add Fee" to add an admin fee, transaction fee, or other adjustment.</div>
          )}
          {plan.fees.length > 0 && (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fee Name</th>
                    <th>Type</th>
                    <th>Basis</th>
                    <th>Amount</th>
                    <th>Default Payer</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {plan.fees.map((fee, i) => (
                    <tr key={i}>
                      <td>
                        <input className="form-ctrl" value={fee.name} placeholder="e.g. Admin Fee" onChange={e => updFee(i, 'name', e.target.value)} />
                      </td>
                      <td>
                        <select className="form-ctrl" value={fee.dir} onChange={e => updFee(i, 'dir', e.target.value)}>
                          <option value="debit">Debit (charge)</option>
                          <option value="credit">Credit (add)</option>
                        </select>
                      </td>
                      <td>
                        <select className="form-ctrl" value={fee.basis} onChange={e => updFee(i, 'basis', e.target.value)}>
                          <option value="flat">Flat Dollar</option>
                          <option value="percent">Percent %</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: 'var(--txt3)', fontSize: 12 }}>{fee.basis === 'flat' ? '$' : ''}</span>
                          <input className="form-ctrl" type="number" step="0.01" value={fee.amt} style={{ width: 100 }} onChange={e => updFee(i, 'amt', Number(e.target.value))} />
                          <span style={{ color: 'var(--txt3)', fontSize: 12 }}>{fee.basis === 'percent' ? '%' : ''}</span>
                        </div>
                      </td>
                      <td>
                        <select className="form-ctrl" value={fee.payer} onChange={e => updFee(i, 'payer', e.target.value)}>
                          <option value="client">Client Pays — added on top of gross commission</option>
                          <option value="agent">Agent Pays — deducted from agent net after split</option>
                          <option value="broker">Broker Pays — absorbed from broker share</option>
                        </select>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => removeFee(i)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--txt3)', borderTop: plan.fees.length > 0 ? '1px solid var(--bdr)' : 'none' }}>
            <strong>Payer logic:</strong> Client = fee billed to client at closing. Agent = deducted from agent's net. Broker = absorbed from broker's share, agent unaffected.
          </div>
        </div>
      </div>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────────
  const active = plans.filter(p => p.status === 'active')
  const archived = plans.filter(p => p.status === 'archived')

  return (
    <div>
      <div className="sec-hdr">
        <div>
          <div className="sec-title">Commission Plans</div>
          <div className="sec-sub">{active.length} active plan{active.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-gold" onClick={newPlan}>+ New Plan</button>
      </div>

      {loading && <div className="loading"><div className="spinner" />Loading…</div>}

      {!loading && active.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', background: 'var(--white)', borderRadius: 'var(--rl)', border: '1px dashed var(--bdr)' }}>
          No commission plans yet. Click <strong>+ New Plan</strong> to create one.
        </div>
      )}

      {active.map(p => (
        <div key={p.id} className="card" style={{ marginBottom: 14 }}>
          <div className="card-hdr">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="card-title">{p.name}</span>
              <span className={`badge ${p.type === 'cap' ? 'badge-teal' : 'badge-navy'}`}>{p.type === 'cap' ? 'Cap Plan' : 'Flat %'}</span>
              {(agentCounts[p.id] || 0) > 0 && (
                <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{agentCounts[p.id]} agent{agentCounts[p.id] !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-navy btn-sm" onClick={() => editPlan(p)}>✏ Edit</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--txt3)' }} onClick={() => archivePlan(p.id)}>Archive</button>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: p.cap_levels?.length > 0 || p.fees?.length > 0 ? 16 : 0 }}>
              {p.type === 'flat' && (
                <>
                  <div><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Agent Split</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{p.agent_pct}%</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Broker Split</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)' }}>{100 - p.agent_pct}%</div></div>
                </>
              )}
              {p.type === 'cap' && (
                <>
                  <div><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Cap Amount</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{fmt$(p.cap_amount)}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Rollover</div><div style={{ fontSize: 13, fontWeight: 600 }}>{ROLLOVER_LABELS[p.rollover_type] || p.rollover_type}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Levels</div><div style={{ fontSize: 13, fontWeight: 600 }}>{p.cap_levels?.length || 0} tier{p.cap_levels?.length !== 1 ? 's' : ''}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Fees Count to Cap</div><div style={{ fontSize: 13, fontWeight: 600 }}>{p.cap_on_fees ? 'Yes' : 'No'}</div></div>
                </>
              )}
            </div>

            {/* Cap levels preview */}
            {p.type === 'cap' && p.cap_levels?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Commission Tiers</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {p.cap_levels.map((l, i) => (
                    <div key={i} style={{ padding: '6px 12px', background: 'var(--navy)', color: '#fff', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600 }}>
                      {l.to ? `$0–${fmt$(l.to)}` : `>${fmt$(l.from)}`} → Agent {l.pct}% / Broker {100 - l.pct}%
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fees preview */}
            {p.fees?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Fees</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {p.fees.map((f, i) => (
                    <div key={i} style={{ padding: '5px 10px', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', fontSize: 12 }}>
                      {f.name} — {f.basis === 'flat' ? fmt$(f.amt) : f.amt + '%'} <span style={{ color: 'var(--txt3)' }}>({PAYER_LABELS[f.payer] || f.payer})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {archived.length > 0 && (
        <>
          <div style={{ margin: '24px 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>Archived Plans</div>
          <div className="card">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Plan Name</th><th>Type</th><th>Details</th><th></th></tr></thead>
                <tbody>
                  {archived.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600, color: 'var(--txt3)' }}>{p.name}</td>
                      <td><span className="badge">{p.type === 'cap' ? 'Cap Plan' : 'Flat %'}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--txt3)' }}>
                        {p.type === 'cap' ? `Cap: ${fmt$(p.cap_amount)}` : `Agent: ${p.agent_pct}%`}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => editPlan(p)}>✏ Edit</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--teal)' }} onClick={() => restorePlan(p.id)}>↩ Restore</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
