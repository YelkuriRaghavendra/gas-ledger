import { FormEvent, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { Stepper } from '../components/Stepper'
import { formatCurrency } from '../utils/format'

export function NewSale() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const { data: settings } = useAgencySettings()
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [search, setSearch] = useState('')
  const [qty, setQty] = useState(1)
  const [empties, setEmpties] = useState(0)
  const [priceEach, setPriceEach] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const customer = customers.find((c) => c.id === customerId)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.name.toLowerCase().includes(q))
  }, [customers, search])

  if (!customerId) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-xl font-bold text-ink">New Sale</h1>
        <input
          placeholder="Search customer"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-lg border border-ink/20 bg-white px-3 py-2"
        />
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setCustomerId(c.id)}
                className="w-full rounded-xl bg-white p-4 text-left shadow-sm"
              >
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink/60">{c.phone}</p>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <p className="text-ink/60">No customers found.</p>}
        </ul>
      </div>
    )
  }

  const price = Number(priceEach || settings?.price_per_cylinder || 0)
  const saleTotal = qty * price
  const newEmptiesOwed = qty - empties

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (qty <= 0 || price <= 0) {
      setError('Quantity and price must be greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'sale',
      qty,
      empties,
      amount: saleTotal,
      created_by: session?.user.id,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/customers/${customerId}`)
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Record a sale</h1>
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase text-ink/60">Customer</p>
        <div className="rounded-lg border border-ink/20 bg-white px-4 py-3 font-semibold text-ink">
          {customer?.name}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-ink/60">19 kg cylinders sold</p>
          <Stepper value={qty} onChange={setQty} min={1} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase text-ink/60">
            Price each (₹)
            <input
              type="number"
              min="0"
              value={priceEach}
              placeholder={String(settings?.price_per_cylinder ?? 0)}
              onChange={(e) => setPriceEach(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/20 bg-white px-3 py-2"
            />
          </label>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-ink/60">Empties taken</p>
            <Stepper value={empties} onChange={setEmpties} min={0} />
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex justify-between">
            <p className="text-sm text-ink/60">Sale total</p>
            <p className="font-bold text-ink">{formatCurrency(saleTotal)}</p>
          </div>
          <div className="flex justify-between">
            <p className="text-sm text-ink/60">New empties owed</p>
            <p className="font-bold text-accent">+{newEmptiesOwed} cylinders</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save sale'}
        </button>
      </form>
    </div>
  )
}
