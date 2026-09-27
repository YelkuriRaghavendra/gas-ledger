import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/db'
import { setSignOutReason } from './signOutReason'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  // Set when the profile fetch failed for a reason that is not "no such
  // profile". The session is still good, so this is a state of its own
  // rather than a sign-out: without it a null profile is indistinguishable
  // from a profile still loading, and the gate spins forever.
  profileError: boolean
  retryProfile: () => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(false)
  // Bumped by retryProfile to re-run the fetch effect on an unchanged
  // session. Without it the only thing that re-triggers the fetch is a new
  // session object, which arrives at the next token refresh -- about an hour
  // away.
  const [profileAttempt, setProfileAttempt] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) {
        setProfile(null)
        setProfileError(false)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    setLoading(true)
    setProfileError(false)
    supabase
      .from('profiles')
      .select('id, name, role, segment_access, active, updated_at, updated_by')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        const loaded = data as Profile | null

        // PGRST116 ("no rows") from .single() means the profile genuinely
        // doesn't exist -- sign out so the user isn't stuck on a loading
        // screen forever. Any other error (network blip, RLS hiccup, a 5xx)
        // is a fetch failure, not evidence the profile is missing: signing
        // out here would drop a perfectly valid session over a transient
        // problem and blame the owner for it. Keep the session, stop
        // loading, and raise profileError so the gate can offer a retry --
        // clearing loading alone would still leave a null profile, which
        // reads as "still loading" and parks the user on the spinner.
        if (error) {
          if (error.code === 'PGRST116') {
            setSignOutReason('no-profile')
            setProfile(null)
            setLoading(false)
            void supabase.auth.signOut()
            return
          }
          console.error('Failed to load profile:', error.message)
          setProfileError(true)
          setLoading(false)
          return
        }

        // A deactivated profile is already banned in GoTrue, but their
        // current access token stays valid until it expires -- signing out
        // here clears the screen now rather than at the next refresh.
        if (!loaded || !loaded.active) {
          // `loaded` being falsy without an error is not something .single()
          // should produce, but if it ever does the copy should say the
          // profile is missing, not that it was switched off.
          setSignOutReason(loaded ? 'inactive' : 'no-profile')
          setProfile(null)
          setLoading(false)
          void supabase.auth.signOut()
          return
        }

        setProfile(loaded)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session, profileAttempt])

  function retryProfile() {
    setProfileAttempt((n) => n + 1)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, profileError, retryProfile, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
