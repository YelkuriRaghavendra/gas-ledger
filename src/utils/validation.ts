export function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length === 10
}

export function sanitizePhoneInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10)
}

export interface CustomerDetails {
  name: string
  phone: string
  address: string
}

/**
 * All three are required on a commercial customer: the name is how every other
 * screen refers to them, the mobile number is what bills are sent to, and the
 * location is what the delivery round is planned from. A customer missing any
 * of them costs somebody a phone call later.
 *
 * Returns the first problem in the order the form asks, so the message always
 * points at the field the eye is already nearest, or null when the details are
 * complete.
 */
export function validateCustomerDetails({ name, phone, address }: CustomerDetails): string | null {
  if (!name.trim()) return 'Enter a name'
  if (!isValidPhone(phone)) return 'Enter a 10-digit mobile number'
  if (!address.trim()) return 'Enter a location'
  return null
}
