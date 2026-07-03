import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerBalance } from '../types/db'

export function useCustomerBalances() {
  const [data, setData] = useState<CustomerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_balances')
      .select('*')
      .order('name', { ascending: true })
    if (error) setError(error.message)
    else setData(data as CustomerBalance[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
