import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getMode, setMode } from './mode'

export function ModeGate() {
  const { profile, loading } = useAuth()
  const location = useLocation()
  const inDomestic = location.pathname.startsWith('/domestic')
  const inCommercial = location.pathname.startsWith('/commercial')
  const inAccount = location.pathname.startsWith('/account')

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
