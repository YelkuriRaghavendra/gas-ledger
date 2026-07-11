import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DailyPurchaseSummary, MonthlyMoneySummary, MonthlyProductSummary } from '../types/db'

function monthStart(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() + offset)
  return d.toISOString()
}

/**
 * Current and previous month's monthly_product_summary + monthly_money_summary
 * rows (previous month is fetched to support the optional "vs last month"
 * revenue comparison line, computed from previousProducts' revenue). Purchases-
 * derived figures, if Phase 2's `purchases` table/view exists, are rolled up
 * client-side from daily_purchase_summary for the current month only —
 * there's no monthly_purchase_summary view, and per spec this app pushes
 * aggregation into Postgres only where a view already exists; a small client
 * reduce over a handful of daily rows for the current month is consistent
 * with the "light reshaping" the spec allows for hooks like useRevenueTrend.
 */
export function useMonthlySummary() {
  const [products, setProducts] = useState<MonthlyProductSummary[]>([])
  const [previousProducts, setPreviousProducts] = useState<MonthlyProductSummary[]>([])
  const [money, setMoney] = useState<MonthlyMoneySummary | null>(null)
  const [previousMoney, setPreviousMoney] = useState<MonthlyMoneySummary | null>(null)
  const [purchases, setPurchases] = useState<DailyPurchaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const thisMonth = monthStart(0)
    const lastMonth = monthStart(-1)

    const [productsRes, prevProductsRes, moneyRes, prevMoneyRes] = await Promise.all([
      supabase.from('monthly_product_summary').select('*').eq('month', thisMonth).eq('segment', 'commercial'),
      supabase.from('monthly_product_summary').select('*').eq('month', lastMonth).eq('segment', 'commercial'),
      supabase.from('monthly_money_summary').select('*').eq('month', thisMonth).maybeSingle(),
      supabase.from('monthly_money_summary').select('*').eq('month', lastMonth).maybeSingle(),
    ])

    if (productsRes.error) setError(productsRes.error.message)
    else setProducts(productsRes.data as MonthlyProductSummary[])

    if (!prevProductsRes.error) setPreviousProducts(prevProductsRes.data as MonthlyProductSummary[])

    if (!productsRes.error && moneyRes.error) setError(moneyRes.error.message)
    else if (!moneyRes.error) setMoney(moneyRes.data as MonthlyMoneySummary | null)

    if (!prevMoneyRes.error) setPreviousMoney(prevMoneyRes.data as MonthlyMoneySummary | null)

    // Best-effort, same as useDailySummary: omit purchases figures entirely
    // if daily_purchase_summary (Phase 2) isn't available.
    try {
      const purchasesRes = await supabase
        .from('daily_purchase_summary')
        .select('*')
        .gte('day', thisMonth)
        .eq('segment', 'commercial')
      if (!purchasesRes.error) setPurchases(purchasesRes.data as DailyPurchaseSummary[])
      else setPurchases([])
    } catch {
      setPurchases([])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { products, previousProducts, money, previousMoney, purchases, loading, error, refresh }
}
