import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { formatCurrency } from '../utils/format'
import { Avatar } from '../components/Avatar'
import { StatusPill } from '../components/StatusPill'
import { SearchIcon } from '../components/icons'

export function Customers() {
  const { data, loading, error, refresh } = useCustomerBalances()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if ((location.state as { openAdd?: boolean } | null)?.openAdd) {
      setShowAdd(true)
    }
  }, [location.state])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
  }, [data, search])

  const totalEmptiesOut = data.reduce((sum, c) => sum + c.empties_outstanding, 0)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const { error } = await supabase.from('customers').insert({ name, phone, address })
    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setName('')
    setPhone('')
    setAddress('')
    setShowAdd(false)
    refresh()
  }

  return (
    <div className="p-5 pb-[110px] pt-2">
      <h1 className="mb-1 font-display text-2xl font-bold tracking-[-0.4px] text-ink">Customers</h1>
      <p className="mb-4 text-[13px] font-semibold text-muted">
        {data.length} accounts · {totalEmptiesOut} empties outstanding
      </p>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 space-y-3 rounded-2xl border border-[#EFE7D8] bg-white p-4">
          <input
            required
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
          />
          <input
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
          />
          <input
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-[14px] bg-accent py-2 font-bold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save customer'}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="flex-1 rounded-[14px] border-[1.5px] border-borderMuted py-2 font-bold text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="relative mb-[18px]">
        <span className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2">
          <SearchIcon size={18} />
        </span>
        <input
          placeholder="Search name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-[50px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-white pl-11 pr-4 font-semibold text-ink"
        />
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <ul className="flex flex-col gap-[11px]">
        {filtered.map((c) => (
          <li key={c.id}>
            <Link
              to={`/customers/${c.id}`}
              className="flex items-center gap-[13px] rounded-[18px] border border-[#EFE7D8] bg-white p-[14px]"
            >
              <Avatar id={c.id} name={c.name} size={46} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">{c.name}</p>
                <p className="mt-[2px] text-[12.5px] font-semibold text-[#9A8F80]">{c.phone}</p>
              </div>
              <div className="shrink-0 text-right">
                <StatusPill owed={c.empties_outstanding} />
                <p className="mt-[5px] text-xs font-semibold text-[#B3A796]">{formatCurrency(c.amount_due)} due</p>
              </div>
            </Link>
          </li>
        ))}
        {!loading && filtered.length === 0 && <p className="text-muted">No customers found.</p>}
      </ul>
    </div>
  )
}
