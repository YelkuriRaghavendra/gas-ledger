import { FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { formatCurrency } from '../utils/format'

export function Customers() {
  const { data, loading, error, refresh } = useCustomerBalances()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
  }, [data, search])

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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Customers</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

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
            <Link
              to={`/customers/${c.id}`}
              className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink/60">{c.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-accent">{formatCurrency(c.amount_due)}</p>
                <p className="text-xs text-ink/60">{c.empties_outstanding} empties out</p>
              </div>
            </Link>
          </li>
        ))}
        {!loading && filtered.length === 0 && <p className="text-ink/60">No customers found.</p>}
      </ul>
    </div>
  )
}
