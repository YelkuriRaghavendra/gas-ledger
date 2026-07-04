import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Purchase } from '../types/db'

export function usePurchases() {
  const [data, setData] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setData(data as Purchase[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
