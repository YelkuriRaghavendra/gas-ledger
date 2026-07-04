import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { Stepper } from '../components/Stepper'
import { formatCurrency } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'

export function NewSale() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const { data: settings } = useAgencySettings()
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [qty, setQty] = useState(1)
  const [empties, setEmpties] = useState(0)
  const [priceEach, setPriceEach] = useState('')
  const [received, setReceived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customerId === null && customers.length > 0) setCustomerId(customers[0].id)
  }, [customers, customerId])

  useEffect(() => {
    if (settings && !priceEach) setPriceEach(String(settings.price_per_cylinder || ''))
  }, [settings, priceEach])

  const price = Number(priceEach || 0)
  const saleTotal = qty * price
  const newEmptiesOwed = qty - empties

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId || qty <= 0 || price <= 0) {
      setError('Quantity and price must be greater than zero')
      return
    }
    if (empties > qty) {
      setError("Empties taken can't exceed cylinders sold.")
      return
    }
    setSaving(true)
    setError(null)
    const saleRow = {
      customer_id: customerId,
      type: 'sale' as const,
      qty,
      empties,
      amount: saleTotal,
      created_by: session?.user.id,
    }
    const rows = received
      ? [
          saleRow,
          {
            customer_id: customerId,
            type: 'payment' as const,
            qty: 0,
            empties: 0,
            amount: saleTotal,
            created_by: session?.user.id,
          },
        ]
      : [saleRow]
    const { error } = await supabase.from('transactions').insert(rows)
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
      <h1 className="mb-[22px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">Record a sale</h1>

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

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">19 kg cylinders sold</p>
        <div className="mb-5">
          <Stepper value={qty} onChange={setQty} min={1} />
        </div>

        <div className="mb-5 flex gap-3">
          <div className="flex-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Price each (₹)</p>
            <input
              type="number"
              min="0"
              value={priceEach}
              onChange={(e) => setPriceEach(e.target.value)}
              className="h-[52px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-bold text-ink"
            />
          </div>
          <div className="flex-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Empties taken</p>
            <Stepper value={empties} onChange={setEmpties} min={0} variant="secondary" />
          </div>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Payment</p>
        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => setReceived(false)}
            className={`flex-1 rounded-[14px] border-[1.5px] py-3 text-sm font-bold ${
              !received ? 'border-accent bg-accent text-white' : 'border-borderMuted bg-white text-ink'
            }`}
          >
            On credit
          </button>
          <button
            type="button"
            onClick={() => setReceived(true)}
            className={`flex-1 rounded-[14px] border-[1.5px] py-3 text-sm font-bold ${
              received ? 'border-accent bg-accent text-white' : 'border-borderMuted bg-white text-ink'
            }`}
          >
            Received now
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-[#F3D9C6] bg-[#FBEDE4] p-4">
          <div className="mb-2 flex justify-between">
            <span className="text-[13px] font-semibold text-[#9A6A4A]">Sale total</span>
            <span className="font-display text-lg font-bold text-ink">{formatCurrency(saleTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[13px] font-semibold text-[#9A6A4A]">New empties owed</span>
            <span className="font-display text-[15px] font-bold text-[#C23B22]">
              {newEmptiesOwed >= 0 ? `+${newEmptiesOwed}` : newEmptiesOwed} cylinders
            </span>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="h-[54px] w-full rounded-[14px] bg-accent font-bold text-white shadow-[0_12px_26px_-10px_rgba(228,87,27,0.7)] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save sale'}
        </button>
      </form>
    </div>
  )
}
