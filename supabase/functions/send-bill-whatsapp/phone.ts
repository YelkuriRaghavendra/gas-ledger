/**
 * Normalize a stored customer phone number to the digits-only E.164 form
 * the WhatsApp Cloud API expects (country code, no '+', no separators).
 *
 * The stored value in `customers.phone` is free text and is never rewritten —
 * normalization happens only at send time.
 *
 * Returns null when the input cannot be a valid Indian mobile number, which
 * the caller records as `invalid_phone`.
 */
export function normalizeIndianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return null

  // 0XXXXXXXXXX — trunk prefix used when dialling domestically.
  const withoutTrunk = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits

  if (withoutTrunk.length === 10) {
    return isIndianMobile(withoutTrunk) ? `91${withoutTrunk}` : null
  }

  if (withoutTrunk.length === 12 && withoutTrunk.startsWith('91')) {
    const local = withoutTrunk.slice(2)
    return isIndianMobile(local) ? withoutTrunk : null
  }

  return null
}

/** Indian mobile numbers are 10 digits beginning 6, 7, 8 or 9. */
function isIndianMobile(local: string): boolean {
  return /^[6-9]\d{9}$/.test(local)
}
