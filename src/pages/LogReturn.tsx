import { FormEvent, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { Stepper } from '../components/Stepper'

export function LogReturn() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [search, setSearch] = useState('')
  const [qty, setQty] = useState(1)
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
        <h1 className="mb-4 text-xl font-bold text-ink">Log Return</h1>
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

  const currentlyOwed = customer?.empties_outstanding ?? 0
  const remaining = Math.max(0, currentlyOwed - qty)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (qty <= 0) {
      setError('Quantity must be greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'return',
      qty,
      empties: 0,
      amount: 0,
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
      <h1 className="mb-4 text-xl font-bold text-ink">Log empty return</h1>
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase text-ink/60">Customer</p>
        <div className="rounded-lg border border-ink/20 bg-white px-4 py-3 font-semibold text-ink">
          {customer?.name}
        </div>
      </div>
      <div className="mb-4 flex justify-between rounded-xl bg-ink p-4 text-white">
        <p>Currently owed by customer</p>
        <p className="font-display font-bold text-accent">{currentlyOwed} empties</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-ink/60">Empty cylinders returned</p>
          <Stepper value={qty} onChange={setQty} min={1} />
        </div>
        <div className="rounded-xl bg-green-50 p-4">
          <div className="flex justify-between">
            <p className="text-green-800">Remaining after return</p>
            <p className="font-display font-bold text-green-800">{remaining} empties</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save return'}
        </button>
      </form>
    </div>
  )
}
