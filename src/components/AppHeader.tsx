import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { InitialsBadge } from './InitialsBadge'
import { SwapIcon } from './icons'
import { setMode } from '../mode/mode'
import type { Segment } from '../types/db'

const initials = (s: string) => s.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

export function AppHeader({ segment, onOpenAccount }: { segment: Segment; onOpenAccount: () => void }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data } = useAgencySettings()
  const canSwitch = profile?.segment_access === 'both'
  const isCommercial = segment === 'commercial'
  const biz = data?.business_name || 'Cylinder Tracker'

  function switchSide() {
    const next = isCommercial ? 'domestic' : 'commercial'
    setMode(next)
    navigate(next === 'domestic' ? '/domestic' : '/', { replace: true })
  }

  return (
    <div className="flex items-center justify-between px-4 pb-3 pt-4">
      <div className="flex min-w-0 items-center gap-2">
        <div className={`flex h-[30px] w-[30px] items-center justify-center rounded-[10px] font-display text-[13px] font-bold text-white ${isCommercial ? 'bg-gradient-to-br from-accentSoft to-accent' : 'bg-gradient-to-br from-[#3DA06A] to-[#2E8B57]'}`}>
          {initials(biz)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-extrabold text-ink">{biz}</p>
          <p className="text-[9.5px] font-semibold text-subtle">
            {isCommercial ? 'Commercial' : 'Domestic'}{profile?.role ? ` · ${profile.role[0].toUpperCase()}${profile.role.slice(1)}` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-[9px]">
        {canSwitch && (
          <button
            onClick={switchSide}
            aria-label="Switch business side"
            className={`flex h-[34px] w-[34px] items-center justify-center rounded-[11px] ${isCommercial ? 'bg-[#E7F3EC]' : 'bg-[#FDE9DE]'}`}
          >
            <SwapIcon size={18} color={isCommercial ? '#2E8B57' : '#E4571B'} strokeWidth={2.2} />
          </button>
        )}
        <button onClick={onOpenAccount} aria-label="Account">
          <InitialsBadge name={profile?.name ?? '?'} size={34} radius={11} />
        </button>
      </div>
    </div>
  )
}
