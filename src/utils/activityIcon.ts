import type { TransactionType } from '../types/db'

export function getActivityIcon(type: TransactionType): string {
  if (type === 'sale') return '🔥'
  if (type === 'return') return '↩️'
  return '💳'
}
