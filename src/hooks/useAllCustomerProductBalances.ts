import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerProductBalance } from '../types/db'

/** All customer_product_balances rows, for screens that need a summed-across-products figure per customer. */
export function useAllCustomerProductBalances() {
  const [data, setData] = useState<CustomerProductBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('customer_product_balances').select('*')
    if (error) setError(error.message)
    else setData(data as CustomerProductBalance[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
