import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useState } from 'react'

export default function AppShell() {
  const { profile, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/login')
  }

  const name = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`
    : profile?.agents?.first_name
      ? `${profile.agents.first_name} ${profile.agents.last_name || ''}`
      : 'User'

  const roleLabel = profile?.role === 'broker' ? 'Broker' : profile?.role === 'admin' ? 'Admin' : 'Agent'

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="hdr">
        <div className="hdr-brand">
          <div style={{ width: 38, height: 38, background: 'var(--gold)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 20, color: 'var(--navy)' }}>J</div>
          <div>
            <div className="hdr-name">Jewell Real Estate</div>
            <div className="hdr-sub">Back Office</div>
          </div>
        </div>
        <div className="hdr-right">
          <span className="hdr-user">{name}</span>
          <span className="hdr-badge">{roleLabel}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleSignOut}
            disabled={signingOut}
            style={{ color: 'rgba(255,255,255,.6)', borderColor: 'rgba(255,255,255,.2)' }}
          >
            {signingOut ? '…' : 'Sign Out'}
          </button>
        </div>
      </header>

      {/* Nav */}
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

      {/* Page content */}
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
