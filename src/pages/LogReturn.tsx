import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { Stepper } from '../components/Stepper'
import { ChevronLeftIcon } from '../components/icons'

export function LogReturn() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [qty, setQty] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customerId === null && customers.length > 0) setCustomerId(customers[0].id)
  }, [customers, customerId])

  const customer = customers.find((c) => c.id === customerId)
  const currentlyOwed = customer?.empties_outstanding ?? 0
  const remaining = Math.max(0, currentlyOwed - qty)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId || qty <= 0) {
      setError('Quantity must be greater than zero')
      return
    }
    if (qty > currentlyOwed) {
      setError(`Can't return more than the ${currentlyOwed} empties outstanding.`)
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
    <div className="p-5 pb-10 pt-2">
      <Link to={customerId ? `/customers/${customerId}` : '/'} className="mb-[10px] inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[22px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">Log empty return</h1>

      <form onSubmit={handleSubmit}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Customer</p>
        <select
          value={customerId ?? ''}
          onChange={(e) => setCustomerId(Number(e.target.value))}
          className="mb-5 h-[52px] w-full appearance-none rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-bold text-ink"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="mb-5 flex items-center justify-between rounded-2xl bg-ink px-4 py-[14px] text-white">
          <span className="text-[13px] font-semibold text-mutedOnDark">Currently owed by customer</span>
          <span className="font-display font-bold text-accent">{currentlyOwed} empties</span>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Empty cylinders returned</p>
        <div className="mb-5">
          <Stepper value={qty} onChange={setQty} min={1} />
        </div>

        <div className="mb-6 flex justify-between rounded-2xl bg-green-50 p-4">
          <p className="text-green-800">Remaining after return</p>
          <p className="font-display font-bold text-green-800">{remaining} empties</p>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="h-[54px] w-full rounded-[14px] bg-green-600 font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save return'}
        </button>
      </form>
    </div>
  )
}
