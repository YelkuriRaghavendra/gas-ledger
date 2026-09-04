import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DailyMoneySummary, DailyProductSummary, Segment } from '../types/db'

// The month the business is currently in, by IST rather than the device clock —
// the summary views bucket their `day` column in Asia/Kolkata.
export function currentMonthInIST() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const [year, month] = today.split('-').map(Number)
  return { year, month }
}

// Half-open [start, end) bounds on the views' `day` column.
function monthBounds(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return { start: `${year}-${pad(month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` }
}

// Totals for one month, built from the same daily views the today card uses.
// `year` and `month` (1-12) are passed as primitives so the refresh callback
// keeps a stable identity across renders.
export function useMonthSummary(segment: Segment, year: number, month: number) {
  // Quantity sold this month per product id — callers render it in their own
  // product order rather than whatever order the view returns.
  const [soldByProduct, setSoldByProduct] = useState<Map<number, number>>(new Map())
  const [collected, setCollected] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { start, end } = monthBounds(year, month)

    const [productsRes, moneyRes] = await Promise.all([
      supabase
        .from('daily_product_summary')
        .select('*')
        .eq('segment', segment)
        .gte('day', start)
        .lt('day', end),
      supabase.from('daily_money_summary').select('*').gte('day', start).lt('day', end),
    ])

    if (productsRes.error || moneyRes.error) {
      setError(productsRes.error?.message ?? moneyRes.error?.message ?? null)
      setLoading(false)
      return
    }

    const products = (productsRes.data ?? []) as DailyProductSummary[]
    const money = (moneyRes.data ?? []) as DailyMoneySummary[]

    // The view is one row per product per day, so fold the days together.
    const sold = new Map<number, number>()
    for (const r of products) {
      sold.set(r.product_id, (sold.get(r.product_id) ?? 0) + r.cylinders_sold)
    }
    setSoldByProduct(sold)

    // Cash actually taken in: standalone payments plus sales settled on the
    // spot. Unpaid credit sales are dues, not collections.
    setCollected(
      money.reduce((s, r) => s + r.payments_collected, 0) +
        products.reduce((s, r) => s + r.collected_at_sale, 0),
    )
    setError(null)
    setLoading(false)
  }, [segment, year, month])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { soldByProduct, collected, loading, error, refresh }
}
