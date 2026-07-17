import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getMode } from './mode'

// Routes each signed-in user to the segment they're allowed to see:
//   - single-segment staff are pinned to their segment
//   - owners ('both') pick a mode per session via /choose
// Wraps all protected routes; assumes ProtectedRoute already ran.
export function ModeGate() {
  const { profile, loading } = useAuth()
  const location = useLocation()
  const inDomestic = location.pathname.startsWith('/domestic')
  const inCommercial = location.pathname.startsWith('/commercial')
  const inChooser = location.pathname === '/choose'
  // Account pages (business details, pricing) are shared config — reachable
  // from either mode, so the gate leaves them alone.
  const inAccount = location.pathname.startsWith('/account')

  if (loading || !profile) {
    return <div className="flex h-screen items-center justify-center text-ink">Loading…</div>
  }

  const access = profile.segment_access

  if (inAccount) return <Outlet />

  if (access === 'commercial' && (inDomestic || inChooser)) return <Navigate to="/commercial" replace />
  if (access === 'domestic' && !inDomestic) return <Navigate to="/domestic" replace />

  if (access === 'both' && !inChooser) {
    const mode = getMode()
    if (!mode) return <Navigate to="/choose" replace />
    if (mode === 'domestic' && !inDomestic) return <Navigate to="/domestic" replace />
    if (mode === 'commercial' && !inCommercial) return <Navigate to="/commercial" replace />
  }

  return <Outlet />
}
