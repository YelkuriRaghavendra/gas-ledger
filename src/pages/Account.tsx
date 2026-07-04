import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { InitialsBadge } from '../components/InitialsBadge'

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function Account() {
  const { profile, signOut } = useAuth()
  const { data: settings } = useAgencySettings()

  return (
    <div className="p-5 pb-[110px] pt-2">
      <h1 className="mb-5 font-display text-2xl font-bold tracking-[-0.4px] text-ink">Account</h1>

      <div className="mb-4 flex items-center gap-[14px] rounded-[20px] border border-[#EFE7D8] bg-white p-5">
        <InitialsBadge name={profile?.name ?? '?'} size={56} radius={16} />
        <div>
          <p className="text-[17px] font-extrabold text-ink">{profile?.name}</p>
          <p className="mt-[2px] text-[13px] font-semibold text-muted">
            {settings?.business_name || 'Cylinder Tracker'} · {profile?.role ? capitalize(profile.role) : ''}
          </p>
        </div>
      </div>

      <div className="mb-[22px] overflow-hidden rounded-[20px] border border-[#EFE7D8] bg-white">
        <Link
          to="/account/business"
          className="flex items-center justify-between border-b border-[#F1E9DB] px-[18px] py-4 text-sm font-semibold text-ink"
        >
          Business details <span style={{ color: '#C0B4A2' }}>›</span>
        </Link>
        <Link
          to="/account/pricing"
          className="flex items-center justify-between border-b border-[#F1E9DB] px-[18px] py-4 text-sm font-semibold text-ink"
        >
          Products <span style={{ color: '#C0B4A2' }}>›</span>
        </Link>
        <Link to="/account/export" className="flex items-center justify-between px-[18px] py-4 text-sm font-semibold text-ink">
          Export ledger <span style={{ color: '#C0B4A2' }}>›</span>
        </Link>
      </div>

      <button
        onClick={signOut}
        className="h-[52px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-white text-[15px] font-bold"
        style={{ color: '#C23B22' }}
      >
        Sign out
      </button>
    </div>
  )
}
