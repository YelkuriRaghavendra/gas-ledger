import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAllCustomerProductBalances } from '../hooks/useAllCustomerProductBalances'
import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { HeroCard } from '../components/HeroCard'
import { InitialsBadge } from '../components/InitialsBadge'

export function Home() {
  const { profile } = useAuth()
  const { data, loading, error } = useCustomerBalances()
  const { data: productBalances } = useAllCustomerProductBalances()
  const { data: activity } = useActivityFeed(5)

  const totalDue = data.reduce((sum, c) => sum + c.amount_due, 0)
  const totalSold = productBalances.reduce((sum, pb) => sum + pb.sold, 0)
  const totalReturned = productBalances.reduce((sum, pb) => sum + pb.returned, 0)
  const totalEmptiesOut = productBalances.reduce((sum, pb) => sum + pb.empties_outstanding, 0)
  const customersWithDue = data.filter((c) => c.amount_due > 0).length

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="p-5 pb-[110px] pt-3">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.6px] text-subtle">{today}</p>
          <p className="mt-[3px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">
            Hello, {profile?.name ?? '…'}
          </p>
        </div>
        <InitialsBadge name={profile?.name ?? '?'} size={46} radius={16} />
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <HeroCard>
            <svg
              width="170"
              height="170"
              viewBox="0 0 24 24"
              fill="rgba(228,87,27,.16)"
              className="pointer-events-none absolute -bottom-12 -right-8"
            >
              <rect x="6" y="6" width="12" height="16.5" rx="5" />
              <rect x="8.6" y="3.6" width="6.8" height="2.6" rx="1.3" />
            </svg>
            <p className="relative text-[12.5px] font-bold uppercase tracking-[0.7px] text-[#C9BBA8]">
              Amount to collect
            </p>
            <p className="relative mt-[6px] font-display text-[44px] font-bold leading-none tracking-[-1px] text-white">
              {formatCurrency(totalDue)}
            </p>
            <p className="relative mt-[9px] text-[12.5px] font-semibold text-mutedOnDark">
              outstanding from {customersWithDue} customer{customersWithDue === 1 ? '' : 's'}
            </p>
            <div className="relative mt-5 flex items-center gap-4 rounded-2xl bg-white/[.06] px-4 py-[14px] backdrop-blur-sm">
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-mutedOnDark">Sold</p>
                <p className="mt-[2px] font-display text-[20px] font-bold text-white">{totalSold}</p>
              </div>
              <div className="h-9 w-px bg-white/[.12]" />
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-mutedOnDark">Returned</p>
                <p className="mt-[2px] font-display text-[20px] font-bold text-[#5FCF97]">{totalReturned}</p>
              </div>
              <div className="h-9 w-px bg-white/[.12]" />
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-mutedOnDark">Empties out</p>
                <p className="mt-[2px] font-display text-[20px] font-bold text-[#FF8A4C]">{totalEmptiesOut}</p>
              </div>
            </div>
          </HeroCard>

          <div className="my-4 grid grid-cols-2 gap-3">
            <Link
              to="/sale"
              className="group flex flex-col items-start gap-3 rounded-[20px] bg-gradient-to-br from-accentSoft to-accent p-[18px] text-white shadow-glow transition active:scale-[0.98]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[.18]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M5 12h14M12 5v14" />
                </svg>
              </span>
              <span className="text-[15px] font-bold tracking-[-0.2px]">New sale</span>
            </Link>
            <Link
              to="/return"
              className="group flex flex-col items-start gap-3 rounded-[20px] bg-surface p-[18px] text-ink shadow-card transition active:scale-[0.98]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: '#EAF4EE' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2E8B57" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14 4 9l5-5" />
                  <path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H9" />
                </svg>
              </span>
              <span className="text-[15px] font-bold tracking-[-0.2px]">Log return</span>
            </Link>
          </div>

          <div className="mb-3 mt-6 flex items-baseline justify-between">
            <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Recent activity</h2>
            <Link to="/activity" className="text-[13px] font-bold text-accent">
              See all
            </Link>
          </div>
          <ul className="flex flex-col gap-[10px]">
            {activity.map((entry) => {
              const tint = getActivityTint(entry.type)
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-[13px] rounded-[18px] bg-surface px-[15px] py-[14px] shadow-card"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-lg"
                    style={{ backgroundColor: tint.bg, color: tint.color }}
                  >
                    {getActivityIcon(entry.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold text-ink">{entry.customer_name}</p>
                    <p className="mt-[2px] text-xs font-medium text-subtle">
                      {entry.type === 'sale' &&
                        `${entry.qty}${entry.product_name ? ` ${entry.product_name}` : ''} sold · ${entry.empties} empties in`}
                      {entry.type === 'return' && `${entry.product_name ? `${entry.product_name} ` : ''}empties returned`}
                      {entry.type === 'payment' && 'Payment received'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-[15px] font-bold" style={{ color: tint.color }}>
                      {entry.type === 'sale' && `+${entry.qty}`}
                      {entry.type === 'return' && `−${entry.qty}`}
                      {entry.type === 'payment' && formatCurrency(entry.amount)}
                    </p>
                    <p className="mt-px text-[11px] font-semibold text-subtle">{formatRelativeDate(entry.created_at)}</p>
                  </div>
                </li>
              )
            })}
            {activity.length === 0 && (
              <li className="rounded-[18px] bg-surface px-[15px] py-8 text-center text-sm font-medium text-subtle shadow-card">
                No activity yet
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
