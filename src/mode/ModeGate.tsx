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
  const inChooser = location.pathname === '/choose'

  if (loading || !profile) {
    return <div className="flex h-screen items-center justify-center text-ink">Loading…</div>
  }

  const access = profile.segment_access

  if (access === 'commercial' && (inDomestic || inChooser)) return <Navigate to="/" replace />
  if (access === 'domestic' && !inDomestic) return <Navigate to="/domestic" replace />

  if (access === 'both' && !inChooser) {
    const mode = getMode()
    if (!mode) return <Navigate to="/choose" replace />
    if (mode === 'domestic' && !inDomestic) return <Navigate to="/domestic" replace />
    if (mode === 'commercial' && inDomestic) return <Navigate to="/" replace />
  }

  return <Outlet />
}
