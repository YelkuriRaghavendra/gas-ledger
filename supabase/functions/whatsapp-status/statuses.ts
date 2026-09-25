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

        const seconds = Number(s.timestamp)
        const error = asArray(s.errors)[0] as Record<string, any> | undefined

        updates.push({
          messageId: s.id,
          status: s.status as DeliveryStatus,
          at: Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : new Date().toISOString(),
          errorCode: typeof error?.code === 'number' ? error.code : null,
          errorDetail: errorDetail(error),
        })
      }
    }
  }

  return updates
}
