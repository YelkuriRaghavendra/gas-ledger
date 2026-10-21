import { normalizeIndianPhone } from './phone'
import type { ChatMessage } from '../types/db'

/** Meta lets us send free text only this long after the customer's last message. */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

export interface ChatCustomer {
  id: number
  name: string
  phone: string | null
}

export interface ChatThread {
  phone: string
  name: string
  customerId: number | null
  last: ChatMessage
  unread: number
}

/** True while a free-text reply is allowed. `lastInboundAt` is null when the customer has never written. */
export function replyWindowOpen(lastInboundAt: string | null, now: number = Date.now()): boolean {
  if (!lastInboundAt) return false
  return now - new Date(lastInboundAt).getTime() <= REPLY_WINDOW_MS
}

export function lastInboundAt(messages: ChatMessage[]): string | null {
  let latest: string | null = null
  for (const m of messages) {
    if (m.direction === 'in' && (latest === null || m.created_at > latest)) latest = m.created_at
  }
  return latest
}

/** Maps a normalised phone to the customer it belongs to. */
export function customersByPhone(customers: ChatCustomer[]): Map<string, ChatCustomer> {
  const map = new Map<string, ChatCustomer>()
  for (const c of customers) {
    const phone = normalizeIndianPhone(c.phone)
    if (phone && !map.has(phone)) map.set(phone, c)
  }
  return map
}

/** One thread per phone number, newest conversation first. */
export function buildThreads(messages: ChatMessage[], customers: ChatCustomer[]): ChatThread[] {
  const byPhone = customersByPhone(customers)
  const threads = new Map<string, ChatThread>()

  for (const m of messages) {
    const customer = byPhone.get(m.phone)
    let thread = threads.get(m.phone)
    if (!thread) {
      thread = { phone: m.phone, name: customer?.name ?? `+${m.phone}`, customerId: customer?.id ?? null, last: m, unread: 0 }
      threads.set(m.phone, thread)
    }
    if (m.created_at >= thread.last.created_at) thread.last = m
    // A saved customer is named by us; an unknown number takes the sender's WhatsApp name.
    if (!customer && m.profile_name) thread.name = m.profile_name
    if (m.direction === 'in' && !m.read_at) thread.unread += 1
  }

  return [...threads.values()].sort((a, b) => (a.last.created_at < b.last.created_at ? 1 : -1))
}

const MEDIA_LABEL: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  document: 'Document',
  sticker: 'Sticker',
  location: 'Location',
  contacts: 'Contact',
}

/** What to show for a message: its text, or a placeholder for media the app cannot render. */
export function messageText(m: ChatMessage): string {
  if (m.body) return m.body
  return `${MEDIA_LABEL[m.msg_type] ?? 'Message'} — open WhatsApp to view`
}

/** One plain line for the chat list: bill messages read "New Bill · B-123", media gets its label. */
export function previewLine(m: ChatMessage): string {
  if (!m.body) return MEDIA_LABEL[m.msg_type] ?? 'Message'
  const plain = m.body.replace(/\*/g, '')
  const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean)
  const title = (lines[0] ?? '').replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')
  const billNo = plain.match(/Bill No:\s*([^\s|]+)/)?.[1]
  if (m.msg_type === 'template' && billNo) return `${title} \u00B7 ${billNo}`
  return title
}

export function messagesForPhone(messages: ChatMessage[], phone: string): ChatMessage[] {
  return messages
    .filter((m) => m.phone === phone)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id))
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
}

/** Thread list stamp: time today, otherwise the day. */
export function threadStamp(iso: string, now: Date = new Date()): string {
  return sameDay(new Date(iso), now) ? timeLabel(iso) : dayLabel(iso, now)
}

export interface TextRun {
  text: string
  bold: boolean
}

/** Splits WhatsApp-style `*bold*` markup into runs. Unmatched asterisks stay as plain text. */
export function parseBold(text: string): TextRun[] {
  const runs: TextRun[] = []
  const re = /\*([^*\n]+)\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false })
    runs.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false })
  return runs
}
