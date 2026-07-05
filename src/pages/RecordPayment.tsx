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

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'
  const segBtn = (active: boolean) =>
    `flex-1 rounded-[12px] py-[11px] text-[13.5px] font-bold transition ${
      active ? 'bg-[#3B6EA5] text-white shadow-[0_10px_22px_-10px_rgba(59,110,165,0.6)]' : 'text-muted'
    }`

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to={customerId ? `/customers/${customerId}` : '/'} className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">{editing ? 'Edit payment' : 'Record payment'}</h1>

      <form onSubmit={handleSubmit}>
        <div className="rounded-[24px] bg-surface p-5 shadow-card">
          <div className="mb-4 flex gap-3">
            <div className="flex-1">
              <p className={fieldLabel}>Customer</p>
              <select
                value={customerId ?? ''}
                onChange={(e) => setCustomerId(Number(e.target.value))}
                disabled={editing}
                className={`${fieldInput} appearance-none disabled:opacity-60`}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <p className={fieldLabel}>Date</p>
              <input
                type="date"
                value={date}
                max={todayInputValue()}
                onChange={(e) => setDate(e.target.value)}
                className={fieldInput}
              />
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-[7px] flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Amount received (₹)</p>
              <button
                type="button"
                onClick={() => setAmount(String(currentlyDue))}
                className="rounded-full bg-[#E8EEF6] px-[10px] py-[3px] text-[11px] font-bold text-[#3B6EA5]"
              >
                Pay full · {formatCurrency(currentlyDue)}
              </button>
            </div>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${fieldInput} text-lg`}
            />
          </div>

          <div className="mb-4">
            <p className={fieldLabel}>Payment method</p>
            <div className="flex gap-2 rounded-[14px] bg-cream p-[5px]">
              <button type="button" onClick={() => setMethod('cash')} className={segBtn(method === 'cash')}>
                Cash
              </button>
              <button type="button" onClick={() => setMethod('upi')} className={segBtn(method === 'upi')}>
                UPI
              </button>
            </div>
          </div>

          <div>
            <p className={fieldLabel}>Note (optional)</p>
            <input
              placeholder="e.g. Paid via GPay"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${fieldInput} font-semibold`}
            />
          </div>
        </div>

        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#E8EEF6] to-[#DCE6F2] p-5">
          <div className="flex items-end justify-between">
            <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#4A6B96]">Balance after payment</span>
            <span className="font-display text-[30px] font-bold leading-none text-[#3B6EA5]">{formatCurrency(balanceAfter)}</span>
          </div>
          <div className="mt-[14px] flex items-center justify-between border-t border-[#CFDBEC] pt-[12px]">
            <span className="text-[13px] font-semibold text-[#4A6B96]">Currently due</span>
            <span className="font-display text-[15px] font-bold text-[#3B6EA5]">{formatCurrency(currentlyDue)}</span>
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-[#3B6EA5] text-[15px] font-bold text-white shadow-[0_12px_26px_-10px_rgba(59,110,165,0.65)] transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save payment'}
        </button>
      </form>
    </div>
  )
}
