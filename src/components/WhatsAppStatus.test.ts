import { describe, it, expect } from 'vitest'
import { getWhatsAppDisplayState, STALE_PENDING_MS } from './WhatsAppStatus'
import type { WhatsAppSend } from '../types/db'

const NOW = new Date('2026-09-13T12:00:00.000Z').getTime()

function send(overrides: Partial<WhatsAppSend>): WhatsAppSend {
  return {
    id: 1,
    bill_id: 10,
    status: 'sent',
    reason: null,
    message_id: null,
    template: 'bill_created',
    created_at: new Date(NOW).toISOString(),
    ...overrides,
  }
}

describe('getWhatsAppDisplayState', () => {
  it('shows nothing when there is no send row', () => {
    expect(getWhatsAppDisplayState(undefined, NOW)).toEqual({ kind: 'none' })
  })

  it('treats a fresh pending row as sending', () => {
    const s = send({ status: 'pending', created_at: new Date(NOW - 1000).toISOString() })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'sending' })
  })

  it('treats a pending row right at the staleness threshold as sending', () => {
    const s = send({ status: 'pending', created_at: new Date(NOW - (STALE_PENDING_MS - 1)).toISOString() })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'sending' })
  })

  it('treats a pending row older than the staleness threshold as stale, not hidden', () => {
    const s = send({ status: 'pending', created_at: new Date(NOW - (STALE_PENDING_MS + 1)).toISOString() })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'stale' })
  })

  it('shows sent for a sent row', () => {
    const s = send({ status: 'sent' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'sent' })
  })

  it('shows failed with its reason for a failed row', () => {
    const s = send({ status: 'failed', reason: 'meta_error' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'failed', reason: 'meta_error' })
  })

  it('shows failed with a null reason as unknown error at render time', () => {
    const s = send({ status: 'failed', reason: null })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'failed', reason: null })
  })

  it('maps skipped/disabled to disabled', () => {
    const s = send({ status: 'skipped', reason: 'disabled' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'disabled' })
  })

  it('maps skipped/no_phone to no_phone', () => {
    const s = send({ status: 'skipped', reason: 'no_phone' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'no_phone' })
  })

  it('maps skipped/invalid_phone to invalid_phone', () => {
    const s = send({ status: 'skipped', reason: 'invalid_phone' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'invalid_phone' })
  })

  it('maps skipped/already_sent to sent, not an error', () => {
    const s = send({ status: 'skipped', reason: 'already_sent' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'sent' })
  })

  it('shows nothing for skipped/not_applicable', () => {
    const s = send({ status: 'skipped', reason: 'not_applicable' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'none' })
  })

  it('shows nothing for skipped/no_customer', () => {
    const s = send({ status: 'skipped', reason: 'no_customer' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'none' })
  })
})
