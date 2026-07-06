import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'

export function ActivityFeed() {
  const { data, loading, error } = useActivityFeed(50)

  return (
    <div className="p-5 pb-[110px] pt-3">
      <h1 className="mb-5 font-display text-[26px] font-bold tracking-[-0.5px] text-ink">All activity</h1>
      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      <ul className="flex flex-col gap-[10px]">
        {data.map((entry) => {
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
        {!loading && data.length === 0 && (
          <li className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
            No activity yet
          </li>
        )}
      </ul>
    </div>
  )
}
