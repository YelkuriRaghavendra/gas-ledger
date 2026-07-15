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
  const { data: productBalances } = useCustomerProductBalances(customerId ?? 0)

  // A return can cover any number of sizes at once: qty of empties returned per product.
  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({})
  const [outrightByProduct, setOutrightByProduct] = useState<Record<number, boolean>>({})
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editProductId, setEditProductId] = useState<number | null>(null)
  const [originalQty, setOriginalQty] = useState(0)
  const [loadedEdit, setLoadedEdit] = useState(false)
  const editing = Boolean(txId)

  useEffect(() => {
    if (customerId === null && customers.length > 0) setCustomerId(customers[0].id)
  }, [customers, customerId])

  useEffect(() => {
    if (!editing || loadedEdit) return
    const tx = transactions.find((t) => t.id === Number(txId))
    if (!tx || tx.product_id === null) return
    setEditProductId(tx.product_id)
    setQtyByProduct({ [tx.product_id]: tx.qty })
    setOutrightByProduct({ [tx.product_id]: tx.outright })
    setOriginalQty(tx.qty)
    setDate(dateInputValue(tx.created_at))
    setLoadedEdit(true)
  }, [editing, loadedEdit, transactions, txId])

  const shownProducts = editing ? products.filter((p) => p.id === editProductId) : products

  const setQty = (pid: number, v: number) => setQtyByProduct((s) => ({ ...s, [pid]: v }))
  const setOutright = (pid: number, v: boolean) => setOutrightByProduct((s) => ({ ...s, [pid]: v }))

  function ownedFor(pid: number) {
    const bal = productBalances.find((b) => b.product_id === pid)?.empties_outstanding ?? 0
    return editing && pid === editProductId ? bal + originalQty : bal
  }

  const totalOwed = shownProducts.reduce((sum, p) => sum + ownedFor(p.id), 0)
  const totalReturning = shownProducts.reduce((sum, p) => sum + (qtyByProduct[p.id] ?? 0), 0)
  const remaining = Math.max(0, totalOwed - totalReturning)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId) {
      setError('Select a customer')
      return
    }
    const lines = shownProducts
      .map((p) => ({
        productId: p.id,
        name: p.name,
        qty: qtyByProduct[p.id] ?? 0,
        outright: outrightByProduct[p.id] ?? false,
      }))
      .filter((l) => l.qty > 0)

    if (lines.length === 0) {
      setError('Enter a quantity for at least one size')
      return
    }
    for (const l of lines) {
      if (l.outright) continue
      if (l.qty > ownedFor(l.productId)) {
        setError(`Can't return more than the ${ownedFor(l.productId)} ${l.name} empties outstanding.`)
        return
      }
    }

    setSaving(true)
    setError(null)
    const timestamp = combineDateWithNow(date)

    if (editing && editProductId !== null) {
      const { error } = await supabase
        .from('transactions')
        .update({
          qty: lines[0].qty,
          created_at: timestamp,
          updated_by: session?.user.id,
          outright: lines[0].outright,
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

    const rows = lines.map((l) => ({
      customer_id: customerId,
      type: 'return' as const,
      product_id: l.productId,
      qty: l.qty,
      empties: 0,
      amount: 0,
      created_by: session?.user.id,
      created_at: timestamp,
      outright: l.outright,
    }))
    const { error } = await supabase.from('transactions').insert(rows)
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

          <div className="mb-4">
            <p className={fieldLabel}>Date</p>
            <input
              type="date"
              value={date}
              max={todayInputValue()}
              onChange={(e) => setDate(e.target.value)}
              className={fieldInput}
            />
          </div>

          {!editing && (
            <p className="mb-3 text-[12px] font-semibold text-subtle">Enter empties returned for each size.</p>
          )}

          <div className="flex gap-3">
            {shownProducts.map((p) => {
              const outright = outrightByProduct[p.id] ?? false
              return (
                <div key={p.id} className="min-w-0 flex-1">
                  <p className={fieldLabel}>{p.name}</p>
                  <Stepper
                    value={qtyByProduct[p.id] ?? 0}
                    onChange={(v) => setQty(p.id, v)}
                    min={editing ? 1 : 0}
                    variant="secondary"
                    size="sm"
                  />
                  {p.kind === 'cylinder' && (
                    <label className="mt-2 flex cursor-pointer items-center gap-[6px] text-[11px] font-semibold text-muted">
                      <input
                        type="checkbox"
                        checked={outright}
                        onChange={(e) => setOutright(p.id, e.target.checked)}
                        className="h-[14px] w-[14px] accent-[#E4571B]"
                      />
                      Owned cylinder (bought outright)
                    </label>
                  )}
                  {outright ? (
                    <p className="mt-2 text-[11px] font-semibold text-muted">Not counted against empties owed.</p>
                  ) : (
                    <p className="mt-2 text-[11px] font-semibold text-muted">
                      Owes <span className="font-bold text-[#C23B22]">{ownedFor(p.id)}</span>
                    </p>
                  )}
                </div>
              )
            })}
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
