import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { formatCurrency } from '../utils/format'
import { Avatar } from '../components/Avatar'
import { StatusPill } from '../components/StatusPill'

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
    <div className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Customers</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>
      <p className="mb-4 text-sm text-ink/60">
        {data.length} accounts · {totalEmptiesOut} empties outstanding
      </p>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <input
            required
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-accent py-2 font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save customer'}
          </button>
        </form>
      )}

      <input
        placeholder="Search by name or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-lg border border-ink/20 px-3 py-2"
      />

      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <ul className="space-y-2">
        {filtered.map((c) => (
          <li key={c.id}>
            <Link to={`/customers/${c.id}`} className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
              <Avatar name={c.name} size={40} />
              <div className="flex-1">
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink/60">{c.phone}</p>
              </div>
              <div className="text-right">
                <StatusPill owed={c.empties_outstanding} />
                <p className="mt-1 text-xs text-ink/60">{formatCurrency(c.amount_due)} due</p>
              </div>
            </Link>
          </li>
        ))}
        {!loading && filtered.length === 0 && <p className="text-ink/60">No customers found.</p>}
      </ul>
    </div>
  )
}
