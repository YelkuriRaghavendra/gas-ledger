import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PurchaseOrder, PurchaseLine, Segment } from '../types/db'

export interface PurchaseOrderWithLines extends PurchaseOrder {
  purchase_lines: PurchaseLine[]
}

export function usePurchaseOrders(segment: Segment = 'commercial') {
  const [data, setData] = useState<PurchaseOrderWithLines[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, purchase_lines(*, products!inner(segment))')
      .eq('purchase_lines.products.segment', segment)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else {
      const orders = (data ?? []).map((row: any) => ({
        ...row,
        purchase_lines: (row.purchase_lines ?? []).map(({ products: _p, ...line }: any) => line),
      })) as PurchaseOrderWithLines[]
      setData(orders.filter(o => o.purchase_lines.length > 0))
    }
    setLoading(false)
  }, [segment])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
