import { supabase } from '../lib/supabase'

function datePrefix(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export async function nextBillNumber(date?: Date | string): Promise<string> {
  const prefix = 'B-' + datePrefix(date ?? new Date())
  const { count } = await supabase
    .from('bills')
    .select('id', { count: 'exact', head: true })
    .like('bill_number', prefix + '%')
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `${prefix}-${seq}`
}

export async function nextPoNumber(date?: Date | string): Promise<string> {
  const prefix = 'PO-' + datePrefix(date ?? new Date())
  const { count } = await supabase
    .from('purchase_orders')
    .select('id', { count: 'exact', head: true })
    .like('po_number', prefix + '%')
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `${prefix}-${seq}`
}
