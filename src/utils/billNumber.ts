import { supabase } from '../lib/supabase'

function datePrefix(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export async function nextBillNumber(date?: Date | string): Promise<string> {
  const prefix = 'B-' + datePrefix(date ?? new Date())
  const { data } = await supabase
    .from('bills')
    .select('bill_number')
    .like('bill_number', prefix + '%')
    .order('bill_number', { ascending: false })
    .limit(1)
  const last = data?.[0]?.bill_number
  const lastSeq = last ? parseInt(last.slice(-4), 10) : 0
  const seq = String(lastSeq + 1).padStart(4, '0')
  return `${prefix}-${seq}`
}

export async function nextPoNumber(date?: Date | string): Promise<string> {
  const prefix = 'PO-' + datePrefix(date ?? new Date())
  const { data } = await supabase
    .from('purchase_orders')
    .select('po_number')
    .like('po_number', prefix + '%')
    .order('po_number', { ascending: false })
    .limit(1)
  const last = data?.[0]?.po_number
  const lastSeq = last ? parseInt(last.slice(-4), 10) : 0
  const seq = String(lastSeq + 1).padStart(4, '0')
  return `${prefix}-${seq}`
}
