import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const WINDOW_DAYS = 14

export interface EmptiesNetRate {
  product_id: number
  net_rate_per_day: number
}

export function useEmptiesNetRate() {
  const [data, setData] = useState<EmptiesNetRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()

    const [billRes, purchaseRes] = await Promise.all([
      supabase
        .from('bill_lines')
        .select('product_id, qty, empties, bills!inner(type)')
        .in('bills.type', ['sale', 'return'])
        .gte('created_at', since),
      supabase
        .from('purchase_lines')
        .select('product_id, empties_given')
        .gte('created_at', since),
    ])

    if (billRes.error) {
      setError(billRes.error.message)
      setLoading(false)
      return
    }
    if (purchaseRes.error) {
      setError(purchaseRes.error.message)
      setLoading(false)
      return
    }

    const inByProduct = new Map<number, number>()
    for (const row of billRes.data ?? []) {
      const r = row as any
      const billType = r.bills?.type
      const amount = billType === 'sale' ? r.empties : r.qty
      inByProduct.set(r.product_id, (inByProduct.get(r.product_id) ?? 0) + amount)
    }

    const outByProduct = new Map<number, number>()
    for (const p of purchaseRes.data ?? []) {
      outByProduct.set(p.product_id, (outByProduct.get(p.product_id) ?? 0) + p.empties_given)
    }

    const productIds = new Set([...inByProduct.keys(), ...outByProduct.keys()])
    const rates: EmptiesNetRate[] = [...productIds].map((product_id) => ({
      product_id,
      net_rate_per_day: ((inByProduct.get(product_id) ?? 0) - (outByProduct.get(product_id) ?? 0)) / WINDOW_DAYS,
    }))

    setData(rates)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
