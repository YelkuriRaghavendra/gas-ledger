import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getMode, setMode } from './mode'

export function ModeGate() {
  const { profile, loading, profileError, retryProfile } = useAuth()
  const location = useLocation()
  const inDomestic = location.pathname.startsWith('/domestic')
  const inCommercial = location.pathname.startsWith('/commercial')
  const inAccount = location.pathname.startsWith('/account')

  // Checked before the loading branch below: the fetch failed, so the profile
  // is null and would otherwise read as "still loading" forever. The session
  // is untouched, so a retry is all this needs.
  if (profileError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-cream px-8 text-center">
        <p className="font-display text-[20px] font-bold tracking-[-0.3px] text-ink">
          Couldn’t load your profile
        </p>
        <p className="mt-2 text-sm font-medium text-muted">
          Check your connection and try again.
        </p>
        <button
          onClick={retryProfile}
          className="mt-6 h-[52px] w-full max-w-xs rounded-[16px] bg-accent text-[15px] font-bold text-white shadow-card transition active:scale-[0.99]"
        >
          Retry
        </button>
      </div>
    )
  }

  if (loading || !profile) {
    return <div className="flex h-screen items-center justify-center text-ink">Loading…</div>
  }

  const access = profile.segment_access

  if (inAccount) return <Outlet />

  if (access === 'commercial' && inDomestic) return <Navigate to="/commercial" replace />
  if (access === 'domestic' && !inDomestic) return <Navigate to="/domestic" replace />

  if (access === 'both') {
    const mode = getMode()
    if (!mode) {
      setMode('commercial')
      return <Navigate to="/commercial" replace />
    }
    if (mode === 'domestic' && !inDomestic) return <Navigate to="/domestic" replace />
    if (mode === 'commercial' && !inCommercial) return <Navigate to="/commercial" replace />
  }

  return <Outlet />
}
