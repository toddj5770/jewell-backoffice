import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
      // PASSWORD_RECOVERY event fires when user clicks reset password link
      if (event === 'PASSWORD_RECOVERY') {
        window.location.replace('/set-password')
        return
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, agent_id, first_name, last_name, needs_password')
      .eq('id', userId)
      .single()
    
    if (error) {
      console.error('Profile fetch error:', error)
      setLoading(false)
      return
    }
    setProfile(data)
    setLoading(false)
    // If admin flagged this user as needing to set a password, redirect them
    if (data?.needs_password && window.location.pathname !== '/set-password') {
      window.location.replace('/set-password')
    }
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
