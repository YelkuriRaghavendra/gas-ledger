import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Purchase, Segment } from '../types/db'

export function usePurchases(segment: Segment = 'commercial') {
  const [data, setData] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    // Inner join products so each segment's purchase history stays isolated.
    const { data, error } = await supabase
      .from('purchases')
      .select('*, products!inner(segment)')
      .eq('products.segment', segment)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setData((data as (Purchase & { products: unknown })[]).map(({ products: _p, ...row }) => row as Purchase))
    setLoading(false)
  }, [segment])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
