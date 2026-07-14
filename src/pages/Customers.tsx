import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAllCustomerProductBalances } from '../hooks/useAllCustomerProductBalances'
import { formatCurrency } from '../utils/format'
import { Avatar } from '../components/Avatar'
import { StatusPill } from '../components/StatusPill'
import { SearchIcon, MapPinIcon } from '../components/icons'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'

export function Customers() {
  const { data, loading, error } = useCustomerBalances()
  const { data: productBalances } = useAllCustomerProductBalances()
  const [search, setSearch] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)

  const emptiesByCustomer = useMemo(() => {
    const map = new Map<number, number>()
    for (const pb of productBalances) {
      map.set(pb.customer_id, (map.get(pb.customer_id) ?? 0) + pb.empties_outstanding)
    }
    return map
  }, [productBalances])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q) ||
        (c.address ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  const totalEmptiesOut = productBalances.reduce((sum, pb) => sum + pb.empties_outstanding, 0)

  return (
    <div className="pb-[110px]">
      <AppHeader segment="commercial" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="p-5 pt-1">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Customers</h1>
        <div className="mb-5 mt-2 flex gap-2">
          <span className="rounded-full bg-surface px-[13px] py-[6px] text-xs font-bold text-ink shadow-card">
            {data.length} account{data.length === 1 ? '' : 's'}
          </span>
          <span className="rounded-full bg-surface px-[13px] py-[6px] text-xs font-bold text-[#C23B22] shadow-card">
            {totalEmptiesOut} empties out
          </span>
        </div>

        <div className="relative mb-[18px]">
          <span className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2">
            <SearchIcon size={18} />
          </span>
          <input
            type="search"
            placeholder="Search name, location or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface pl-11 pr-4 font-semibold text-ink shadow-card"
          />
        </div>

        {loading && <p className="text-muted">Loading…</p>}
        {error && <p className="text-red-600">{error}</p>}

        <ul className="flex flex-col gap-[11px]">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                to={`/customers/${c.id}`}
                className="flex items-center gap-[13px] rounded-[20px] bg-surface p-[15px] shadow-card transition active:scale-[0.99]"
              >
                <Avatar id={c.id} name={c.name} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15.5px] font-bold text-ink">{c.name}</p>
                  <p className="mt-[3px] flex items-center gap-[4px] truncate text-[11.5px] font-semibold text-muted">
                    <MapPinIcon size={13} />
                    <span className="truncate">
                      {c.address || '—'} · {c.phone || 'No phone'}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-[6px]">
                  <StatusPill owed={emptiesByCustomer.get(c.id) ?? 0} />
                  <p className="text-xs font-bold text-subtle">{formatCurrency(c.amount_due)} due</p>
                </div>
              </Link>
            </li>
          ))}
          {!loading && filtered.length === 0 && (
            <li className="rounded-[20px] bg-surface px-4 py-10 text-center text-sm font-medium text-subtle shadow-card">
              {search ? 'No customers match your search' : 'No customers yet'}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
