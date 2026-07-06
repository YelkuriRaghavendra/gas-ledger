import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const WINDOW_DAYS = 14

export interface EmptiesNetRate {
  product_id: number
  net_rate_per_day: number
}

// Trailing 14-day net accumulation rate of empties in the godown, per product.
// empties_in = sale.empties + return.qty (customers handing back / owing empties)
// empties_out = purchases.empties_given (handed back to the supplier)
export function useEmptiesNetRate() {
  const [data, setData] = useState<EmptiesNetRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()

    const [txRes, purchaseRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('product_id, type, qty, empties')
        .in('type', ['sale', 'return'])
        .gte('created_at', since),
      supabase.from('purchases').select('product_id, empties_given').gte('created_at', since),
    ])

    if (txRes.error) {
      setError(txRes.error.message)
      setLoading(false)
      return
    }
    if (purchaseRes.error) {
      setError(purchaseRes.error.message)
      setLoading(false)
      return
    }

    const inByProduct = new Map<number, number>()
    for (const t of txRes.data ?? []) {
      if (t.product_id === null) continue
      const amount = t.type === 'sale' ? t.empties : t.qty
      inByProduct.set(t.product_id, (inByProduct.get(t.product_id) ?? 0) + amount)
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
