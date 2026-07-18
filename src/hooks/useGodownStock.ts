import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GodownStock, Segment } from '../types/db'

// segment 'all' returns every product across both segments (used by the
// all-stock screen); a specific segment filters to that side.
export function useGodownStock(segment: Segment | 'all' = 'commercial') {
  const [data, setData] = useState<GodownStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('godown_stock').select('*')
    query = segment === 'all' ? query.order('segment').order('product_id') : query.eq('segment', segment).order('product_id')
    const { data, error } = await query
    if (error) setError(error.message)
    else setData(data as GodownStock[])
    setLoading(false)
  }, [segment])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
