import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WhatsAppSend } from '../types/db'

/**
 * Latest whatsapp_sends row per bill. One row per attempt is stored, so the
 * newest row is the current status.
 */
export function useWhatsAppSends(billIds: number[]) {
  const [data, setData] = useState<Record<number, WhatsAppSend>>({})
  const key = billIds.join(',')

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

    const latest: Record<number, WhatsAppSend> = {}
    for (const row of (rows ?? []) as WhatsAppSend[]) {
      if (!latest[row.bill_id]) latest[row.bill_id] = row
    }
    setData(latest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    void load()
  }, [load])

  return { data, refetch: load }
}
