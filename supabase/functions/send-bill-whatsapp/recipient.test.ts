import { describe, it, expect } from 'vitest'
import { resolveRecipient } from './recipient'

describe('resolveRecipient', () => {
  it('sends to the customer when no override is configured', () => {
    expect(resolveRecipient('9642999196', undefined)).toEqual({ kind: 'send', to: '919642999196', redirected: false })
    expect(resolveRecipient('9642999196', null)).toEqual({ kind: 'send', to: '919642999196', redirected: false })
    expect(resolveRecipient('9642999196', '')).toEqual({ kind: 'send', to: '919642999196', redirected: false })
    expect(resolveRecipient('9642999196', '   ')).toEqual({ kind: 'send', to: '919642999196', redirected: false })
  })

  it('redirects every bill to the override when one is set', () => {
    expect(resolveRecipient('9642999196', '9876543210')).toEqual({ kind: 'send', to: '919876543210', redirected: true })
  })

  it('normalizes the override the same way as a customer number', () => {
    expect(resolveRecipient('9642999196', '+91 98765-43210')).toEqual({ kind: 'send', to: '919876543210', redirected: true })
    expect(resolveRecipient('9642999196', '09876543210')).toEqual({ kind: 'send', to: '919876543210', redirected: true })
  })

  it('redirects even when the customer has no usable number at all', () => {
    // The point of the override is that the customer's number is never dialled.
    expect(resolveRecipient(null, '9876543210')).toEqual({ kind: 'send', to: '919876543210', redirected: true })
    expect(resolveRecipient('nonsense', '9876543210')).toEqual({ kind: 'send', to: '919876543210', redirected: true })
  })

  // The whole reason the override exists is to keep real customers out of
  // testing. Falling back to the customer on a malformed override would do
  // exactly the thing it was set to prevent.
  it('refuses to send rather than falling back when the override is malformed', () => {
    expect(resolveRecipient('9642999196', '123')).toEqual({ kind: 'invalid_test_override' })
    expect(resolveRecipient('9642999196', 'not-a-number')).toEqual({ kind: 'invalid_test_override' })
    expect(resolveRecipient('9642999196', '15551234567')).toEqual({ kind: 'invalid_test_override' })
  })

  it('reports an unusable customer number when no override is set', () => {
    expect(resolveRecipient(null, undefined)).toEqual({ kind: 'invalid_phone' })
    expect(resolveRecipient('123', undefined)).toEqual({ kind: 'invalid_phone' })
  })
})
