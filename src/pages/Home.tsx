import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatDate } from '../utils/format'
import { getActivityIcon } from '../utils/activityIcon'
import { HeroCard } from '../components/HeroCard'

export function Home() {
  const { profile, signOut } = useAuth()
  const { data, loading, error } = useCustomerBalances()
  const { data: activity } = useActivityFeed(8)

  const totalDue = data.reduce((sum, c) => sum + c.amount_due, 0)
  const totalSold = data.reduce((sum, c) => sum + c.sold, 0)
  const totalReturned = data.reduce((sum, c) => sum + c.returned, 0)
  const totalEmptiesOut = data.reduce((sum, c) => sum + c.empties_outstanding, 0)
  const customersWithDue = data.filter((c) => c.amount_due > 0).length

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="text-xl font-bold text-ink">{profile?.name ?? '…'}</h1>
        </div>
        <button onClick={signOut} className="text-sm text-accent">
          Log out
        </button>
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <HeroCard>
            <p className="text-xs font-semibold uppercase text-mutedOnDark">Amount to collect</p>
            <p className="mb-1 font-display text-3xl font-bold text-white">{formatCurrency(totalDue)}</p>
            <p className="mb-4 text-sm text-mutedOnDark">outstanding from {customersWithDue} customers</p>
            <div className="flex gap-6 border-t border-white/10 pt-4">
              <div>
                <p className="text-xs text-mutedOnDark">Sold</p>
                <p className="font-display font-bold text-white">{totalSold}</p>
              </div>
              <div>
                <p className="text-xs text-mutedOnDark">Returned</p>
                <p className="font-display font-bold text-green-400">{totalReturned}</p>
              </div>
              <div>
                <p className="text-xs text-mutedOnDark">Empties out</p>
                <p className="font-display font-bold text-accent">{totalEmptiesOut}</p>
              </div>
            </div>
          </HeroCard>

          <div className="my-4 flex gap-3">
            <Link to="/sale" className="flex-1 rounded-lg bg-accent py-3 text-center font-semibold text-white">
              + New sale
            </Link>
            <Link
              to="/return"
              className="flex-1 rounded-lg border border-borderMuted bg-white py-3 text-center font-semibold text-ink"
            >
              ↩ Log return
            </Link>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-ink">Recent activity</h2>
            <Link to="/activity" className="text-sm text-accent">
              See all
            </Link>
          </div>
          <ul className="space-y-2">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                <span className="text-xl">{getActivityIcon(entry.type)}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">{entry.customer_name}</p>
                  <p className="text-xs text-muted">
                    {entry.type === 'sale' && `${entry.qty} sold · ${entry.empties} empties in`}
                    {entry.type === 'return' && 'Empties returned'}
                    {entry.type === 'payment' && formatCurrency(entry.amount)}
                  </p>
                </div>
                <p className="text-xs text-muted">{formatDate(entry.created_at)}</p>
              </li>
            ))}
            {activity.length === 0 && <p className="text-muted">No activity yet.</p>}
          </ul>
        </>
      )}
    </div>
  )
}
