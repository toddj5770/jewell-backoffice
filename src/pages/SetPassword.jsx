import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUserEmail(session.user.email || '')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setUserEmail(session.user.email || '')
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    // Update password
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) { setError(pwError.message); setLoading(false); return }
    // Clear the needs_password flag
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await supabase.from('profiles').update({ needs_password: false }).eq('id', session.user.id)
    }
    setDone(true)
    setTimeout(() => { window.location.href = '/' }, 2000)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div style={{ width: 56, height: 56, background: 'var(--navy)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24, fontWeight: 900, color: 'var(--gold)' }}>J</div>
          <div className="login-title">Jewell Real Estate</div>
          <div className="login-sub">{done ? 'Password Set!' : 'Set Your Password'}</div>
        </div>
        {done ? (
          <div style={{ textAlign: 'center', color: 'var(--green)', padding: 20 }}>
            ✓ Password set successfully. Taking you to the app…
          </div>
        ) : (
          <>
            {userEmail && (
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--txt3)', marginBottom: 16, padding: '8px 12px', background: 'var(--surf)', borderRadius: 'var(--r)' }}>
                Setting password for <strong>{userEmail}</strong>
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16, textAlign: 'center' }}>
              Please set a password so you can log in next time.
            </p>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-ctrl" type="password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters" required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input className="form-ctrl" type="password" value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password" required />
              </div>
              <button type="submit" className="btn btn-gold"
                style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 13, marginTop: 4 }}
                disabled={loading}>
                {loading ? 'Setting password…' : 'Set Password & Continue'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
