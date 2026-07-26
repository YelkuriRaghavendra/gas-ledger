import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { formatDate } from '../../utils/format'
import { ChevronLeftIcon } from '../../components/icons'

interface DeliveryItem {
  id: number
  bill_id: number
  product_id: number
  qty: number
  empties: number
  amount: number
  delivered: boolean
  created_by: string | null
  created_at: string
  bill_note: string | null
}

type Tab = 'pending' | 'delivered'

export function DomesticPendingDeliveries() {
  const { data: products } = useProducts('domestic')
  const productNameById = new Map(products.map((p) => [p.id, p.name]))

  const [tab, setTab] = useState<Tab>('pending')
  const [pending, setPending] = useState<DeliveryItem[]>([])
  const [delivered, setDelivered] = useState<DeliveryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<number | null>(null)
  const [deliverQty, setDeliverQty] = useState<Record<number, number>>({})

  const getDeliverQty = (item: DeliveryItem) => deliverQty[item.id] ?? item.qty

  const load = useCallback(async () => {
    const [{ data: p }, { data: d }] = await Promise.all([
      supabase
        .from('bill_lines')
        .select('id, bill_id, product_id, qty, empties, amount, delivered, created_by, created_at, bills!inner(note, customer_id), products!inner(pending_delivery)')
        .is('bills.customer_id', null)
        .eq('products.pending_delivery', true)
        .eq('delivered', false)
        .order('created_at', { ascending: true }),
      supabase
        .from('bill_lines')
        .select('id, bill_id, product_id, qty, empties, amount, delivered, created_by, created_at, bills!inner(note, customer_id), products!inner(pending_delivery)')
        .is('bills.customer_id', null)
        .eq('products.pending_delivery', true)
        .eq('delivered', true)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    const mapRow = (r: any): DeliveryItem => ({
      id: r.id,
      bill_id: r.bill_id,
      product_id: r.product_id,
      qty: r.qty,
      empties: r.empties,
      amount: r.amount,
      delivered: r.delivered,
      created_by: r.created_by,
      created_at: r.created_at,
      bill_note: r.bills?.note ?? null,
    })
    setPending((p ?? []).map(mapRow))
    setDelivered((d ?? []).map(mapRow))
    setDeliverQty({})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markDelivered(item: DeliveryItem) {
    const dQty = getDeliverQty(item)
    setMarking(item.id)

    if (dQty >= item.qty) {
      await supabase.from('bill_lines').update({ delivered: true }).eq('id', item.id)
      setPending((prev) => prev.filter((i) => i.id !== item.id))
      setDelivered((prev) => [{ ...item, delivered: true }, ...prev])
    } else {
      const pricePerUnit = item.qty > 0 ? item.amount / item.qty : 0
      const deliveredAmount = Math.round(pricePerUnit * dQty)
      const remainingQty = item.qty - dQty
      const remainingAmount = item.amount - deliveredAmount

      await supabase.from('bill_lines').update({
        qty: dQty,
        amount: deliveredAmount,
        delivered: true,
      }).eq('id', item.id)

      const { data: newRow } = await supabase.from('bill_lines').insert({
        bill_id: item.bill_id,
        product_id: item.product_id,
        qty: remainingQty,
        empties: 0,
        amount: remainingAmount,
        delivered: false,
        created_by: item.created_by,
        created_at: item.created_at,
      }).select('id, bill_id, product_id, qty, empties, amount, delivered, created_by, created_at').single()

      setPending((prev) => {
        const without = prev.filter((i) => i.id !== item.id)
        if (newRow) return [...without, { ...newRow, bill_note: item.bill_note } as DeliveryItem]
        return without
      })
      setDelivered((prev) => [{ ...item, qty: dQty, amount: deliveredAmount, delivered: true }, ...prev])
    }

    setDeliverQty((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })
    setMarking(null)
  }

  async function markAllDelivered() {
    if (pending.length === 0) return
    setMarking(-1)
    const ids = pending.map((i) => i.id)
    await supabase.from('bill_lines').update({ delivered: true }).in('id', ids)
    setDelivered((prev) => [...pending.map((i) => ({ ...i, delivered: true })), ...prev])
    setPending([])
    setDeliverQty({})
    setMarking(null)
  }

  const tabBtn = (active: boolean) =>
    `flex-1 rounded-[12px] py-[11px] text-[13.5px] font-bold transition ${
      active
        ? 'bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] text-white shadow-[0_10px_22px_-12px_rgba(46,139,87,0.7)]'
        : 'text-muted'
    }`

  return (
    <div className="p-5 pb-[110px] pt-3">
      <Link
        to="/domestic/stock"
        className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted"
      >
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-4 font-display text-[26px] font-bold tracking-[-0.5px] text-ink">
        Deliveries
      </h1>

      <div className="mb-5 flex gap-2 rounded-[14px] bg-cream p-[5px]">
        <button type="button" onClick={() => setTab('pending')} className={tabBtn(tab === 'pending')}>
          Pending{pending.length > 0 ? ` (${pending.length})` : ''}
        </button>
        <button type="button" onClick={() => setTab('delivered')} className={tabBtn(tab === 'delivered')}>
          Delivered
        </button>
      </div>

      {loading && <p className="text-muted">Loading…</p>}

      {!loading && tab === 'pending' && (
        <>
          {pending.length === 0 && (
            <p className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
              No pending deliveries
            </p>
          )}

          {pending.length > 0 && (
            <>
              <div className="flex flex-col gap-3">
                {pending.map((item) => {
                  const dQty = getDeliverQty(item)
                  const isPartial = dQty < item.qty
                  return (
                    <div
                      key={item.id}
                      className="rounded-[16px] bg-surface px-[14px] py-[13px] shadow-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-bold text-ink">
                            {item.qty} &times; {productNameById.get(item.product_id) ?? 'item'}
                          </p>
                          <p className="mt-[2px] text-[11px] font-semibold text-subtle">
                            Billed {formatDate(item.created_at)}
                          </p>
                          {item.bill_note && (
                            <p className="mt-[2px] text-[10.5px] font-medium text-subtle">{item.bill_note}</p>
                          )}
                        </div>
                      </div>

                      {item.qty > 1 && (
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-[11px] font-bold text-subtle">Deliver</span>
                          <div className="flex items-center gap-[6px] rounded-[10px] bg-cream px-[6px] py-[3px]">
                            <button
                              type="button"
                              onClick={() => setDeliverQty((s) => ({ ...s, [item.id]: Math.max(1, dQty - 1) }))}
                              className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] bg-surface text-[16px] font-bold text-ink shadow-card active:scale-95"
                            >
                              −
                            </button>
                            <span className="min-w-[28px] text-center font-display text-[18px] font-bold text-ink">
                              {dQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => setDeliverQty((s) => ({ ...s, [item.id]: Math.min(item.qty, dQty + 1) }))}
                              className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] bg-[#2E8B57] text-[16px] font-bold text-white active:scale-95"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-[11px] font-semibold text-subtle">of {item.qty}</span>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={marking !== null}
                        onClick={() => markDelivered(item)}
                        className={`mt-3 w-full rounded-[12px] px-[14px] py-[10px] text-[13px] font-bold text-white shadow-[0_8px_18px_-8px_rgba(46,139,87,0.7)] transition active:scale-[0.98] disabled:opacity-50 ${
                          isPartial
                            ? 'bg-gradient-to-br from-[#E6A028] to-[#E67E22]'
                            : 'bg-gradient-to-br from-[#3DA06A] to-[#2E8B57]'
                        }`}
                      >
                        {marking === item.id
                          ? 'Saving…'
                          : isPartial
                            ? `Deliver ${dQty}, keep ${item.qty - dQty} pending`
                            : item.qty > 1
                              ? `Deliver all ${item.qty}`
                              : 'Delivered'}
                      </button>
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                disabled={marking !== null}
                onClick={markAllDelivered}
                className="mt-4 h-[50px] w-full rounded-[14px] border-[1.5px] border-[#2E8B57] bg-[#EAF6EF] text-[14px] font-bold text-[#2E8B57] transition active:scale-[0.99] disabled:opacity-50"
              >
                {marking === -1 ? 'Saving…' : `Mark all delivered (${pending.length})`}
              </button>
            </>
          )}
        </>
      )}

      {!loading && tab === 'delivered' && (
        <>
          {delivered.length === 0 && (
            <p className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
              No recent deliveries
            </p>
          )}

          {delivered.length > 0 && (
            <div className="flex flex-col gap-3">
              {delivered.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-[16px] bg-surface px-[14px] py-[13px] shadow-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-ink">
                      {item.qty} &times; {productNameById.get(item.product_id) ?? 'item'}
                    </p>
                    <p className="mt-[2px] text-[11px] font-semibold text-subtle">
                      Billed {formatDate(item.created_at)}
                    </p>
                    {item.bill_note && (
                      <p className="mt-[2px] text-[10.5px] font-medium text-subtle">{item.bill_note}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-[10px] bg-[#E7F5EC] px-[10px] py-[5px] text-[12px] font-bold text-[#2E8B57]">
                    Done
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
