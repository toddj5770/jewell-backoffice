import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AppShell() {
  const { profile, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [settings, setSettings] = useState(null)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('org_name, logo_base64').single()
    setSettings(data)
  }

  const [showPwModal, setShowPwModal] = useState(false)
  const [pwForm, setPwForm] = useState({ pw: '', confirm: '', error: '', done: false, saving: false })

  async function changePassword() {
    if (pwForm.pw.length < 8) { setPwForm(f=>({...f,error:'Password must be at least 8 characters.'})); return }
    if (pwForm.pw !== pwForm.confirm) { setPwForm(f=>({...f,error:'Passwords do not match.'})); return }
    setPwForm(f=>({...f,saving:true,error:''}))
    const { error } = await supabase.auth.updateUser({ password: pwForm.pw })
    if (error) { setPwForm(f=>({...f,error:error.message,saving:false})); return }
    setPwForm(f=>({...f,done:true,saving:false}))
    setTimeout(()=>setShowPwModal(false),1500)
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    window.location.href = '/login'
  }

  const name = profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'User'
  const roleLabel = profile?.role === 'broker' ? 'Broker' : profile?.role === 'admin' ? 'Admin' : 'Agent'
  const orgName = settings?.org_name || 'Jewell Real Estate'

  return (
    <div className="app-shell">
      <header className="hdr">
        <div className="hdr-brand">
          {settings?.logo_base64 ? (
            <img src={settings.logo_base64} alt="Logo"
              style={{width:40,height:40,objectFit:'contain',borderRadius:6,background:'rgba(255,255,255,.1)',padding:2}}/>
          ) : (
            <div style={{width:38,height:38,background:'var(--gold)',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:20,color:'var(--navy)'}}>
              {orgName.charAt(0)}
            </div>
          )}
          <div>
            <div className="hdr-name">{orgName}</div>
            <div className="hdr-sub">Back Office</div>
          </div>
        </div>
        <div className="hdr-right">
          <span className="hdr-user">{name}</span>
          <span className="hdr-badge">{roleLabel}</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>{ setShowPwModal(true); setPwForm({pw:'',confirm:'',error:'',done:false,saving:false}) }}
            style={{color:'rgba(255,255,255,.6)',borderColor:'rgba(255,255,255,.2)'}}>
            🔑 Password
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleSignOut} disabled={signingOut}
            style={{color:'rgba(255,255,255,.6)',borderColor:'rgba(255,255,255,.2)'}}>
            {signingOut ? '…' : 'Sign Out'}
          </button>
          {showPwModal && (
            <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setShowPwModal(false)}>
              <div style={{background:'var(--white)',borderRadius:12,padding:28,width:360,boxShadow:'0 20px 60px rgba(0,0,0,.3)'}} onClick={e=>e.stopPropagation()}>
                <div style={{fontWeight:800,fontSize:16,color:'var(--navy)',marginBottom:4}}>Change Password</div>
                <div style={{fontSize:12,color:'var(--txt3)',marginBottom:16}}>Set a new password for your account.</div>
                {pwForm.done ? (
                  <div style={{color:'var(--green)',textAlign:'center',padding:12}}>✓ Password updated!</div>
                ) : (
                  <>
                    {pwForm.error && <div style={{color:'var(--red)',fontSize:12,marginBottom:10,padding:'8px 10px',background:'#fff0f0',borderRadius:6}}>{pwForm.error}</div>}
                    <div className="form-group"><label className="form-label">New Password</label><input className="form-ctrl" type="password" value={pwForm.pw} autoFocus placeholder="At least 8 characters" onChange={e=>setPwForm(f=>({...f,pw:e.target.value}))}/></div>
                    <div className="form-group"><label className="form-label">Confirm Password</label><input className="form-ctrl" type="password" value={pwForm.confirm} placeholder="Repeat password" onChange={e=>setPwForm(f=>({...f,confirm:e.target.value}))}/></div>
                    <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>setShowPwModal(false)}>Cancel</button>
                      <button className="btn btn-gold btn-sm" onClick={changePassword} disabled={pwForm.saving}>{pwForm.saving?'Saving…':'Update Password'}</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <nav className="nav">
        {isAdmin ? (
          <>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/dashboard">Dashboard</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/transactions">Transactions</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/agents">Agents</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/plans">Commission Plans</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/money">Money</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/billing">Agent Billing</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/onboarding">Onboarding</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/reports">Reports</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/settings">⚙ Settings</NavLink>
          </>
        ) : (
          <>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/my-dashboard">My Dashboard</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/my-transactions">My Transactions</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/my-disbursements">My Disbursements</NavLink>
            <NavLink className={({isActive}) => `nav-item${isActive?' active':''}`} to="/my-onboarding">Onboarding</NavLink>
          </>
        )}
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
