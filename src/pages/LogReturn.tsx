import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useProducts } from '../hooks/useProducts'
import { useCustomerProductBalances } from '../hooks/useCustomerProductBalances'
import { useTransactions } from '../hooks/useTransactions'
import { Stepper } from '../components/Stepper'
import { ChevronLeftIcon } from '../components/icons'
import { combineDateWithNow, dateInputValue, todayInputValue } from '../utils/format'

export function LogReturn() {
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
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadedEdit, setLoadedEdit] = useState(false)
  const [originalQty, setOriginalQty] = useState(0)

  const editing = Boolean(txId)

  useEffect(() => {
    if (customerId === null && customers.length > 0) setCustomerId(customers[0].id)
  }, [customers, customerId])

  useEffect(() => {
    if (productId === null && products.length > 0 && !editing) setProductId(products[0].id)
  }, [products, productId, editing])

  useEffect(() => {
    if (!editing || loadedEdit) return
    const tx = transactions.find((t) => t.id === Number(txId))
    if (!tx) return
    setProductId(tx.product_id)
    setQty(tx.qty)
    setOriginalQty(tx.qty)
    setDate(dateInputValue(tx.created_at))
    setLoadedEdit(true)
  }, [editing, loadedEdit, transactions, txId])

  function handleProductChange(newProductId: number) {
    setProductId(newProductId)
    setQty(1)
  }

  const product = products.find((p) => p.id === productId)
  const productBalance = productBalances.find((b) => b.product_id === productId)
  const currentlyOwed = (productBalance?.empties_outstanding ?? 0) + originalQty
  const remaining = Math.max(0, currentlyOwed - qty)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId || !productId || qty <= 0) {
      setError('Quantity must be greater than zero')
      return
    }
    if (qty > currentlyOwed) {
      setError(`Can't return more than the ${currentlyOwed} empties outstanding.`)
      return
    }
    setSaving(true)
    setError(null)

    const timestamp = combineDateWithNow(date)

    if (editing) {
      const { error } = await supabase.from('transactions').update({ qty, created_at: timestamp }).eq('id', Number(txId))
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
      type: 'return',
      product_id: productId,
      qty,
      empties: 0,
      amount: 0,
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
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to={customerId ? `/customers/${customerId}` : '/'} className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">{editing ? 'Edit return' : 'Log empty return'}</h1>

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
                      productId === p.id ? 'bg-[#2E8B57] text-white shadow-[0_10px_22px_-10px_rgba(46,139,87,0.6)]' : 'text-muted'
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

          <div>
            <p className={fieldLabel}>{product ? `Empty ${product.name} returned` : 'Empty cylinders returned'}</p>
            <Stepper value={qty} onChange={setQty} min={1} variant="secondary" />
            <p className="mt-2 text-[12px] font-semibold text-muted">
              Customer owes <span className="font-bold text-[#C23B22]">{currentlyOwed}</span> empties
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between rounded-[20px] bg-gradient-to-br from-[#EAF4EE] to-[#D9EDE1] p-5">
          <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#3E7A57]">Remaining after return</span>
          <span className="font-display text-[30px] font-bold leading-none text-[#2E8B57]">{remaining}</span>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-[#2E8B57] text-[15px] font-bold text-white shadow-[0_12px_26px_-10px_rgba(46,139,87,0.65)] transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save return'}
        </button>
      </form>
    </div>
  )
}
