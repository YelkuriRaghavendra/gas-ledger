import { Link } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { InitialsBadge } from './InitialsBadge'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const rowCls = 'flex items-center justify-between border-b border-[#F1E9DB] px-1 py-4 text-[14.5px] font-bold text-ink'

export function AccountMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, signOut } = useAuth()
  const { data } = useAgencySettings()
  return (
    <BottomSheet open={open} onClose={onClose} slideUp>
      <div className="mb-1 flex items-center gap-3 pb-4">
        <InitialsBadge name={profile?.name ?? '?'} size={52} radius={16} />
        <div>
          <p className="text-[17px] font-extrabold text-ink">{profile?.name}</p>
          <p className="text-[12.5px] font-semibold text-muted">
            {(data?.business_name || 'Cylinder Tracker')}{profile?.role ? ` · ${cap(profile.role)}` : ''}
          </p>
        </div>
      </div>
      <Link to="/account/business" onClick={onClose} className={rowCls}>Business details <span className="text-[#C0B4A2]">›</span></Link>
      <Link to="/account/pricing" onClick={onClose} className={rowCls}>Products &amp; pricing <span className="text-[#C0B4A2]">›</span></Link>
      <Link to="/account/export" onClick={onClose} className={`${rowCls} border-b-0`}>Export ledger <span className="text-[#C0B4A2]">›</span></Link>
      <button onClick={signOut} className="mt-3 h-[50px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-surface text-[15px] font-bold" style={{ color: '#C23B22' }}>
        Sign out
      </button>
    </BottomSheet>
  )
}
