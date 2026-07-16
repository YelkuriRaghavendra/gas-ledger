import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GodownStock, Segment } from '../types/db'

export function useGodownStock(segment: Segment = 'commercial') {
  const [data, setData] = useState<GodownStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('godown_stock')
      .select('*')
      .eq('segment', segment)
      .order('product_id', { ascending: true })
    if (error) setError(error.message)
    else setData(data as GodownStock[])
    setLoading(false)
  }, [segment])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
