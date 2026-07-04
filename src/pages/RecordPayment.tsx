import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { formatCurrency } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'

export function RecordPayment() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customerId === null && customers.length > 0) setCustomerId(customers[0].id)
  }, [customers, customerId])

  const customer = customers.find((c) => c.id === customerId)
  const currentlyDue = customer?.amount_due ?? 0
  const amountNum = Number(amount || 0)
  const balanceAfter = Math.max(0, currentlyDue - amountNum)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId || amountNum <= 0) {
      setError('Amount must be greater than zero')
      return
    }
    if (amountNum > currentlyDue) {
      setError(`Amount can't exceed the ${formatCurrency(currentlyDue)} currently due.`)
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'payment',
      qty: 0,
      empties: 0,
      amount: amountNum,
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
      <h1 className="mb-[22px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">Record payment</h1>

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
          <span className="text-[13px] font-semibold text-mutedOnDark">Currently due</span>
          <span className="font-display font-bold text-accent">{formatCurrency(currentlyDue)}</span>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.5px] text-muted">Amount received (₹)</p>
          <button
            type="button"
            onClick={() => setAmount(String(currentlyDue))}
            className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700"
          >
            Pay full
          </button>
        </div>
        <input
          type="number"
          min="0.01"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-5 h-[52px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] text-lg font-bold text-ink"
        />

        <div className="mb-6 flex justify-between rounded-2xl bg-blue-50 p-4">
          <p className="text-blue-800">Balance after payment</p>
          <p className="font-display font-bold text-blue-800">{formatCurrency(balanceAfter)}</p>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="h-[54px] w-full rounded-[14px] bg-blue-600 font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save payment'}
        </button>
      </form>
    </div>
  )
}
