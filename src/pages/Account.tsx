import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { Avatar } from '../components/Avatar'

export function Account() {
  const { profile, signOut } = useAuth()
  const { data: settings } = useAgencySettings()

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Account</h1>
      <div className="mb-4 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
        <Avatar name={profile?.name ?? '?'} />
        <div>
          <p className="font-semibold text-ink">{profile?.name}</p>
          <p className="text-sm text-muted">
            {settings?.business_name || 'Cylinder Tracker'} · {profile?.role}
          </p>
        </div>
      </div>
      <div className="mb-4 divide-y divide-ink/10 rounded-2xl bg-white shadow-sm">
        <Link to="/account/business" className="flex items-center justify-between p-4">
          <span className="text-ink">Business details</span>
          <span className="text-subtle">›</span>
        </Link>
        <Link to="/account/pricing" className="flex items-center justify-between p-4">
          <span className="text-ink">Cylinder pricing</span>
          <span className="text-subtle">›</span>
        </Link>
        <Link to="/account/export" className="flex items-center justify-between p-4">
          <span className="text-ink">Export ledger</span>
          <span className="text-subtle">›</span>
        </Link>
      </div>
      <button onClick={signOut} className="w-full rounded-2xl bg-white py-4 font-semibold text-red-600 shadow-sm">
        Sign out
      </button>
    </div>
  )
}
