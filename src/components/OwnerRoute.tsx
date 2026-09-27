import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Owner-only screens. The data behind them is already gated in the database;
// this stops a staff member who typed the URL from landing on a page of errors.
export function OwnerRoute() {
  const { profile, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-ink">Loading…</div>
  }

  if (profile?.role !== 'owner') {
    return <Navigate to="/account" replace />
  }

  return <Outlet />
}
