import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product } from '../types/db'

export function useProducts() {
  const [data, setData] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('products').select('*').order('id', { ascending: true })
    if (error) setError(error.message)
    else setData(data as Product[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
