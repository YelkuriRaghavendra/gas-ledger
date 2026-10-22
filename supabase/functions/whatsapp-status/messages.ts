// Pure parsing of the inbound-message part of Meta's webhook. Like statuses.ts
// it is free of Deno and Supabase imports so vitest can exercise it directly.

export interface InboundMessage {
  waMessageId: string
  /** Digits-only sender number, as Meta reports it in `from`. */
  phone: string
  profileName: string | null
  /** Meta's message type: text, image, audio, button, ... */
  type: string
  /** Text content (or a media caption), or null when there is none. */
  body: string | null
  /** Meta's media id, for the types the app downloads (image, voice note, sticker). */
  media: { id: string; mime: string } | null
  /** ISO timestamp derived from Meta's unix seconds. */
  at: string
}

const MIN_EPOCH_S = 946684800 // 2000-01-01
const MAX_EPOCH_S = 4102444800 // 2100-01-01
const MAX_BODY_CHARS = 4096

// Only these are downloaded and shown. Video and documents can be large and are
// left as a placeholder pointing to WhatsApp.
export const DOWNLOADABLE_TYPES = ['image', 'audio', 'sticker'] as const

function toIso(timestamp: unknown): string {
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || seconds < MIN_EPOCH_S || seconds > MAX_EPOCH_S) {
    return new Date().toISOString()
  }
  return new Date(seconds * 1000).toISOString()
}

function mediaOf(message: Record<string, any>): InboundMessage['media'] {
  if (!(DOWNLOADABLE_TYPES as readonly string[]).includes(message.type)) return null
  const m = message[message.type]
  // Meta media ids are numeric strings; anything else is not worth a request.
  if (typeof m?.id !== 'string' || !/^\d{5,30}$/.test(m.id)) return null
  return { id: m.id, mime: typeof m.mime_type === 'string' ? m.mime_type.slice(0, 100) : '' }
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
    case 'image':
      text = message.image?.caption
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
          media: mediaOf(message),
          at: toIso(message.timestamp),
        })
      }
    }
  }

  return out
}
