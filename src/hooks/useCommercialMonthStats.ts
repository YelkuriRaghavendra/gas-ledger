import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { monthWindow, sumByMonth, type MonthKey } from '../utils/reportsTrend'
import type { DailyMoneySummary, DailyProductSummary, DailyPurchaseSummary } from '../types/db'

/** One number per month of the window, in window order. */
export interface MonthSeries {
  sold: number[]
  purchased: number[]
  emptiesIn: number[]
  emptiesOut: number[]
  collected: number[]
  purchaseSpend: number[]
}

const EMPTY: MonthSeries = {
  sold: [], purchased: [], emptiesIn: [], emptiesOut: [], collected: [], purchaseSpend: [],
}

/**
 * The operational side of the report — volume, empties, supplier spend and cash
 * collected — over the `months` ending at the month given.
 *
 * Built from the daily summary views rather than the profit RPCs because those
 * are owner-gated and priced for costing work; these are plain aggregates the
 * Home screen already reads.
 */
export function useCommercialMonthStats(year: number, month: number, months = 12) {
  const [series, setSeries] = useState<MonthSeries>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const window: MonthKey[] = useMemo(() => monthWindow(year, month, months), [year, month, months])
  const start = `${window[0].key}-01`
  const last = window[window.length - 1]
  const end = `${last.month === 12 ? last.year + 1 : last.year}-${String(last.month === 12 ? 1 : last.month + 1).padStart(2, '0')}-01`

  const refresh = useCallback(async () => {
    setLoading(true)

    const [productRes, purchaseRes, moneyRes] = await Promise.all([
      supabase
        .from('daily_product_summary')
        .select('*')
        .eq('segment', 'commercial')
        .gte('day', start)
        .lt('day', end),
      supabase
        .from('daily_purchase_summary')
        .select('*')
        .eq('segment', 'commercial')
        .gte('day', start)
        .lt('day', end),
      supabase.from('daily_money_summary').select('*').gte('day', start).lt('day', end),
    ])

    const failure = productRes.error ?? purchaseRes.error ?? moneyRes.error
    if (failure) {
      setError(failure.message)
      setSeries(EMPTY)
      setLoading(false)
      return
    }

    const products = (productRes.data ?? []) as DailyProductSummary[]
    const purchases = (purchaseRes.data ?? []) as DailyPurchaseSummary[]
    // daily_money_summary carries no segment: payment-type bills only exist on
    // the commercial side, because a domestic counter bill is paid as it is
    // written. useMonthSummary reads it the same way on the Home screen.
    const money = (moneyRes.data ?? []) as DailyMoneySummary[]

    // Cash in is standalone payments plus sales settled at the counter.
    const payments = sumByMonth(money, window, (r) => r.payments_collected)
    const atCounter = sumByMonth(products, window, (r) => r.collected_at_sale)

    setSeries({
      sold: sumByMonth(products, window, (r) => r.cylinders_sold),
      purchased: sumByMonth(purchases, window, (r) => r.cylinders_purchased),
      emptiesIn: sumByMonth(products, window, (r) => r.empties_collected),
      emptiesOut: sumByMonth(purchases, window, (r) => r.empties_given_to_supplier),
      purchaseSpend: sumByMonth(purchases, window, (r) => r.purchase_amount),
      collected: payments.map((total, i) => total + atCounter[i]),
    })
    setError(null)
    setLoading(false)
  }, [start, end, window])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { window, series, loading, error, refresh }
}
