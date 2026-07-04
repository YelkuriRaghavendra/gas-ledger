import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { useTransactions } from '../hooks/useTransactions'
import { Stepper } from '../components/Stepper'
import { combineDateWithNow, dateInputValue, formatCurrency, todayInputValue } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'
import type { PaymentMethod } from '../types/db'

export function NewSale() {
  const { id, txId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const { data: settings } = useAgencySettings()
  const { data: transactions } = useTransactions(id ? Number(id) : 0)
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [qty, setQty] = useState(1)
  const [empties, setEmpties] = useState(0)
  const [priceEach, setPriceEach] = useState('')
  const [received, setReceived] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadedEdit, setLoadedEdit] = useState(false)
  const [originalEmpties, setOriginalEmpties] = useState(0)

  const editing = Boolean(txId)

  useEffect(() => {
    if (customerId === null && customers.length > 0) setCustomerId(customers[0].id)
  }, [customers, customerId])

  useEffect(() => {
    if (settings && !priceEach && !editing) setPriceEach(String(settings.price_per_cylinder || ''))
  }, [settings, priceEach, editing])

  useEffect(() => {
    if (!editing || loadedEdit) return
    const tx = transactions.find((t) => t.id === Number(txId))
    if (!tx) return
    setQty(tx.qty)
    setEmpties(tx.empties)
    setOriginalEmpties(tx.empties)
    setPriceEach(tx.qty > 0 ? String(tx.amount / tx.qty) : String(tx.amount))
    setDate(dateInputValue(tx.created_at))
    setReceived(tx.paid)
    setMethod(tx.method ?? 'cash')
    setNote(tx.note ?? '')
    setLoadedEdit(true)
  }, [editing, loadedEdit, transactions, txId])

  const customer = customers.find((c) => c.id === customerId)
  const currentlyOwed = (customer?.empties_outstanding ?? 0) + originalEmpties
  const price = Number(priceEach || 0)
  const saleTotal = qty * price
  const newEmptiesOwed = qty - empties

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId || qty <= 0 || price <= 0) {
      setError('Quantity and price must be greater than zero')
      return
    }
    if (empties > currentlyOwed) {
      setError(`Can't collect more than the ${currentlyOwed} empties outstanding.`)
      return
    }
    setSaving(true)
    setError(null)

    const timestamp = combineDateWithNow(date)

    if (editing) {
      const { error } = await supabase
        .from('transactions')
        .update({
          qty,
          empties,
          amount: saleTotal,
          paid: received,
          method: received ? method : null,
          note: note.trim() || null,
          created_at: timestamp,
        })
        .eq('id', Number(txId))
      setSaving(false)
      if (error) {
        setError(error.message)
        return
      }
      navigate(`/customers/${customerId}`)
      return
    }

    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'sale',
      qty,
      empties,
      amount: saleTotal,
      paid: received,
      method: received ? method : null,
      note: note.trim() || null,
      created_by: session?.user.id,
      created_at: timestamp,
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
      <h1 className="mb-[22px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">{editing ? 'Edit sale' : 'Record a sale'}</h1>

      <form onSubmit={handleSubmit}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Customer</p>
        <select
          value={customerId ?? ''}
          onChange={(e) => setCustomerId(Number(e.target.value))}
          disabled={editing}
          className="mb-5 h-[52px] w-full appearance-none rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-bold text-ink disabled:opacity-60"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Date</p>
        <input
          type="date"
          value={date}
          max={todayInputValue()}
          onChange={(e) => setDate(e.target.value)}
          className="mb-5 h-[52px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-bold text-ink"
        />

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">19 kg cylinders sold</p>
        <div className="mb-5">
          <Stepper value={qty} onChange={setQty} min={1} />
        </div>

        <div className="mb-5 flex items-center justify-between rounded-2xl bg-ink px-4 py-[14px] text-white">
          <span className="text-[13px] font-semibold text-mutedOnDark">Currently owed by customer</span>
          <span className="font-display font-bold text-accent">{currentlyOwed} empties</span>
        </div>

        <div className="mb-5 flex gap-3">
          <div className="flex-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Price each (₹)</p>
            <input
              type="number"
              min="0"
              step="0.01"
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

        {received && (
          <>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Payment method</p>
            <div className="mb-5 flex gap-2">
              <button
                type="button"
                onClick={() => setMethod('cash')}
                className={`flex-1 rounded-[14px] border-[1.5px] py-3 text-sm font-bold ${
                  method === 'cash' ? 'border-accent bg-accent text-white' : 'border-borderMuted bg-white text-ink'
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setMethod('upi')}
                className={`flex-1 rounded-[14px] border-[1.5px] py-3 text-sm font-bold ${
                  method === 'upi' ? 'border-accent bg-accent text-white' : 'border-borderMuted bg-white text-ink'
                }`}
              >
                UPI
              </button>
            </div>

            <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Note (optional)</p>
            <input
              placeholder="e.g. Paid via GPay"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mb-5 h-[52px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-semibold text-ink"
            />
          </>
        )}

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
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save sale'}
        </button>
      </form>
    </div>
  )
}
