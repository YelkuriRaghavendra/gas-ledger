import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerBalance } from '../types/db'

export function useCustomerBalance(id: number) {
  const [data, setData] = useState<CustomerBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_balances')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) setError(error.message)
    else setData(data as CustomerBalance)
    setLoading(false)
  }, [id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('customer_balances')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setData(data as CustomerBalance)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return { data, loading, error, refresh }
}
