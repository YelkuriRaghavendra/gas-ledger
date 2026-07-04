import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useTransactions } from '../hooks/useTransactions'
import { combineDateWithNow, dateInputValue, formatCurrency, todayInputValue } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'
import type { PaymentMethod } from '../types/db'

export function RecordPayment() {
  const { id, txId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const { data: transactions } = useTransactions(id ? Number(id) : 0)
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayInputValue())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadedEdit, setLoadedEdit] = useState(false)
  const [originalAmount, setOriginalAmount] = useState(0)

  const editing = Boolean(txId)

  useEffect(() => {
    if (customerId === null && customers.length > 0) setCustomerId(customers[0].id)
  }, [customers, customerId])

  useEffect(() => {
    if (!editing || loadedEdit) return
    const tx = transactions.find((t) => t.id === Number(txId))
    if (!tx) return
    setAmount(String(tx.amount))
    setOriginalAmount(tx.amount)
    setDate(dateInputValue(tx.created_at))
    setMethod(tx.method ?? 'cash')
    setNote(tx.note ?? '')
    setLoadedEdit(true)
  }, [editing, loadedEdit, transactions, txId])

  const customer = customers.find((c) => c.id === customerId)
  const currentlyDue = (customer?.amount_due ?? 0) + originalAmount
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

    const timestamp = combineDateWithNow(date)

    if (editing) {
      const { error } = await supabase
        .from('transactions')
        .update({ amount: amountNum, created_at: timestamp, method, note: note.trim() || null })
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
      type: 'payment',
      qty: 0,
      empties: 0,
      amount: amountNum,
      created_by: session?.user.id,
      created_at: timestamp,
      method,
      note: note.trim() || null,
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
      <h1 className="mb-[22px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">{editing ? 'Edit payment' : 'Record payment'}</h1>

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

        <div className="mb-5 flex items-center justify-between rounded-2xl bg-ink px-4 py-[14px] text-white">
          <span className="text-[13px] font-semibold text-mutedOnDark">Currently due</span>
          <span className="font-display font-bold text-accent">{formatCurrency(currentlyDue)}</span>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Date</p>
        <input
          type="date"
          value={date}
          max={todayInputValue()}
          onChange={(e) => setDate(e.target.value)}
          className="mb-5 h-[52px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-bold text-ink"
        />

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

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Payment method</p>
        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => setMethod('cash')}
            className={`flex-1 rounded-[14px] border-[1.5px] py-3 text-sm font-bold ${
              method === 'cash' ? 'border-blue-600 bg-blue-600 text-white' : 'border-borderMuted bg-white text-ink'
            }`}
          >
            Cash
          </button>
          <button
            type="button"
            onClick={() => setMethod('upi')}
            className={`flex-1 rounded-[14px] border-[1.5px] py-3 text-sm font-bold ${
              method === 'upi' ? 'border-blue-600 bg-blue-600 text-white' : 'border-borderMuted bg-white text-ink'
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
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save payment'}
        </button>
      </form>
    </div>
  )
}
