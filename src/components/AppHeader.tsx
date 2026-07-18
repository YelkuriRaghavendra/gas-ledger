import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { InitialsBadge } from './InitialsBadge'
import { SwapIcon } from './icons'
import { setMode } from '../mode/mode'

export type HeaderView = 'commercial' | 'domestic' | 'stock'

// The switch button cycles through the three views in order.
const ORDER: HeaderView[] = ['commercial', 'domestic', 'stock']

const initials = (s: string) => s.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

export function AppHeader({ view, onOpenAccount, title }: { view: HeaderView; onOpenAccount: () => void; title?: string }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data } = useAgencySettings()
  const canSwitch = profile?.segment_access === 'both'
  const biz = data?.business_name || 'Cylinder Tracker'

  const label = view === 'commercial' ? 'Commercial' : view === 'domestic' ? 'Domestic' : 'Stock'
  const badge =
    view === 'commercial'
      ? 'bg-gradient-to-br from-accentSoft to-accent'
      : view === 'domestic'
      ? 'bg-gradient-to-br from-[#3DA06A] to-[#2E8B57]'
      : 'bg-gradient-to-br from-inkSoft to-ink'

  function switchSide() {
    const next = ORDER[(ORDER.indexOf(view) + 1) % ORDER.length]
    if (next !== 'stock') setMode(next)
    navigate(next === 'commercial' ? '/' : next === 'domestic' ? '/domestic' : '/stock', { replace: true })
  }

  return (
    <div className="flex items-center justify-between px-4 pb-3 pt-4">
      {title ? (
        <h1 className="min-w-0 truncate font-display text-[24px] font-bold tracking-[-0.5px] text-ink">{title}</h1>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <div className={`flex h-[30px] w-[30px] items-center justify-center rounded-[10px] font-display text-[13px] font-bold text-white ${badge}`}>
            {initials(biz)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-extrabold text-ink">{biz}</p>
            <p className="text-[9.5px] font-semibold text-subtle">
              {label}{profile?.role ? ` · ${profile.role[0].toUpperCase()}${profile.role.slice(1)}` : ''}
            </p>
          </div>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-[9px]">
        {canSwitch && (
          <button
            onClick={switchSide}
            aria-label="Switch view"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-[#FBEDE4]"
          >
            <SwapIcon size={18} color="#E4571B" strokeWidth={2.2} />
          </button>
        )}
        <button onClick={onOpenAccount} aria-label="Account">
          <InitialsBadge name={profile?.name ?? '?'} size={34} radius={11} />
        </button>
      </div>
    </div>
  )
}
