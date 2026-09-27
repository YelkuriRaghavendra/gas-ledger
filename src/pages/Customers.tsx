import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAllCustomerProductBalances } from '../hooks/useAllCustomerProductBalances'
import { formatCurrency } from '../utils/format'
import { Avatar } from '../components/Avatar'
import { StatusPill } from '../components/StatusPill'
import { SearchIcon, MapPinIcon, XIcon, SortIcon, ChevronRightIcon, UserPlusIcon } from '../components/icons'
import { AppHeader } from '../components/AppHeader'

type FilterTab = 'all' | 'pending' | 'due' | 'settled'
type SortOption = 'name' | 'due' | 'empties'

export function Customers() {
  const { data, loading, error } = useCustomerBalances()
  const { data: productBalances } = useAllCustomerProductBalances()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [showSort, setShowSort] = useState(false)

  // Map customer_id -> total empties outstanding
  const emptiesByCustomer = useMemo(() => {
    const map = new Map<number, number>()
    for (const pb of productBalances) {
      map.set(pb.customer_id, (map.get(pb.customer_id) ?? 0) + pb.empties_outstanding)
    }
    return map
  }, [productBalances])

  // Filter counts
  const counts = useMemo(() => {
    let pending = 0
    let due = 0
    let settled = 0
    for (const c of data) {
      const e = emptiesByCustomer.get(c.id) ?? 0
      if (e > 0) pending++
      if (c.amount_due > 0) due++
      if (c.amount_due <= 0 && e <= 0) settled++
    }
    return { pending, due, settled }
  }, [data, emptiesByCustomer])

  // Filter & Sort
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.filter((c) => {
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q) ||
        (c.address ?? '').toLowerCase().includes(q)

      if (!matchesSearch) return false

      const empties = emptiesByCustomer.get(c.id) ?? 0
      if (tab === 'pending') return empties > 0
      if (tab === 'due') return c.amount_due > 0
      if (tab === 'settled') return c.amount_due <= 0 && empties <= 0

      return true
    })
  }, [data, search, tab, emptiesByCustomer])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'due') return b.amount_due - a.amount_due
      if (sortBy === 'empties') {
        const eA = emptiesByCustomer.get(a.id) ?? 0
        const eB = emptiesByCustomer.get(b.id) ?? 0
        return eB - eA
      }
      return a.name.localeCompare(b.name)
    })
  }, [filtered, sortBy, emptiesByCustomer])

  return (
    <div className="pb-[110px]">
      <AppHeader view="commercial" />

      <div className="p-5 pt-1">
        {/* Header Title & Sleek Add Customer Button */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Customers</h1>
          <Link
            to="/commercial/customers/new"
            className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white shadow-card transition hover:bg-inkSoft active:scale-95"
          >
            <UserPlusIcon size={14} color="#ffffff" strokeWidth={2.5} />
            <span>Add Customer</span>
          </Link>
        </div>

        {/* Search Input & Sort Trigger */}
        <div className="relative mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2">
              <SearchIcon size={18} />
            </span>
            <input
              type="search"
              placeholder="Search name, location or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface pl-11 pr-9 font-semibold text-ink shadow-card"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
              >
                <XIcon size={16} />
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSort(!showSort)}
              className={`flex h-[52px] w-[52px] items-center justify-center rounded-[16px] border-[1.5px] bg-surface shadow-card transition active:scale-95 ${
                sortBy !== 'name' ? 'border-accent text-accent' : 'border-borderMuted text-muted'
              }`}
              title="Sort options"
            >
              <SortIcon size={18} />
            </button>

            {showSort && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowSort(false)} />
                <div className="absolute right-0 top-14 z-30 w-44 rounded-2xl border border-borderMuted bg-surface p-1.5 shadow-float">
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Sort By
                  </p>
                  <button
                    onClick={() => {
                      setSortBy('name')
                      setShowSort(false)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                      sortBy === 'name' ? 'bg-cream text-accent' : 'text-ink hover:bg-cream/60'
                    }`}
                  >
                    <span>Name (A-Z)</span>
                    {sortBy === 'name' && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('due')
                      setShowSort(false)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                      sortBy === 'due' ? 'bg-cream text-accent' : 'text-ink hover:bg-cream/60'
                    }`}
                  >
                    <span>Highest Due</span>
                    {sortBy === 'due' && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('empties')
                      setShowSort(false)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                      sortBy === 'empties' ? 'bg-cream text-accent' : 'text-ink hover:bg-cream/60'
                    }`}
                  >
                    <span>Most Empties</span>
                    {sortBy === 'empties' && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filter Chips */}
        <div className="no-scrollbar mb-4 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setTab('all')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
              tab === 'all'
                ? 'bg-ink text-white shadow-card'
                : 'bg-surface border border-borderMuted text-muted hover:text-ink'
            }`}
          >
            All ({data.length})
          </button>
          <button
            onClick={() => setTab('pending')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
              tab === 'pending'
                ? 'bg-[#C23B22] text-white shadow-card'
                : 'bg-surface border border-borderMuted text-[#C23B22] hover:bg-[#FBE9E4]'
            }`}
          >
            Empties ({counts.pending})
          </button>
          <button
            onClick={() => setTab('due')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
              tab === 'due'
                ? 'bg-accent text-white shadow-card'
                : 'bg-surface border border-borderMuted text-inkSoft hover:bg-cream'
            }`}
          >
            Dues ({counts.due})
          </button>
          <button
            onClick={() => setTab('settled')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
              tab === 'settled'
                ? 'bg-[#2E8B57] text-white shadow-card'
                : 'bg-surface border border-borderMuted text-[#2E8B57] hover:bg-[#EAF4EE]'
            }`}
          >
            Settled ({counts.settled})
          </button>
        </div>

        {loading && <p className="py-6 text-center text-sm font-semibold text-muted">Loading…</p>}
        {error && <p className="py-4 text-center text-sm font-semibold text-red-600">{error}</p>}

        {/* Customer Cards List */}
        {!loading && (
          <ul className="flex flex-col gap-[11px]">
            {sorted.map((c) => {
              const emptiesCount = emptiesByCustomer.get(c.id) ?? 0

              return (
                <li key={c.id}>
                  <Link
                    to={`/commercial/customers/${c.id}`}
                    className="group flex items-center gap-[13px] rounded-[20px] bg-surface p-[15px] shadow-card transition duration-150 hover:shadow-md active:scale-[0.99]"
                  >
                    <Avatar id={c.id} name={c.name} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-bold text-ink group-hover:text-accent transition-colors">
                        {c.name}
                      </p>
                      <p className="mt-[3px] flex items-center gap-[4px] truncate text-[11.5px] font-semibold text-muted">
                        <MapPinIcon size={13} color="#E4571B" />
                        <span className="truncate">
                          {c.address || '—'} · {c.phone || 'No phone'}
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-[6px]">
                      <StatusPill owed={emptiesCount} />
                      <div className="flex items-center gap-1">
                        <p
                          className={`text-xs font-bold ${
                            c.amount_due > 0 ? 'text-[#C23B22]' : 'text-subtle'
                          }`}
                        >
                          {c.amount_due > 0 ? `${formatCurrency(c.amount_due)} due` : 'Settled'}
                        </p>
                        <ChevronRightIcon size={14} color="#A79C8D" />
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
            {sorted.length === 0 && (
              <li className="rounded-[20px] bg-surface px-4 py-10 text-center text-sm font-medium text-subtle shadow-card">
                {search
                  ? 'No customers match your search'
                  : tab !== 'all'
                  ? 'No accounts match the selected filter'
                  : 'No customers yet'}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}


