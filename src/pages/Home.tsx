import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { formatCurrency } from '../utils/format'

export function Home() {
  const { profile, signOut } = useAuth()
  const { data, loading, error } = useCustomerBalances()

  const totalDue = data.reduce((sum, c) => sum + c.amount_due, 0)
  const totalEmptiesOut = data.reduce((sum, c) => sum + c.empties_outstanding, 0)
  const customersWithDue = data.filter((c) => c.amount_due > 0).length

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-ink/60">Welcome back</p>
          <h1 className="text-xl font-bold text-ink">{profile?.name ?? '…'}</h1>
        </div>
        <button onClick={signOut} className="text-sm text-accent">
          Log out
        </button>
      </div>

      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-ink/60">Amount to collect</p>
            <p className="text-lg font-bold text-ink">{formatCurrency(totalDue)}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-ink/60">Empties outstanding</p>
            <p className="text-lg font-bold text-ink">{totalEmptiesOut}</p>
          </div>
          <div className="col-span-2 rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-ink/60">Customers with dues</p>
            <p className="text-lg font-bold text-ink">{customersWithDue}</p>
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Link to="/customers" className="flex-1 rounded-lg bg-accent py-3 text-center font-semibold text-white">
          Customers
        </Link>
        <Link
          to="/activity"
          className="flex-1 rounded-lg border border-accent py-3 text-center font-semibold text-accent"
        >
          Activity
        </Link>
      </div>
    </div>
  )
}
