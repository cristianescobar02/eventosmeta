import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'

interface AuthState {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, profile: null, session: null, loading: true,
  })

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return data as Profile | null
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!state.user) return
    const profile = await loadProfile(state.user.id)
    setState(s => ({ ...s, profile }))
  }, [state.user, loadProfile])

  useEffect(() => {
    // Sesión inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null
      const profile = user ? await loadProfile(user.id) : null
      setState({ user, profile, session, loading: false })
    })

    // Cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null
      const profile = user ? await loadProfile(user.id) : null
      setState({ user, profile, session, loading: false })
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  // Escuchar cambios en el perfil del usuario actual (actualizaciones de plan en tiempo real)
  useEffect(() => {
    if (!state.user) return
    const channel = supabase
      .channel(`profile:${state.user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${state.user.id}`,
      }, (payload) => {
        setState(s => ({ ...s, profile: payload.new as Profile }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [state.user])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }

  async function signUp(email: string, password: string, fullName: string): Promise<string | null> {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return error?.message ?? null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      ...state,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      isAdmin: state.profile?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
