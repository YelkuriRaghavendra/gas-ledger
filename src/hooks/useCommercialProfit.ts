import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { billsInWindow, settleOldestFirst, type SettledBill } from '../utils/profit'
import type { BillLineProfit, BillProfit, PaymentBill } from '../types/db'

// Half-open [start, end) bounds on the view's IST `day` column, matching
// useMonthSummary so both screens bucket a month identically.
function monthBounds(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return { start: `${year}-${pad(month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` }
}

// Realisation is settled against the customer's whole payment history, not just
// the month on screen: a September bill can be cleared by an October payment,
// and a payment made before the window still covers bills inside it.
async function loadPayments(): Promise<PaymentBill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select('customer_id, created_at, total_amount')
    .eq('type', 'payment')
  if (error) throw error
  return (data ?? []).filter((p) => p.customer_id != null) as PaymentBill[]
}

function isForbidden(error: { code?: string } | null) {
  return error?.code === '42501'
}

export function useCommercialProfit(year: number, month: number) {
  const [bills, setBills] = useState<SettledBill[]>([])
  const [lines, setLines] = useState<BillLineProfit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setForbidden(false)
    const { start, end } = monthBounds(year, month)

    // Bills are fetched from the beginning of time, not from `start`, because
    // settlement is a running process over a customer's whole history: it pools
    // their payments and applies them oldest-bill-first, ignoring payment dates
    // entirely. Feeding a one-month bill queue a lifetime payment pool lets the
    // same rupee realise a bill in August and again in September.
    //
    // The upper bound is still `end`: bills AFTER the window cannot affect how
    // much of the pool reaches bills inside it (they queue behind them), while
    // bills BEFORE it consume the pool first and must be present. Settle over
    // everything, then slice.
    //
    // commercial_line_profit_range stays scoped to the window — the by-product
    // breakdown has no settlement in it and needs no history.
    const [billRes, lineRes] = await Promise.all([
      supabase.rpc('commercial_bill_profit', { p_from: '1900-01-01', p_to: end }),
      supabase.rpc('commercial_line_profit_range', { p_from: start, p_to: end }),
    ])

    const rpcError = billRes.error ?? lineRes.error
    if (rpcError) {
      setForbidden(isForbidden(rpcError))
      setError(isForbidden(rpcError) ? null : rpcError.message)
      setBills([])
      setLines([])
      setLoading(false)
      return
    }

    try {
      const payments = await loadPayments()
      const settled = settleOldestFirst((billRes.data ?? []) as BillProfit[], payments)
      setBills(billsInWindow(settled, start, end))
      setLines((lineRes.data ?? []) as BillLineProfit[])
      setError(null)
    } catch (e: any) {
      setError(e.message)
      setBills([])
      setLines([])
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { bills, lines, loading, error, forbidden, refresh }
}

export function useCustomerProfit(customerId: number) {
  const [bills, setBills] = useState<SettledBill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setForbidden(false)

    const { data, error: rpcError } = await supabase.rpc('commercial_bill_profit_for_customer', {
      p_customer_id: customerId,
    })

    if (rpcError) {
      setForbidden(isForbidden(rpcError))
      setError(isForbidden(rpcError) ? null : rpcError.message)
      setBills([])
      setLoading(false)
      return
    }

    const { data: payments, error: payError } = await supabase
      .from('bills')
      .select('customer_id, created_at, total_amount')
      .eq('type', 'payment')
      .eq('customer_id', customerId)

    if (payError) {
      setError(payError.message)
      setBills([])
      setLoading(false)
      return
    }

    setBills(settleOldestFirst((data ?? []) as BillProfit[], (payments ?? []) as PaymentBill[]))
    setError(null)
    setLoading(false)
  }, [customerId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { bills, loading, error, forbidden, refresh }
}
