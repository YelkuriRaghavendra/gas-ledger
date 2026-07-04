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

  return (
    <div className="p-5 pb-10 pt-2">
      <Link to={customerId ? `/customers/${customerId}` : '/'} className="mb-[10px] inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[22px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">{editing ? 'Edit return' : 'Log empty return'}</h1>

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

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Product</p>
        <select
          value={productId ?? ''}
          onChange={(e) => handleProductChange(Number(e.target.value))}
          disabled={editing}
          className="mb-5 h-[52px] w-full appearance-none rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-bold text-ink disabled:opacity-60"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="mb-5 flex items-center justify-between rounded-2xl bg-ink px-4 py-[14px] text-white">
          <span className="text-[13px] font-semibold text-mutedOnDark">Currently owed by customer</span>
          <span className="font-display font-bold text-accent">{currentlyOwed} empties</span>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Date</p>
        <input
          type="date"
          value={date}
          max={todayInputValue()}
          onChange={(e) => setDate(e.target.value)}
          className="mb-5 h-[52px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-bold text-ink"
        />

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">
          {product ? `Empty ${product.name} cylinders returned` : 'Empty cylinders returned'}
        </p>
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
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save return'}
        </button>
      </form>
    </div>
  )
}
