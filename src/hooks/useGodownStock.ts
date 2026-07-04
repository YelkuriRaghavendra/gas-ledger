import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GodownStock } from '../types/db'

export function useGodownStock() {
  const [data, setData] = useState<GodownStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('godown_stock')
      .select('*')
      .order('product_id', { ascending: true })
    if (error) setError(error.message)
    else setData(data as GodownStock[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
