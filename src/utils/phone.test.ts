import { describe, it, expect } from 'vitest'
import { normalizeIndianPhone } from './phone'

describe('normalizeIndianPhone', () => {
  it('prefixes a bare 10-digit mobile with the country code', () => {
    expect(normalizeIndianPhone('9876543210')).toBe('919876543210')
  })

  it('accepts a +91 prefixed number', () => {
    expect(normalizeIndianPhone('+919876543210')).toBe('919876543210')
  })

  it('strips spaces, hyphens and parentheses', () => {
    expect(normalizeIndianPhone('+91 98765-43210')).toBe('919876543210')
    expect(normalizeIndianPhone('(098765) 43210')).toBe('919876543210')
  })

  it('accepts a 12-digit number already starting with 91', () => {
    expect(normalizeIndianPhone('919876543210')).toBe('919876543210')
  })

  it('strips a leading 0 before a 10-digit mobile', () => {
    expect(normalizeIndianPhone('09876543210')).toBe('919876543210')
  })

  it('rejects a landline that is too short', () => {
    expect(normalizeIndianPhone('08662345')).toBeNull()
  })

  it('rejects null, undefined and empty input', () => {
    expect(normalizeIndianPhone(null)).toBeNull()
    expect(normalizeIndianPhone(undefined)).toBeNull()
    expect(normalizeIndianPhone('')).toBeNull()
    expect(normalizeIndianPhone('   ')).toBeNull()
  })

  it('rejects junk and overlong input', () => {
    expect(normalizeIndianPhone('not a phone')).toBeNull()
    expect(normalizeIndianPhone('9198765432109999')).toBeNull()
  })

  it('rejects a 10-digit number that cannot be an Indian mobile', () => {
    // Indian mobile numbers start with 6-9.
    expect(normalizeIndianPhone('1234567890')).toBeNull()
  })
})
