import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'

export function ActivityFeed() {
  const { data, loading, error } = useActivityFeed(50)

  return (
    <div className="p-5 pb-[110px] pt-2">
      <h1 className="mb-4 font-display text-2xl font-bold tracking-[-0.4px] text-ink">All activity</h1>
      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      <ul className="flex flex-col gap-[10px]">
        {data.map((entry) => {
          const tint = getActivityTint(entry.type)
          return (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-2xl border border-[#EFE7D8] bg-white px-[14px] py-[13px]"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ backgroundColor: tint.bg, color: tint.color }}
              >
                {getActivityIcon(entry.type)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{entry.customer_name}</p>
                <p className="mt-px text-xs font-medium text-[#9A8F80]">
                  {entry.type === 'sale' && `${entry.qty} sold · ${entry.empties} empties in`}
                  {entry.type === 'return' && 'Empties returned'}
                  {entry.type === 'payment' && 'Payment received'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-[15px] font-bold" style={{ color: tint.color }}>
                  {entry.type === 'sale' && `+${entry.qty}`}
                  {entry.type === 'return' && `−${entry.qty}`}
                  {entry.type === 'payment' && formatCurrency(entry.amount)}
                </p>
                <p className="text-[11px] font-semibold text-[#B3A796]">{formatRelativeDate(entry.created_at)}</p>
              </div>
            </li>
          )
        })}
        {!loading && data.length === 0 && <p className="text-muted">No activity yet.</p>}
      </ul>
    </div>
  )
}
