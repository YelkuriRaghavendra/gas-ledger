import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bill, BillLine } from '../types/db'

export interface BillWithLines extends Bill {
  bill_lines: BillLine[]
}

export function useBills(customerId: number) {
  const [data, setData] = useState<BillWithLines[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('bills')
      .select('*, bill_lines(*)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setData(data as BillWithLines[])
    setLoading(false)
  }, [customerId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('bills')
      .select('*, bill_lines(*)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setData(data as BillWithLines[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [customerId])

  return { data, loading, error, refresh }
}
