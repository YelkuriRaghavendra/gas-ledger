import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatDate } from '../utils/format'

export function ActivityFeed() {
  const { data, loading, error } = useActivityFeed(50)

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Activity</h1>
      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      <ul className="space-y-2">
        {data.map((entry) => (
          <li key={entry.id} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{entry.customer_name}</p>
              <p className="text-xs text-ink/60">{formatDate(entry.created_at)}</p>
            </div>
            <p className="text-xs capitalize text-ink/60">
              {entry.type} {entry.amount > 0 && `· ${formatCurrency(entry.amount)}`}
            </p>
          </li>
        ))}
        {!loading && data.length === 0 && <p className="text-ink/60">No activity yet.</p>}
      </ul>
    </div>
  )
}
