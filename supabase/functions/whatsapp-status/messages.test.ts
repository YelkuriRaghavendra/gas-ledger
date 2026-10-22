import { describe, it, expect } from 'vitest'
import { parseInboundMessages } from './messages'

function payload(value: Record<string, unknown>) {
  return { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value }] }] }
}

describe('parseInboundMessages', () => {
  it('reads a text message with the sender profile name', () => {
    const out = parseInboundMessages(
      payload({
        contacts: [{ wa_id: '919876543210', profile: { name: 'Ram Reddy' } }],
        messages: [{ id: 'wamid.A', from: '919876543210', timestamp: '1758800000', type: 'text', text: { body: 'Send 5 cylinders' } }],
      }),
    )
    expect(out).toEqual([
      {
        waMessageId: 'wamid.A',
        phone: '919876543210',
        profileName: 'Ram Reddy',
        type: 'text',
        body: 'Send 5 cylinders',
        media: null,
        at: '2025-09-25T11:33:20.000Z',
      },
    ])
  })

  it('keeps media messages with a null body so the app can show a placeholder', () => {
    const out = parseInboundMessages(
      payload({ messages: [{ id: 'wamid.B', from: '919876543210', timestamp: '1758800000', type: 'image', image: { id: 'x' } }] }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: 'image', body: null, profileName: null })
  })

  it('reads image and voice-note media ids and the image caption', () => {
    const out = parseInboundMessages(
      payload({
        messages: [
          { id: 'wamid.G', from: '919876543210', type: 'image', image: { id: '1234567890', mime_type: 'image/jpeg', caption: 'Empty cylinders' } },
          { id: 'wamid.H', from: '919876543210', type: 'audio', audio: { id: '9876543210', mime_type: 'audio/ogg; codecs=opus', voice: true } },
        ],
      }),
    )
    expect(out[0]).toMatchObject({ type: 'image', body: 'Empty cylinders', media: { id: '1234567890', mime: 'image/jpeg' } })
    expect(out[1]).toMatchObject({ type: 'audio', body: null, media: { id: '9876543210', mime: 'audio/ogg; codecs=opus' } })
  })

  it('does not download video or documents, or a media id that is not numeric', () => {
    const out = parseInboundMessages(
      payload({
        messages: [
          { id: 'wamid.I', from: '919876543210', type: 'video', video: { id: '1234567890', mime_type: 'video/mp4' } },
          { id: 'wamid.J', from: '919876543210', type: 'image', image: { id: '../../etc/passwd', mime_type: 'image/png' } },
        ],
      }),
    )
    expect(out.map((m) => m.media)).toEqual([null, null])
  })

  it('reads a quick-reply button title', () => {
    const out = parseInboundMessages(
      payload({ messages: [{ id: 'wamid.C', from: '919876543210', type: 'button', button: { text: 'Yes' } }] }),
    )
    expect(out[0].body).toBe('Yes')
  })

  it('ignores status-only payloads and malformed bodies without throwing', () => {
    expect(parseInboundMessages(payload({ statuses: [{ id: 'wamid.D', status: 'read' }] }))).toEqual([])
    expect(parseInboundMessages(null)).toEqual([])
    expect(parseInboundMessages({ entry: 'nope' })).toEqual([])
  })

  it('skips messages with a missing id or an implausible sender number', () => {
    const out = parseInboundMessages(
      payload({
        messages: [
          { from: '919876543210', type: 'text', text: { body: 'no id' } },
          { id: 'wamid.E', from: 'not-a-number', type: 'text', text: { body: 'bad sender' } },
        ],
      }),
    )
    expect(out).toEqual([])
  })

  it('caps an oversized text body', () => {
    const out = parseInboundMessages(
      payload({ messages: [{ id: 'wamid.F', from: '919876543210', type: 'text', text: { body: 'x'.repeat(10000) } }] }),
    )
    expect(out[0].body).toHaveLength(4096)
  })
})
