import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useProducts } from '../hooks/useProducts'
import { useCustomerProductBalances } from '../hooks/useCustomerProductBalances'
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
  const { data: products } = useProducts()
  const { data: transactions } = useTransactions(id ? Number(id) : 0)
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [productId, setProductId] = useState<number | null>(null)
  const { data: productBalances } = useCustomerProductBalances(customerId ?? 0)
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
    if (productId === null && products.length > 0 && !editing) setProductId(products[0].id)
  }, [products, productId, editing])

  useEffect(() => {
    if (!editing) {
      const product = products.find((p) => p.id === productId)
      if (product && !priceEach) setPriceEach(String(product.price || ''))
    }
  }, [products, productId, priceEach, editing])

  useEffect(() => {
    if (!editing || loadedEdit) return
    const tx = transactions.find((t) => t.id === Number(txId))
    if (!tx) return
    setProductId(tx.product_id)
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

  function handleProductChange(newProductId: number) {
    setProductId(newProductId)
    setEmpties(0)
    const product = products.find((p) => p.id === newProductId)
    setPriceEach(product ? String(product.price || '') : '')
  }

  const product = products.find((p) => p.id === productId)
  const productBalance = productBalances.find((b) => b.product_id === productId)
  const currentlyOwed = (productBalance?.empties_outstanding ?? 0) + originalEmpties
  const maxEmptiesTakeable = currentlyOwed + qty
  const price = Number(priceEach || 0)
  const saleTotal = qty * price
  const newEmptiesOwed = qty - empties

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId || !productId || qty <= 0 || price <= 0) {
      setError('Quantity and price must be greater than zero')
      return
    }
    if (empties > maxEmptiesTakeable) {
      setError(`Can't collect more than ${maxEmptiesTakeable} empties (${currentlyOwed} outstanding + ${qty} from this sale).`)
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
      product_id: productId,
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

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput =
    'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'
  const segBtn = (active: boolean) =>
    `flex-1 rounded-[12px] py-[11px] text-[13.5px] font-bold transition ${
      active ? 'bg-gradient-to-br from-accentSoft to-accent text-white shadow-glow' : 'bg-cream text-muted'
    }`

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to={customerId ? `/customers/${customerId}` : '/'} className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">{editing ? 'Edit sale' : 'Record a sale'}</h1>

      <form onSubmit={handleSubmit}>
        <div className="rounded-[24px] bg-surface p-5 shadow-card">
          <div className="mb-4">
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

          <div className="mb-4 flex gap-3">
            <div className="flex-1">
              <p className={fieldLabel}>Product</p>
              <div className="flex gap-1 rounded-[14px] bg-cream p-[5px]">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={editing}
                    onClick={() => handleProductChange(p.id)}
                    className={`flex-1 rounded-[11px] py-[11px] font-display text-[13px] font-bold transition disabled:opacity-60 ${
                      productId === p.id ? 'bg-gradient-to-br from-accentSoft to-accent text-white shadow-glow' : 'text-muted'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
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
            <p className={fieldLabel}>{product ? `${product.name} sold` : 'Cylinders sold'}</p>
            <Stepper value={qty} onChange={setQty} min={1} />
          </div>

          <div className="mb-4">
            <p className={fieldLabel}>Price each (₹)</p>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceEach}
              onChange={(e) => setPriceEach(e.target.value)}
              className={fieldInput}
            />
          </div>

          <div>
            <p className={fieldLabel}>Empties taken</p>
            <Stepper value={empties} onChange={setEmpties} min={0} variant="secondary" />
            <p className="mt-2 text-[12px] font-semibold text-muted">
              Customer owes <span className="font-bold text-[#C23B22]">{currentlyOwed}</span> empties
            </p>
          </div>

          <div className="mt-4">
            <p className={fieldLabel}>Payment</p>
            <div className="flex gap-2 rounded-[14px] bg-cream p-[5px]">
              <button type="button" onClick={() => setReceived(false)} className={segBtn(!received)}>
                On credit
              </button>
              <button type="button" onClick={() => setReceived(true)} className={segBtn(received)}>
                Received now
              </button>
            </div>
          </div>

          {received && (
            <>
              <div className="mt-4">
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
              <div className="mt-4">
                <p className={fieldLabel}>Note (optional)</p>
                <input
                  placeholder="e.g. Paid via GPay"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={`${fieldInput} font-semibold`}
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#FBEDE4] to-[#F7DFC9] p-5">
          <div className="flex items-end justify-between">
            <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#9A6A4A]">Sale total</span>
            <span className="font-display text-[30px] font-bold leading-none text-ink">{formatCurrency(saleTotal)}</span>
          </div>
          <div className="mt-[14px] flex items-center justify-between border-t border-[#F0D6C2] pt-[12px]">
            <span className="text-[13px] font-semibold text-[#9A6A4A]">New empties owed</span>
            <span className="font-display text-[16px] font-bold text-[#C23B22]">
              {newEmptiesOwed >= 0 ? `+${newEmptiesOwed}` : newEmptiesOwed} cylinders
            </span>
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save sale'}
        </button>
      </form>
    </div>
  )
}
