import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data, error } = await signIn(email, password)
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      // Manually redirect after successful login
      if (data?.session) {
        window.location.href = '/dashboard'
      }
    } catch (err) {
      setError(err.message || 'Unknown error')
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div style={{width:56,height:56,background:'var(--navy)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px',fontSize:24,fontWeight:900,color:'var(--gold)'}}>J</div>
          <div className="login-title">Jewell Real Estate</div>
          <div className="login-sub">Back Office — Sign In</div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-ctrl" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@jewellre.com" required autoFocus/>
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-ctrl" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required/>
          </div>
          <button type="submit" className="btn btn-gold"
            style={{width:'100%',justifyContent:'center',padding:'10px',fontSize:13,marginTop:4}}
            disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{textAlign:'center',marginTop:18,fontSize:11,color:'var(--txt3)'}}>
          Contact your broker if you need access.
        </p>
      </div>
    </div>
  )
}
