import type { WhatsAppSend } from '../types/db'

// Must match STALE_CLAIM_MS in supabase/functions/send-bill-whatsapp/index.ts.
// The function inserts a `pending` row before calling Meta and updates that
// same row to `sent`/`failed` afterwards. A `pending` row older than this is
// an abandoned claim left by a crash between the claim and recording the
// outcome, not a send that is still in flight.
export const STALE_PENDING_MS = 5 * 60 * 1000

export type WhatsAppDisplayState =
  | { kind: 'none' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'stale' }
  | { kind: 'failed'; reason: string | null }
  | { kind: 'disabled' }
  | { kind: 'no_phone' }
  | { kind: 'invalid_phone' }

/**
 * Pure decision of what to show for a bill's latest whatsapp_sends row.
 * Exported so the pending-vs-stale threshold can be unit tested without
 * rendering anything.
 */
export function getWhatsAppDisplayState(
  send: WhatsAppSend | undefined,
  now: number = Date.now(),
): WhatsAppDisplayState {
  if (!send) return { kind: 'none' }

  if (send.status === 'pending') {
    const ageMs = now - new Date(send.created_at).getTime()
    return ageMs < STALE_PENDING_MS ? { kind: 'sending' } : { kind: 'stale' }
  }

  if (send.status === 'sent') return { kind: 'sent' }

  if (send.status === 'failed') return { kind: 'failed', reason: send.reason }

  // status === 'skipped'
  switch (send.reason) {
    case 'disabled':
      return { kind: 'disabled' }
    case 'no_phone':
      return { kind: 'no_phone' }
    case 'invalid_phone':
      return { kind: 'invalid_phone' }
    case 'already_sent':
      // A live/successful send already exists for this bill — this attempt
      // was correctly skipped, so it reads the same as a normal send.
      return { kind: 'sent' }
    default:
      // not_applicable / no_customer — nothing worth showing.
      return { kind: 'none' }
  }
}

interface Props {
  send: WhatsAppSend | undefined
  onRetry: () => void
  onEnable?: () => void
  onAddPhone?: () => void
  now?: number
}

export function WhatsAppStatus({ send, onRetry, onEnable, onAddPhone, now }: Props) {
  const state = getWhatsAppDisplayState(send, now)

  switch (state.kind) {
    case 'none':
      return null

    case 'sending':
      return <span className="text-[11px] font-bold text-muted">Sending…</span>

    case 'sent':
      return <span className="text-[11px] font-bold text-[#2E8B57]">✓ Sent on WhatsApp</span>

    case 'stale':
      return (
        <span className="text-[11px] font-bold text-muted">
          ⚠ Not sent — send did not complete{' '}
          <button type="button" onClick={onRetry} className="underline text-accent">
            Retry
          </button>
        </span>
      )

    case 'failed':
      return (
        <span className="text-[11px] font-bold text-muted">
          ⚠ Not sent — {state.reason ?? 'unknown error'}{' '}
          <button type="button" onClick={onRetry} className="underline text-accent">
            Retry
          </button>
        </span>
      )

    case 'disabled':
      return (
        <span className="text-[11px] font-bold text-muted">
          WhatsApp off for this customer
          {onEnable && (
            <>
              {' '}
              <button type="button" onClick={onEnable} className="underline text-accent">
                Turn on
              </button>
            </>
          )}
        </span>
      )

    case 'no_phone':
    case 'invalid_phone':
      return (
        <span className="text-[11px] font-bold text-muted">
          {state.kind === 'no_phone' ? 'No phone number' : 'Phone number not valid'}
          {onAddPhone && (
            <>
              {' '}
              <button type="button" onClick={onAddPhone} className="underline text-accent">
                Add phone
              </button>
            </>
          )}
        </span>
      )
  }
}
