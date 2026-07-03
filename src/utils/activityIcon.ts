import type { TransactionType } from '../types/db'

export function getActivityIcon(type: TransactionType): string {
  if (type === 'sale') return '🔥'
  if (type === 'return') return '↩'
  return '₹'
}

export function getActivityTint(type: TransactionType): { bg: string; color: string } {
  if (type === 'sale') return { bg: '#FBEDE4', color: '#E4571B' }
  if (type === 'return') return { bg: '#EAF4EE', color: '#2E8B57' }
  return { bg: '#E8EEF6', color: '#3B6EA5' }
}
