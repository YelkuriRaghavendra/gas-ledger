import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WhatsAppSend } from '../types/db'

// sendBillWhatsApp is fire-and-forget and the page navigates immediately, but
// the Edge Function's round trip (auth + several DB reads + a Meta HTTP call)
// is always slower than the client's navigate + this hook's mount. Without a
// short bounded re-poll, a brand-new bill's row does not exist yet on first
// fetch and the status chip never appears until the user leaves and returns.
// Two extra passes are enough to catch the normal case without turning into
// an unbounded interval or a realtime subscription.
const REPOLL_DELAYS_MS = [2000, 5000]

/**
 * Latest whatsapp_sends row per bill. One row per attempt is stored, so the
 * newest row is the current status.
 */
export function useWhatsAppSends(billIds: number[]) {
  const [data, setData] = useState<Record<number, WhatsAppSend>>({})
  const key = billIds.join(',')
  const hasBillIds = billIds.length > 0
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    if (billIds.length === 0) {
      setData({})
      return
    }
    const { data: rows } = await supabase
      .from('whatsapp_sends')
      .select('*')
      .in('bill_id', billIds)
      .order('id', { ascending: false })

    if (!mountedRef.current) return

    const latest: Record<number, WhatsAppSend> = {}
    for (const row of (rows ?? []) as WhatsAppSend[]) {
      if (!latest[row.bill_id]) latest[row.bill_id] = row
    }
    setData(latest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Bounded re-poll: two extra fetches, then stop. Cleared on unmount and on
  // every change to the bill set so a stale timer can never fire against a
  // different (or gone) set of ids.
  useEffect(() => {
    if (!hasBillIds) return
    const timers = REPOLL_DELAYS_MS.map((ms) => setTimeout(() => void load(), ms))
    return () => timers.forEach(clearTimeout)
  }, [load, hasBillIds])

  return { data, refetch: load }
}
