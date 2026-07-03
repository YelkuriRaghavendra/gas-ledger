import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Transaction } from '../types/db'

export function useTransactions(customerId: number) {
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setData(data as Transaction[])
    setLoading(false)
  }, [customerId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setData(data as Transaction[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [customerId])

  return { data, loading, error, refresh }
}
