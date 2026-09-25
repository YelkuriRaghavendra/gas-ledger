import { describe, it, expect } from 'vitest'
import { parseStatusPayload, outranks, type StatusUpdate } from './statuses'

const wamid = 'wamid.HBgMOTE5NjQyOTk5MTk2FQIAERgSQzg5MzNGMUIzOUUxNzYyNDFCAA=='

function payload(statuses: unknown[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: '123', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', statuses } }] }],
  }
}

describe('parseStatusPayload', () => {
  it('reads a delivered status', () => {
    const out = parseStatusPayload(payload([{ id: wamid, status: 'delivered', timestamp: '1758800000' }]))
    expect(out).toEqual<StatusUpdate[]>([
      { messageId: wamid, status: 'delivered', at: '2025-09-25T11:33:20.000Z', errorCode: null, errorDetail: null },
    ])
  })

  it('carries the error code and a readable detail on failure', () => {
    const out = parseStatusPayload(
      payload([
        {
          id: wamid,
          status: 'failed',
          timestamp: '1758800000',
          errors: [{ code: 131049, title: 'Not delivered', message: 'Meta chose not to deliver', error_data: { details: 'per-user marketing cap' } }],
        },
      ]),
    )
    expect(out[0].status).toBe('failed')
    expect(out[0].errorCode).toBe(131049)
    expect(out[0].errorDetail).toBe('Not delivered: per-user marketing cap')
  })

  it('falls back to the error message when no details are given', () => {
    const out = parseStatusPayload(
      payload([{ id: wamid, status: 'failed', timestamp: '1758800000', errors: [{ code: 470, message: 'Re-engagement required' }] }]),
    )
    expect(out[0].errorDetail).toBe('Re-engagement required')
  })

  it('returns every status in a batched payload', () => {
    const out = parseStatusPayload(
      payload([
        { id: 'wamid.A', status: 'sent', timestamp: '1758800000' },
        { id: 'wamid.B', status: 'read', timestamp: '1758800001' },
      ]),
    )
    expect(out.map((u) => u.messageId)).toEqual(['wamid.A', 'wamid.B'])
  })

  it('ignores inbound message events, which carry no statuses array', () => {
    const inbound = {
      object: 'whatsapp_business_account',
      entry: [{ id: '123', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.X' }] } }] }],
    }
    expect(parseStatusPayload(inbound)).toEqual([])
  })

  it('survives a malformed payload rather than throwing', () => {
    expect(parseStatusPayload(null)).toEqual([])
    expect(parseStatusPayload({})).toEqual([])
    expect(parseStatusPayload({ entry: 'nonsense' })).toEqual([])
    expect(parseStatusPayload(payload([{ status: 'delivered' }]))).toEqual([])
  })

  it('drops a status whose value is not one Meta documents', () => {
    expect(parseStatusPayload(payload([{ id: wamid, status: 'warp', timestamp: '1758800000' }]))).toEqual([])
  })
})

describe('outranks', () => {
  it('lets delivery progress forwards', () => {
    expect(outranks('delivered', 'sent')).toBe(true)
    expect(outranks('read', 'delivered')).toBe(true)
  })

  it('refuses to move backwards, because Meta can deliver callbacks out of order', () => {
    expect(outranks('sent', 'delivered')).toBe(false)
    expect(outranks('delivered', 'read')).toBe(false)
  })

  it('treats a repeat of the same status as no change', () => {
    expect(outranks('delivered', 'delivered')).toBe(false)
  })

  it('accepts any status when none is recorded yet', () => {
    expect(outranks('sent', null)).toBe(true)
  })

  it('treats failed as terminal', () => {
    expect(outranks('failed', 'sent')).toBe(true)
    expect(outranks('sent', 'failed')).toBe(false)
    expect(outranks('delivered', 'failed')).toBe(false)
  })
})
