import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerProductBalance } from '../types/db'

export function useCustomerProductBalances(customerId: number) {
  const [data, setData] = useState<CustomerProductBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_product_balances')
      .select('*')
      .eq('customer_id', customerId)
      .order('product_id', { ascending: true })
    if (error) setError(error.message)
    else setData(data as CustomerProductBalance[])
    setLoading(false)
  }, [customerId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('customer_product_balances')
      .select('*')
      .eq('customer_id', customerId)
      .order('product_id', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setData(data as CustomerProductBalance[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [customerId])

  return { data, loading, error, refresh }
}
