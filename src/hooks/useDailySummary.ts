import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DailyMoneySummary, DailyProductSummary, DailyPurchaseSummary } from '../types/db'

function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Today's daily_product_summary + daily_money_summary rows, plus
 * daily_purchase_summary if that view exists. Phase 2 (which owns the
 * `purchases` table and its summary view) may not be deployed yet, so the
 * purchases fetch is best-effort: a missing view/table yields an empty
 * `purchases` array rather than surfacing an error, letting the Reports
 * screen omit the purchases sub-section instead of crashing.
 */
export function useDailySummary() {
  const [products, setProducts] = useState<DailyProductSummary[]>([])
  const [money, setMoney] = useState<DailyMoneySummary | null>(null)
  const [purchases, setPurchases] = useState<DailyPurchaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const day = todayStart()

    const [productsRes, moneyRes] = await Promise.all([
      supabase.from('daily_product_summary').select('*').eq('day', day).eq('segment', 'commercial'),
      supabase.from('daily_money_summary').select('*').eq('day', day).maybeSingle(),
    ])

    if (productsRes.error) setError(productsRes.error.message)
    else setProducts(productsRes.data as DailyProductSummary[])

    if (!productsRes.error && moneyRes.error) setError(moneyRes.error.message)
    else if (!moneyRes.error) setMoney(moneyRes.data as DailyMoneySummary | null)

    // Best-effort: daily_purchase_summary depends on Phase 2's `purchases`
    // table. If it doesn't exist yet, swallow the error and leave purchases
    // empty so the screen degrades gracefully instead of erroring out.
    try {
      const purchasesRes = await supabase
        .from('daily_purchase_summary')
        .select('*')
        .eq('day', day)
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

  return { products, money, purchases, loading, error, refresh }
}
