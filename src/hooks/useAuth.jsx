import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check URL hash FIRST before anything else loads
    // Supabase puts tokens in the hash for invite/recovery links
    const hash = window.location.hash
    const isInviteOrRecovery = hash.includes('type=invite') || hash.includes('type=recovery') || hash.includes('type=signup')
    if (isInviteOrRecovery && window.location.pathname !== '/set-password') {
      // Redirect immediately, preserving the hash so set-password can use the token
      window.location.replace('/set-password' + hash)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
      // Catch PASSWORD_RECOVERY event (reset password link)
      if (event === 'PASSWORD_RECOVERY') {
        window.location.replace('/set-password')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    // Simple query - just get the profile row, no joins
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, agent_id, first_name, last_name')
      .eq('id', userId)
      .single()
    
    if (error) {
      console.error('Profile fetch error:', error)
      setLoading(false)
      return
    }
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const isAdmin = profile?.role === 'broker' || profile?.role === 'admin'
  const isAgent = profile?.role === 'agent'

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, isAdmin, isAgent }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
