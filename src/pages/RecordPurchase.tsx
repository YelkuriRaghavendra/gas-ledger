import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'
import { useGodownStock } from '../hooks/useGodownStock'
import { usePurchases } from '../hooks/usePurchases'
import { Stepper } from '../components/Stepper'
import { combineDateWithNow, dateInputValue, formatCurrency, todayInputValue } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'
import type { PaymentMethod } from '../types/db'

export function RecordPurchase() {
  const { txId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: products } = useProducts()
  const { data: godownStock } = useGodownStock()
  const { data: purchases } = usePurchases()
  const [productId, setProductId] = useState<number | null>(null)
  const [qty, setQty] = useState(1)
  const [emptiesGiven, setEmptiesGiven] = useState(0)
  const [priceEach, setPriceEach] = useState('')
  const [received, setReceived] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadedEdit, setLoadedEdit] = useState(false)
  const [originalEmptiesGiven, setOriginalEmptiesGiven] = useState(0)

  const editing = Boolean(txId)

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
    const purchase = purchases.find((p) => p.id === Number(txId))
    if (!purchase) return
    setProductId(purchase.product_id)
    setQty(purchase.qty)
    setEmptiesGiven(purchase.empties_given)
    setOriginalEmptiesGiven(purchase.empties_given)
    setPriceEach(purchase.qty > 0 ? String(purchase.amount / purchase.qty) : String(purchase.amount))
    setDate(dateInputValue(purchase.created_at))
    setReceived(purchase.paid)
    setMethod(purchase.method ?? 'cash')
    setNote(purchase.note ?? '')
    setLoadedEdit(true)
  }, [editing, loadedEdit, purchases, txId])

  function handleProductChange(newProductId: number) {
    setProductId(newProductId)
    setEmptiesGiven(0)
    const product = products.find((p) => p.id === newProductId)
    setPriceEach(product ? String(product.price || '') : '')
  }

  const product = products.find((p) => p.id === productId)
  const stock = godownStock.find((g) => g.product_id === productId)
  const currentEmptyStock = (stock?.empty_cylinders ?? 0) + originalEmptiesGiven
  const maxEmptiesGivable = Math.max(0, currentEmptyStock)
  const price = Number(priceEach || 0)
  const purchaseTotal = qty * price

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!productId || qty <= 0 || price <= 0) {
      setError('Quantity and price must be greater than zero')
      return
    }
    if (emptiesGiven > maxEmptiesGivable) {
      setError(`Can't give more than ${maxEmptiesGivable} empties (current godown stock).`)
      return
    }
    setSaving(true)
    setError(null)

    const timestamp = combineDateWithNow(date)

    if (editing) {
      const { error } = await supabase
        .from('purchases')
        .update({
          qty,
          empties_given: emptiesGiven,
          amount: purchaseTotal,
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
      navigate('/purchases')
      return
    }

    const { error } = await supabase.from('purchases').insert({
      product_id: productId,
      qty,
      empties_given: emptiesGiven,
      amount: purchaseTotal,
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
    navigate('/purchases')
  }

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'
  const segBtn = (active: boolean) =>
    `flex-1 rounded-[12px] py-[11px] text-[13.5px] font-bold transition ${
      active ? 'bg-gradient-to-br from-accentSoft to-accent text-white shadow-glow' : 'text-muted'
    }`

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to="/purchases" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">
        {editing ? 'Edit purchase' : 'Record a purchase'}
      </h1>

      <form onSubmit={handleSubmit}>
        <div className="rounded-[24px] bg-surface p-5 shadow-card">
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

          <div className="mb-4 flex gap-3">
            <div className="min-w-0 flex-1">
              <p className={fieldLabel}>{product ? `${product.name} received` : 'Received'}</p>
              <Stepper value={qty} onChange={setQty} min={1} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={fieldLabel}>Empties given</p>
              <Stepper value={emptiesGiven} onChange={setEmptiesGiven} min={0} variant="secondary" />
            </div>
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
            <p className={fieldLabel}>Payment</p>
            <div className="flex gap-2 rounded-[14px] bg-cream p-[5px]">
              <button type="button" onClick={() => setReceived(false)} className={segBtn(!received)}>
                On credit
              </button>
              <button type="button" onClick={() => setReceived(true)} className={segBtn(received)}>
                Paid now
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

        <div className="mt-4 flex items-end justify-between rounded-[20px] bg-gradient-to-br from-[#FBEDE4] to-[#F7DFC9] p-5">
          <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#9A6A4A]">Purchase total</span>
          <span className="font-display text-[30px] font-bold leading-none text-ink">{formatCurrency(purchaseTotal)}</span>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save purchase'}
        </button>
      </form>
    </div>
  )
}
