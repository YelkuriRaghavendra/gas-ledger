import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BillLineProfit } from '../types/db'
import type { BillWithLines } from './useBills'
import type { FeedItem } from './useActivityFeed'
import type { HistoryEntry } from '../utils/statement'
import { buildHistoryGroups, flattenBills } from '../utils/billHistory'

type BillRow = BillWithLines & { bill_lines: (BillWithLines['bill_lines'][number] & { products: { name: string } | null })[] }

/**
 * Loads what the customer page knows about a bill — its lines, the customer's
 * running balance after it, and (for owners) per-line cost and profit — so an
 * activity popup can show exactly the same details.
 *
 * Purchases are not bills and return nothing. The caller shows its basic rows
 * until `entry` arrives.
 */
export function useBillDetail(item: FeedItem | null, isOwner: boolean) {
  const [entry, setEntry] = useState<HistoryEntry | null>(null)
  const [profitLines, setProfitLines] = useState<BillLineProfit[]>([])
  const [profitError, setProfitError] = useState<string | null>(null)

  const id = item && item.type !== 'purchase' ? item.id : null
  const type = item?.type ?? null
  const customerId = item?.customer_id ?? null

  useEffect(() => {
    setEntry(null)
    if (id === null) return
    let cancelled = false

    // A customer's running balance needs all of their bills in order; a
    // counter bill has no customer, so it is just itself.
    const base = supabase.from('bills').select('*, bill_lines(*, products(name))')
    const query = customerId !== null
      ? base.eq('customer_id', customerId).order('created_at', { ascending: false })
      : base.eq('id', id)

    query.then(({ data }) => {
      if (cancelled || !data) return
      const bills = data as BillRow[]
      const names = new Map<number, string>()
      for (const b of bills) for (const l of b.bill_lines) if (l.products?.name) names.set(l.product_id, l.products.name)
      const entries = customerId !== null
        ? buildHistoryGroups(bills, names).flatMap((g) => g.entries)
        : flattenBills(bills, names)
      setEntry(entries.find((e) => e.id === id) ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [id, customerId])

  useEffect(() => {
    setProfitLines([])
    setProfitError(null)
    if (!isOwner || id === null || type !== 'sale') return
    let cancelled = false
    supabase.rpc('commercial_bill_line_profit', { p_bill_id: id }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        // 42501 is the RPC's non-owner refusal; anything else is a real failure.
        if (error.code !== '42501') setProfitError(error.message)
        return
      }
      setProfitLines((data ?? []) as BillLineProfit[])
    })
    return () => {
      cancelled = true
    }
  }, [isOwner, id, type])

  return { entry, profitLines, profitError }
}
