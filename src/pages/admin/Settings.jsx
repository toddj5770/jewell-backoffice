import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const LIST_KEYS = [
  { key: 'offices',             label: 'Offices' },
  { key: 'lead_sources',        label: 'Lead Sources' },
  { key: 'transaction_types',   label: 'Transaction Types' },
  { key: 'property_types',      label: 'Property Types' },
  { key: 'mortgage_companies',  label: 'Mortgage Companies' },
  { key: 'expense_categories',  label: 'Expense Categories' },
  { key: 'payment_methods',     label: 'Payment Methods' },
  { key: 'trust_deposit_types', label: 'Trust / Deposit Types' },
  { key: 'fee_frequencies',     label: 'Fee Frequencies' },
]

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeList, setActiveList] = useState('offices')
  const [newItem, setNewItem] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('settings').select('*').single()
    setSettings(data)
    setLoading(false)
  }

  async function save(updates) {
    setSaving(true)
    await supabase.from('settings').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', settings.id)
    setSettings(s => ({ ...s, ...updates }))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleLogoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 500000) { alert('Logo must be under 500KB'); return }
    const reader = new FileReader()
    reader.onload = () => save({ logo_base64: reader.result })
    reader.readAsDataURL(file)
  }

  function addItem() {
    const val = newItem.trim()
    if (!val) return
    const list = [...(settings[activeList] || []), val]
    save({ [activeList]: list })
    setNewItem('')
  }

  function removeItem(idx) {
    const list = (settings[activeList] || []).filter((_, i) => i !== idx)
    save({ [activeList]: list })
  }

  if (loading) return <div className="loading"><div className="spinner" />Loading settings…</div>

  const activeListData = LIST_KEYS.find(l => l.key === activeList)
  const items = settings[activeList] || []

  return (
    <div>
      <div className="sec-hdr">
        <div>
          <div className="sec-title">Settings</div>
          <div className="sec-sub">Organization config, logo, and lookup lists</div>
        </div>
        {saved && <span className="badge badge-green">✓ Saved</span>}
        {saving && <span className="badge badge-grey">Saving…</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Logo & Org */}
        <div className="card">
          <div className="card-hdr"><span className="card-title">Organization</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Organization Name</label>
              <input
                className="form-ctrl"
                defaultValue={settings.org_name}
                onBlur={e => save({ org_name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                {settings.logo_base64 ? (
                  <img
                    src={settings.logo_base64}
                    alt="Logo"
                    style={{ width: 60, height: 60, objectFit: 'contain', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', background: 'var(--navy)', padding: 4 }}
                  />
                ) : (
                  <div style={{ width: 60, height: 60, border: '2px dashed var(--bdr)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--txt3)' }}>
                    No logo
                  </div>
                )}
                <div>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                    Upload Logo
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                  </label>
                  <div className="form-hint" style={{ marginTop: 4 }}>PNG with transparent background recommended. Max 500KB.</div>
                  {settings.logo_base64 && (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, color: 'var(--red)' }} onClick={() => save({ logo_base64: null })}>
                      Remove Logo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lookup list editor */}
        <div className="card">
          <div className="card-hdr"><span className="card-title">Lookup Lists</span></div>
          <div style={{ display: 'flex' }}>
            {/* List selector */}
            <div style={{ width: 180, borderRight: '1px solid var(--bdr)', flexShrink: 0 }}>
              {LIST_KEYS.map(l => (
                <div
                  key={l.key}
                  onClick={() => setActiveList(l.key)}
                  style={{
                    padding: '9px 14px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: activeList === l.key ? 700 : 400,
                    color: activeList === l.key ? 'var(--navy)' : 'var(--txt2)',
                    background: activeList === l.key ? 'var(--surf)' : 'transparent',
                    borderLeft: activeList === l.key ? '3px solid var(--navy)' : '3px solid transparent',
                  }}
                >
                  {l.label}
                </div>
              ))}
            </div>

            {/* List items */}
            <div style={{ flex: 1, padding: 14 }}>
              <div style={{ marginBottom: 10, fontWeight: 600, fontSize: 12, color: 'var(--navy)' }}>
                {activeListData?.label}
                <span style={{ fontWeight: 400, color: 'var(--txt3)', marginLeft: 6 }}>({items.length} items)</span>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bdr)', fontSize: 12 }}>
                  <span>{item}</span>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 14, padding: '0 4px' }}
                    onClick={() => { if (window.confirm(`Remove "${item}"?`)) removeItem(idx) }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input
                  className="form-ctrl"
                  placeholder="Add new item…"
                  value={newItem}
                  onChange={e => setNewItem(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-navy btn-sm" onClick={addItem}>Add</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Management */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-hdr">
          <span className="card-title">User Management</span>
          <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Invite agents and admins via Supabase Authentication dashboard</span>
        </div>
        <div className="card-body">
          <div className="alert-bar info">
            To invite users: go to your <strong>Supabase Dashboard → Authentication → Users → Invite User</strong>.
            Enter their email — they'll receive an invite link to set their password.
            Then come back here and assign their role and agent profile in the database.
          </div>
          <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 8 }}>
            Full user management UI coming in a future update. For now, use the Supabase dashboard to invite users,
            then update their <code>profiles</code> row to set <code>role</code> and <code>agent_id</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
