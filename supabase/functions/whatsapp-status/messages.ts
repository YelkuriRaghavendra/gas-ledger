// Pure parsing of the inbound-message part of Meta's webhook. Like statuses.ts
// it is free of Deno and Supabase imports so vitest can exercise it directly.

export interface InboundMessage {
  waMessageId: string
  /** Digits-only sender number, as Meta reports it in `from`. */
  phone: string
  profileName: string | null
  /** Meta's message type: text, image, audio, button, ... */
  type: string
  /** Text content, or null for media the app cannot render. */
  body: string | null
  /** ISO timestamp derived from Meta's unix seconds. */
  at: string
}

const MIN_EPOCH_S = 946684800 // 2000-01-01
const MAX_EPOCH_S = 4102444800 // 2100-01-01
const MAX_BODY_CHARS = 4096

function toIso(timestamp: unknown): string {
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || seconds < MIN_EPOCH_S || seconds > MAX_EPOCH_S) {
    return new Date().toISOString()
  }
  return new Date(seconds * 1000).toISOString()
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function textOf(message: Record<string, any>): string | null {
  let text: unknown = null
  switch (message.type) {
    case 'text':
      text = message.text?.body
      break
    case 'button':
      text = message.button?.text
      break
    case 'interactive':
      text = message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title
      break
  }
  if (typeof text !== 'string' || text.trim() === '') return null
  return text.slice(0, MAX_BODY_CHARS)
}

/**
 * Flattens a webhook body into the customer messages it carries. Never throws:
 * a webhook that throws gets retried by Meta indefinitely.
 */
export function parseInboundMessages(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = []

  for (const entry of asArray((body as any)?.entry)) {
    for (const change of asArray((entry as any)?.changes)) {
      const value = (change as any)?.value
      const names = new Map<string, string>()
      for (const c of asArray(value?.contacts)) {
        const contact = c as Record<string, any>
        if (typeof contact.wa_id === 'string' && typeof contact.profile?.name === 'string') {
          names.set(contact.wa_id, contact.profile.name.slice(0, 100))
        }
      }

      for (const m of asArray(value?.messages)) {
        const message = m as Record<string, any>
        if (typeof message.id !== 'string' || typeof message.from !== 'string') continue
        if (!/^\d{8,15}$/.test(message.from)) continue

        out.push({
          waMessageId: message.id,
          phone: message.from,
          profileName: names.get(message.from) ?? null,
          type: typeof message.type === 'string' ? message.type.slice(0, 30) : 'unknown',
          body: textOf(message),
          at: toIso(message.timestamp),
        })
      }
    }
  }

  return out
}
