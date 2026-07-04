export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return true
  if (digits.length === 12 && digits.startsWith('91')) return true
  return false
}
