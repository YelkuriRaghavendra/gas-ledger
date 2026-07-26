import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bill, BillLine } from '../types/db'

export interface DomesticBill {
  billId: number
  billNumber: string
  createdAt: string
  method: 'cash' | 'upi' | 'vitran' | null
  note: string | null
  total: number
  lines: BillLine[]
}

function toBills(bills: (Bill & { bill_lines: BillLine[] })[]): DomesticBill[] {
  return bills.map(b => ({
    billId: b.id,
    billNumber: b.bill_number,
    createdAt: b.created_at,
    method: b.method,
    note: b.note,
    total: b.total_amount,
    lines: b.bill_lines,
  }))
}

export function useDomesticSales(sinceIso?: string) {
  const [bills, setBills] = useState<DomesticBill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('bills')
      .select('*, bill_lines(*)')
      .is('customer_id', null)
      .eq('type', 'sale')
      .order('created_at', { ascending: false })
    if (sinceIso) query = query.gte('created_at', sinceIso)
    else query = query.limit(200)
    const { data, error } = await query
    if (error) setError(error.message)
    else setBills(toBills(data as (Bill & { bill_lines: BillLine[] })[]))
    setLoading(false)
  }, [sinceIso])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { bills, loading, error, refresh }
}
