import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Transaction } from '../types/db'

export interface DomesticBill {
  billId: string
  createdAt: string
  method: 'cash' | 'upi' | 'vitran' | null
  note: string | null
  total: number
  lines: Transaction[]
}

// Domestic sales are transactions with no customer. Rows sharing a
// bill_id form one multi-item bill; legacy/loose rows fall back to
// their own id as the grouping key.
function groupIntoBills(rows: Transaction[]): DomesticBill[] {
  const byBill = new Map<string, Transaction[]>()
  for (const t of rows) {
    const key = t.bill_id ?? `tx-${t.id}`
    const list = byBill.get(key)
    if (list) list.push(t)
    else byBill.set(key, [t])
  }
  return Array.from(byBill.entries()).map(([billId, lines]) => ({
    billId,
    createdAt: lines[0].created_at,
    method: lines[0].method,
    note: lines[0].note,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    lines,
  }))
}

export function useDomesticSales(sinceIso?: string) {
  const [bills, setBills] = useState<DomesticBill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*')
      .is('customer_id', null)
      .eq('type', 'sale')
      .order('created_at', { ascending: false })
    if (sinceIso) query = query.gte('created_at', sinceIso)
    else query = query.limit(200)
    const { data, error } = await query
    if (error) setError(error.message)
    else setBills(groupIntoBills(data as Transaction[]))
    setLoading(false)
  }, [sinceIso])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { bills, loading, error, refresh }
}
