import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const LOOKUP_KEYS = [
  { key: 'offices',            label: 'Offices' },
  { key: 'lead_sources',       label: 'Lead Sources' },
  { key: 'transaction_types',  label: 'Transaction Types' },
  { key: 'property_types',     label: 'Property Types' },
  { key: 'mortgage_companies', label: 'Mortgage Companies' },
  { key: 'expense_categories', label: 'Expense Categories' },
  { key: 'payment_methods',    label: 'Payment Methods' },
  { key: 'trust_types',        label: 'Trust / Deposit Types' },
  { key: 'fee_frequencies',    label: 'Fee Frequencies' },
]

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [settingsId, setSettingsId] = useState(null)
  const [activeList, setActiveList] = useState('offices')
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const logoRef = useRef()

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('settings').select('*').single()
    setSettings(data || {})
    setSettingsId(data?.id)
  }

  async function saveOrg() {
    setSaving(true)
    await supabase.from('settings').update({ org_name: settings.org_name, logo_base64: settings.logo_base64 }).eq('id', settingsId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function addItem() {
    if (!newItem.trim()) return
    const list = settings[activeList] || []
    if (list.includes(newItem.trim())) return
    const updated = [...list, newItem.trim()]
    await supabase.from('settings').update({ [activeList]: updated }).eq('id', settingsId)
    setSettings(s => ({ ...s, [activeList]: updated }))
    setNewItem('')
  }

  async function removeItem(item) {
    const updated = (settings[activeList] || []).filter(i => i !== item)
    await supabase.from('settings').update({ [activeList]: updated }).eq('id', settingsId)
    setSettings(s => ({ ...s, [activeList]: updated }))
  }

  function handleLogo(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 500000) { alert('Logo must be under 500KB'); return }
    const reader = new FileReader()
    reader.onload = ev => setSettings(s => ({ ...s, logo_base64: ev.target.result }))
    reader.readAsDataURL(file)
  }

  if (!settings) return <div className="loading"><div className="spinner" />Loading…</div>

  const currentList = settings[activeList] || []

  return (
    <div>
      <div className="sec-hdr">
        <div><div className="sec-title">Settings</div><div className="sec-sub">Organization config, logo, and lookup lists</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 18 }}>
        <div>
          {/* Organization */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-hdr"><span className="card-title">Organization</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Organization Name</label>
                <input className="form-ctrl" value={settings.org_name || ''} onChange={e => setSettings(s => ({ ...s, org_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Logo</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {settings.logo_base64 && <img src={settings.logo_base64} alt="Logo" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 8, background: 'var(--navy)', padding: 4 }} />}
                  <div>
                    <button className="btn btn-ghost btn-sm" onClick={() => logoRef.current.click()}>Upload Logo</button>
                    {settings.logo_base64 && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, color: 'var(--red)' }} onClick={() => setSettings(s => ({ ...s, logo_base64: null }))}>Remove Logo</button>}
                    <div className="form-hint">PNG with transparent background recommended. Max 500KB.</div>
                    <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
                  </div>
                </div>
              </div>
              <button className="btn btn-gold" onClick={saveOrg} disabled={saving}>{saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>

          {/* User Management */}
          <UserManagement />
        </div>

        {/* Lookup Lists */}
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-hdr"><span className="card-title">Lookup Lists</span></div>
          <div style={{ borderBottom: '1px solid var(--bdr)' }}>
            {LOOKUP_KEYS.map(l => (
              <div key={l.key}
                onClick={() => setActiveList(l.key)}
                style={{ padding: '10px 16px', cursor: 'pointer', fontWeight: activeList === l.key ? 700 : 400, color: activeList === l.key ? 'var(--navy)' : 'var(--txt2)', background: activeList === l.key ? 'var(--teal-lt)' : 'transparent', borderLeft: activeList === l.key ? '3px solid var(--teal)' : '3px solid transparent', fontSize: 13 }}>
                {l.label}
                <span style={{ float: 'right', fontSize: 11, color: 'var(--txt3)' }}>{(settings[l.key] || []).length}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>{LOOKUP_KEYS.find(l => l.key === activeList)?.label}</div>
            {currentList.map(item => (
              <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--surf)', borderRadius: 'var(--r)', marginBottom: 4, fontSize: 12 }}>
                <span>{item}</span>
                <button onClick={() => removeItem(item)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input className="form-ctrl" value={newItem} placeholder="Add new…" style={{ fontSize: 12 }}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()} />
              <button className="btn btn-teal btn-sm" onClick={addItem}>+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── User Management Section ───────────────────────────────────
function UserManagement() {
  const [users, setUsers] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState({ email: '', role: 'agent', agent_id: '', first_name: '', last_name: '' })
  const [inviting, setInviting] = useState(false)
  const [editUser, setEditUser] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [profileRes, agentRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('agents').select('id, first_name, last_name, email, status').eq('status', 'active').order('last_name'),
    ])
    setUsers(profileRes.data || [])
    setAgents(agentRes.data || [])
    setLoading(false)
  }

  async function sendInvite() {
    if (!invite.email.trim()) { alert('Email is required'); return }
    setInviting(true)
    try {
      // Step 1: Send Supabase invite email
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(invite.email, {
        data: { role: invite.role }
      })

      if (error) {
        // If admin API not available, show manual instructions
        if (error.message.includes('not allowed') || error.status === 403) {
          await createProfileManually()
        } else {
          alert('Invite error: ' + error.message)
          setInviting(false)
          return
        }
      } else {
        // Create profile row for the new user
        const userId = data?.user?.id
        if (userId) {
          await supabase.from('profiles').upsert({
            id: userId,
            role: invite.role,
            agent_id: invite.agent_id || null,
            first_name: invite.first_name || null,
            last_name: invite.last_name || null,
            needs_password: true,
          })
        }
        alert(`✓ Invite sent to ${invite.email}. They will receive an email to set their password.`)
        setShowInvite(false)
        setInvite({ email: '', role: 'agent', agent_id: '', first_name: '', last_name: '' })
        load()
      }
    } catch (e) {
      await createProfileManually()
    }
    setInviting(false)
  }

  async function createProfileManually() {
    // Fallback: show manual instructions since admin API requires service key
    alert(
      `To invite ${invite.email}:\n\n` +
      `1. Go to your Supabase Dashboard\n` +
      `2. Click Authentication → Users → Invite User\n` +
      `3. Enter: ${invite.email}\n` +
      `4. After they accept, come back here and set their role and agent link.\n\n` +
      `Or use the Supabase dashboard to manually create the user, then their profile will appear here automatically.`
    )
    setShowInvite(false)
  }

  async function updateUser(userId, updates) {
    await supabase.from('profiles').update(updates).eq('id', userId)
    setEditUser(null)
    load()
  }

  const linkedAgentIds = new Set(users.filter(u => u.agent_id).map(u => u.agent_id))

  return (
    <div className="card">
      <div className="card-hdr">
        <span className="card-title">User Management</span>
        <button className="btn btn-navy btn-sm" onClick={() => setShowInvite(!showInvite)}>+ Invite User</button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div style={{ padding: 16, background: 'var(--teal-lt)', borderBottom: '1px solid var(--bdr)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>Send Invitation</div>
          <div className="form-grid">
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Email <span className="req">*</span></label>
              <input className="form-ctrl" type="email" value={invite.email} placeholder="agent@email.com" onChange={e => setInvite(i => ({ ...i, email: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Role</label>
              <select className="form-ctrl" value={invite.role} onChange={e => setInvite(i => ({ ...i, role: e.target.value }))}>
                <option value="agent">Agent — can only see own deals and pipeline</option>
                <option value="admin">Admin — full access, cannot change billing</option>
                <option value="broker">Broker — full access including delete and billing</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">First Name</label>
              <input className="form-ctrl" value={invite.first_name} onChange={e => setInvite(i => ({ ...i, first_name: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Last Name</label>
              <input className="form-ctrl" value={invite.last_name} onChange={e => setInvite(i => ({ ...i, last_name: e.target.value }))} />
            </div>
          </div>
          {invite.role === 'agent' && (
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Link to Agent Record</label>
              <select className="form-ctrl" value={invite.agent_id} onChange={e => setInvite(i => ({ ...i, agent_id: e.target.value }))}>
                <option value="">— Select Agent —</option>
                {agents.filter(a => !linkedAgentIds.has(a.id)).map(a => (
                  <option key={a.id} value={a.id}>{a.first_name} {a.last_name} ({a.email})</option>
                ))}
              </select>
              <div className="form-hint">Links this login to the agent's transaction and commission data.</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowInvite(false)}>Cancel</button>
            <button className="btn btn-gold btn-sm" onClick={sendInvite} disabled={inviting}>{inviting ? 'Sending…' : 'Send Invite'}</button>
          </div>
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,.6)', borderRadius: 'var(--r)', fontSize: 11, color: 'var(--txt3)' }}>
            💡 The user will receive an email with a link to set their password. After they log in for the first time, their account will be active. If invite email doesn't work, use <strong>Supabase Dashboard → Authentication → Users → Invite User</strong> then set their role here.
          </div>
        </div>
      )}

      {/* User list */}
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--txt3)' }}>Loading users…</div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Linked Agent</th>
                <th>User ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--txt3)', padding: 24 }}>No users yet.</td></tr>
              )}
              {users.map(u => {
                const linkedAgent = agents.find(a => a.id === u.agent_id)
                const isEditing = editUser?.id === u.id
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>
                      {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : <span style={{ color: 'var(--txt3)' }}>—</span>}
                    </td>
                    <td>
                      {isEditing ? (
                        <select className="form-ctrl" value={editUser.role} onChange={e => setEditUser(eu => ({ ...eu, role: e.target.value }))} style={{ width: 120 }}>
                          <option value="agent">Agent</option>
                          <option value="admin">Admin</option>
                          <option value="broker">Broker</option>
                        </select>
                      ) : (
                        <span className={`badge ${u.role === 'broker' ? 'badge-gold' : u.role === 'admin' ? 'badge-teal' : 'badge-navy'}`}>
                          {u.role}
                        </span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select className="form-ctrl" value={editUser.agent_id || ''} onChange={e => setEditUser(eu => ({ ...eu, agent_id: e.target.value || null }))} style={{ width: 200 }}>
                          <option value="">— None —</option>
                          {agents.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
                        </select>
                      ) : linkedAgent ? (
                        <span style={{ fontSize: 12 }}>{linkedAgent.first_name} {linkedAgent.last_name}</span>
                      ) : (
                        <span style={{ color: 'var(--txt3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 10, color: 'var(--txt3)', fontFamily: 'monospace' }}>{u.id?.slice(0, 8)}…</td>
                    <td>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditUser(null)}>Cancel</button>
                          <button className="btn btn-teal btn-sm" onClick={() => updateUser(u.id, { role: editUser.role, agent_id: editUser.agent_id })}>Save</button>
                          <button className="btn btn-ghost btn-sm" style={{color:'var(--amber)'}} onClick={() => updateUser(u.id, { needs_password: true })}>🔑 Force PW Reset</button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditUser({ ...u })}>✏ Edit</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--txt3)', borderTop: '1px solid var(--bdr)' }}>
        To invite a new user: click <strong>+ Invite User</strong> above, or go to <strong>Supabase Dashboard → Authentication → Users → Invite User</strong>, then set their role and agent link here.
      </div>
    </div>
  )
}
