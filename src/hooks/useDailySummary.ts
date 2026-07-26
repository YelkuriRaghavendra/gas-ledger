import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DailyMoneySummary, DailyProductSummary, DailyPurchaseSummary } from '../types/db'

function todayInIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

export function useDailySummary() {
  const [products, setProducts] = useState<DailyProductSummary[]>([])
  const [money, setMoney] = useState<DailyMoneySummary | null>(null)
  const [purchases, setPurchases] = useState<DailyPurchaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const day = todayInIST()

    const [productsRes, moneyRes, purchasesRes] = await Promise.all([
      supabase.from('daily_product_summary').select('*').eq('day', day).eq('segment', 'commercial'),
      supabase.from('daily_money_summary').select('*').eq('day', day).maybeSingle(),
      supabase.from('daily_purchase_summary').select('*').eq('day', day).eq('segment', 'commercial'),
    ])

    if (productsRes.error) setError(productsRes.error.message)
    else setProducts(productsRes.data as DailyProductSummary[])

    if (!productsRes.error && moneyRes.error) setError(moneyRes.error.message)
    else if (!moneyRes.error) setMoney(moneyRes.data as DailyMoneySummary | null)

    if (!purchasesRes.error) setPurchases(purchasesRes.data as DailyPurchaseSummary[])
    else setPurchases([])

    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { products, money, purchases, loading, error, refresh }
}
