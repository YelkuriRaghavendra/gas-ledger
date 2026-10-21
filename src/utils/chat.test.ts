import { describe, it, expect } from 'vitest'
import {
  buildThreads, customersByPhone, dayLabel, lastInboundAt, messageText, messagesForPhone,
  parseBold, previewLine, replyWindowOpen, REPLY_WINDOW_MS,
} from './chat'
import type { ChatMessage } from '../types/db'

let n = 0
function msg(o: Partial<ChatMessage>): ChatMessage {
  n += 1
  return {
    id: n, wa_message_id: `w${n}`, phone: '919876543210', direction: 'in', msg_type: 'text', body: 'hi',
    profile_name: null, status: null, created_by: null, created_at: '2026-10-21T10:00:00.000Z', read_at: null, bill_id: null, ...o,
  }
}

describe('replyWindowOpen', () => {
  const now = new Date('2026-10-21T12:00:00.000Z').getTime()
  it('is closed when the customer never wrote', () => expect(replyWindowOpen(null, now)).toBe(false))
  it('is open within 24 hours', () => expect(replyWindowOpen('2026-10-20T13:00:00.000Z', now)).toBe(true))
  it('is closed after 24 hours', () => {
    expect(replyWindowOpen(new Date(now - REPLY_WINDOW_MS - 1000).toISOString(), now)).toBe(false)
  })
})

describe('lastInboundAt', () => {
  it('ignores our own messages', () => {
    const ms = [msg({ created_at: '2026-10-21T09:00:00.000Z' }), msg({ direction: 'out', created_at: '2026-10-21T11:00:00.000Z' })]
    expect(lastInboundAt(ms)).toBe('2026-10-21T09:00:00.000Z')
  })
  it('is null with no inbound messages', () => expect(lastInboundAt([msg({ direction: 'out' })])).toBeNull())
})

describe('buildThreads', () => {
  const customers = [{ id: 7, name: 'Sree Krishna', phone: '98765 43210' }]

  it('matches a saved customer by normalised phone', () => {
    expect(customersByPhone(customers).get('919876543210')?.id).toBe(7)
    const [t] = buildThreads([msg({ profile_name: 'Ram' })], customers)
    expect(t).toMatchObject({ name: 'Sree Krishna', customerId: 7 })
  })

  it('titles an unknown number by its phone and keeps the profile name as secondary text', () => {
    const [t] = buildThreads([msg({ phone: '919111111111', profile_name: 'Sree Krishna' })], [])
    expect(t).toMatchObject({ name: '+919111111111', profileName: 'Sree Krishna', customerId: null })
    expect(buildThreads([msg({ phone: '919111111111' })], [])[0].profileName).toBeNull()
  })

  it('counts only unread inbound messages and orders newest thread first', () => {
    const threads = buildThreads(
      [
        msg({ phone: '919000000001', created_at: '2026-10-20T10:00:00.000Z' }),
        msg({ phone: '919000000002', created_at: '2026-10-21T10:00:00.000Z', read_at: '2026-10-21T10:05:00.000Z' }),
        msg({ phone: '919000000001', created_at: '2026-10-20T11:00:00.000Z' }),
        msg({ phone: '919000000001', direction: 'out', created_at: '2026-10-20T11:30:00.000Z' }),
      ],
      [],
    )
    expect(threads.map((t) => t.phone)).toEqual(['919000000002', '919000000001'])
    expect(threads[0].unread).toBe(0)
    expect(threads[1].unread).toBe(2)
    expect(threads[1].last.direction).toBe('out')
  })
})

describe('message text', () => {
  it('shows a placeholder for media', () => {
    expect(messageText(msg({ msg_type: 'image', body: null }))).toBe('Photo — open WhatsApp to view')
    expect(messageText(msg({ msg_type: 'weird', body: null }))).toBe('Message — open WhatsApp to view')
  })
})

describe('messagesForPhone and dayLabel', () => {
  it('filters one phone and sorts oldest first', () => {
    const a = msg({ created_at: '2026-10-21T10:00:00.000Z' })
    const b = msg({ created_at: '2026-10-21T09:00:00.000Z' })
    const other = msg({ phone: '919000000009' })
    expect(messagesForPhone([a, other, b], '919876543210')).toEqual([b, a])
  })
  it('labels today, yesterday and older days', () => {
    const now = new Date(2026, 9, 21, 12)
    expect(dayLabel(new Date(2026, 9, 21, 8).toISOString(), now)).toBe('Today')
    expect(dayLabel(new Date(2026, 9, 20, 8).toISOString(), now)).toBe('Yesterday')
    expect(dayLabel(new Date(2026, 9, 18, 8).toISOString(), now)).toMatch(/18/)
  })
})

describe('parseBold', () => {
  it('splits *bold* runs from plain text', () => {
    expect(parseBold('*Bill No:* B-1 | *Date:* 21-10')).toEqual([
      { text: 'Bill No:', bold: true },
      { text: ' B-1 | ', bold: false },
      { text: 'Date:', bold: true },
      { text: ' 21-10', bold: false },
    ])
  })
  it('leaves text without markup, and a lone asterisk, alone', () => {
    expect(parseBold('plain')).toEqual([{ text: 'plain', bold: false }])
    expect(parseBold('2 * 3')).toEqual([{ text: '2 * 3', bold: false }])
  })
})

describe('previewLine', () => {
  const bill = '\u{1F9FE} *New Bill*\nNamaste *Raghu* \u{1F64F}\n\n*Bill No:* B-20261021-0003  |  *Date:* 21-10-2026'
  it('shows a bill message as its title and bill number, without markup', () => {
    expect(previewLine(msg({ msg_type: 'template', body: bill }))).toBe('New Bill \u00B7 B-20261021-0003')
  })
  it('uses the first line of a plain message and a label for media', () => {
    expect(previewLine(msg({ body: 'Send 5\nthanks' }))).toBe('Send 5')
    expect(previewLine(msg({ body: null, msg_type: 'audio' }))).toBe('Voice message')
  })
})
