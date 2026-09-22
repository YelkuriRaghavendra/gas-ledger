import { supabase } from './supabase'

/**
 * Ask the backend to send the WhatsApp message for a saved bill.
 *
 * Deliberately fire-and-forget: recording a bill must never fail or stall
 * because Meta is slow or down. The outcome is recorded server-side in
 * whatsapp_sends and surfaced on the bill afterwards.
 *
 * Only the bill id is sent. All message content is derived server-side.
 */
export function sendBillWhatsApp(billId: number): void {
  if (!Number.isFinite(billId) || billId <= 0) return

  void supabase.functions
    .invoke('send-bill-whatsapp', { body: { bill_id: billId } })
    .catch(() => {
      // Swallowed on purpose. A failure here is visible on the bill's
      // WhatsApp status, and must not surface as a save error.
    })
}
