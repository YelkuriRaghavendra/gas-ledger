export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Returns a formatted "last updated" time only when the record was genuinely
// edited after creation. Null/invalid timestamps (never edited, or predating
// the updated_at column) and updates within ~1s of creation return undefined,
// so callers can hide the row instead of showing "Invalid Date".
export function formatUpdated(updatedIso: string | null | undefined, createdIso: string): string | undefined {
  if (!updatedIso) return undefined
  const u = new Date(updatedIso).getTime()
  if (Number.isNaN(u)) return undefined
  const c = new Date(createdIso).getTime()
  if (!Number.isNaN(c) && Math.abs(u - c) < 1000) return undefined
  return formatDate(updatedIso)
}

export function formatRelativeDate(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function dateInputValue(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayInputValue() {
  return dateInputValue(new Date().toISOString())
}

export function combineDateWithNow(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const now = new Date()
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString()
}
