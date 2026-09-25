import { normalizeIndianPhone } from './phone.ts'

export type RecipientResult =
  | { kind: 'send'; to: string; redirected: boolean }
  /** The customer's stored phone is not a usable Indian mobile number. */
  | { kind: 'invalid_phone' }
  /** A test override is configured but unusable. Deliberately blocks the send. */
  | { kind: 'invalid_test_override' }

/**
 * Decides which number a bill is actually sent to.
 *
 * When WHATSAPP_TEST_RECIPIENT is set, every bill goes there instead of to the
 * customer — the safety valve for testing against a live WhatsApp account
 * without messaging real customers.
 *
 * An override that is set but malformed FAILS THE SEND rather than falling back
 * to the customer's real number. Falling back would do the precise thing the
 * override exists to prevent, and a typo in an environment variable is exactly
 * when that would happen.
 */
export function resolveRecipient(
  customerPhone: string | null | undefined,
  testOverride: string | null | undefined,
): RecipientResult {
  const customerTo = normalizeIndianPhone(customerPhone)

  const override = testOverride?.trim()
  if (override) {
    const overrideTo = normalizeIndianPhone(override)
    if (!overrideTo) return { kind: 'invalid_test_override' }
    return { kind: 'send', to: overrideTo, redirected: true }
  }

  if (!customerTo) return { kind: 'invalid_phone' }
  return { kind: 'send', to: customerTo, redirected: false }
}
