export function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length === 10
}

export function sanitizePhoneInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10)
}
