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
    delivery_status: null,
    delivery_updated_at: null,
    error_code: null,
    error_detail: null,
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

  // Before delivery reporting existed this returned { kind: 'sent' }, which
  // overstated what was known: Meta accepting a message is not the same as the
  // customer receiving it. A row with no webhook result yet is 'accepted'.
  it('shows accepted for a sent row the webhook has not reported on', () => {
    const s = send({ status: 'sent' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'accepted' })
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

  // Changed with delivery reporting: this row records that a send was skipped
  // because another was live. It carries no delivery result of its own, so it
  // cannot claim the message arrived.
  it('maps skipped/already_sent to accepted, not to a delivery claim', () => {
    const s = send({ status: 'skipped', reason: 'already_sent' })
    expect(getWhatsAppDisplayState(s, NOW)).toEqual({ kind: 'accepted' })
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

// Meta accepting a message and the message arriving are different events. The
// webhook reports the second one; `status: 'sent'` only ever meant the first.
describe('getWhatsAppDisplayState — delivery reporting', () => {
  it('reads as accepted, not delivered, while the webhook has said nothing', () => {
    expect(getWhatsAppDisplayState(send({ status: 'sent', delivery_status: null }), NOW))
      .toEqual({ kind: 'accepted' })
  })

  it('stays accepted when Meta has only confirmed it left', () => {
    expect(getWhatsAppDisplayState(send({ status: 'sent', delivery_status: 'sent' }), NOW))
      .toEqual({ kind: 'accepted' })
  })

  it('reports delivery once the phone has it', () => {
    expect(getWhatsAppDisplayState(send({ status: 'sent', delivery_status: 'delivered' }), NOW))
      .toEqual({ kind: 'delivered' })
  })

  it('reports a read message', () => {
    expect(getWhatsAppDisplayState(send({ status: 'sent', delivery_status: 'read' }), NOW))
      .toEqual({ kind: 'read' })
  })

  it('surfaces a delivery failure with Meta\'s own reason', () => {
    expect(
      getWhatsAppDisplayState(
        send({ status: 'sent', delivery_status: 'failed', error_code: 131049, error_detail: 'Not delivered: per-user cap' }),
        NOW,
      ),
    ).toEqual({ kind: 'undelivered', reason: 'Not delivered: per-user cap', code: 131049 })
  })

  it('still names the failure when Meta sent no detail', () => {
    expect(
      getWhatsAppDisplayState(send({ status: 'sent', delivery_status: 'failed', error_code: 470, error_detail: null }), NOW),
    ).toEqual({ kind: 'undelivered', reason: null, code: 470 })
  })

  it('lets a failed send outrank any delivery state, since it never reached Meta', () => {
    expect(getWhatsAppDisplayState(send({ status: 'failed', reason: 'timeout', delivery_status: null }), NOW))
      .toEqual({ kind: 'failed', reason: 'timeout' })
  })
})

// WHATSAPP_TEST_RECIPIENT redirects every bill to one test phone. The log
// records it as 'test_redirect' so the history cannot imply the customer was
// messaged when they were not.
describe('getWhatsAppDisplayState — test redirect', () => {
  it('never claims the customer was messaged', () => {
    expect(getWhatsAppDisplayState(send({ status: 'sent', reason: 'test_redirect' }), NOW))
      .toEqual({ kind: 'test_redirect' })
  })

  it('says so even once a delivery result arrives, because it was delivered elsewhere', () => {
    expect(
      getWhatsAppDisplayState(send({ status: 'sent', reason: 'test_redirect', delivery_status: 'delivered' }), NOW),
    ).toEqual({ kind: 'test_redirect' })
  })
})
