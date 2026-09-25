// Pure parsing and ordering for Meta's delivery-status webhook. Kept free of
// Deno and Supabase imports so the vitest suite can exercise it directly —
// index.ts holds everything that touches the network or the database.

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface StatusUpdate {
  messageId: string
  status: DeliveryStatus
  /** ISO timestamp derived from Meta's unix seconds. */
  at: string
  errorCode: number | null
  errorDetail: string | null
}

const KNOWN: readonly string[] = ['sent', 'delivered', 'read', 'failed']

// Meta does not guarantee callback order, so a late 'sent' can arrive after
// 'delivered'. Rank forces the record forwards only. 'failed' is terminal:
// a message that failed is never subsequently delivered.
const RANK: Record<DeliveryStatus, number> = { sent: 1, delivered: 2, read: 3, failed: 4 }

export function outranks(incoming: DeliveryStatus, current: DeliveryStatus | null): boolean {
  if (current === null) return true
  if (current === 'failed') return false
  return RANK[incoming] > RANK[current]
}

// Number.isFinite alone is not enough: 1e20 is finite but overflows Date and
// makes toISOString throw, which would discard every status in the batch.
const MIN_EPOCH_S = 946684800 // 2000-01-01
const MAX_EPOCH_S = 4102444800 // 2100-01-01

function toIso(timestamp: unknown): string {
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || seconds < MIN_EPOCH_S || seconds > MAX_EPOCH_S) {
    return new Date().toISOString()
  }
  return new Date(seconds * 1000).toISOString()
}

function isInt32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 2147483647
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function errorDetail(error: Record<string, any> | undefined): string | null {
  if (!error) return null
  const details = error.error_data?.details
  if (error.title && details) return `${error.title}: ${details}`
  return details ?? error.title ?? error.message ?? null
}

/**
 * Flattens a webhook body into the status updates it carries. Returns an empty
 * array for anything unexpected — inbound message events, other change fields,
 * or a malformed body. A webhook that throws gets retried by Meta forever, so
 * this never throws.
 */
export function parseStatusPayload(body: unknown): StatusUpdate[] {
  const updates: StatusUpdate[] = []
  const entries = asArray((body as any)?.entry)

  for (const entry of entries) {
    for (const change of asArray((entry as any)?.changes)) {
      for (const status of asArray((change as any)?.value?.statuses)) {
        const s = status as Record<string, any>
        if (typeof s.id !== 'string' || !KNOWN.includes(s.status)) continue

        const error = asArray(s.errors)[0] as Record<string, any> | undefined

        updates.push({
          messageId: s.id,
          status: s.status as DeliveryStatus,
          at: toIso(s.timestamp),
          // Constrained to a 32-bit int: the column is `int`, and an oversized
          // JSON number would make the UPDATE fail and lose the whole status.
          errorCode: isInt32(error?.code) ? error!.code : null,
          errorDetail: errorDetail(error)?.slice(0, 500) ?? null,
        })
      }
    }
  }

  return updates
}
