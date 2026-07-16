import type { TransactionType } from '../types/db'

export function getActivityIcon(type: TransactionType | 'purchase'): string {
  if (type === 'sale') return '🔥'
  if (type === 'return') return '↩'
  if (type === 'purchase') return '🚚'
  return '₹'
}

export function getActivityTint(type: TransactionType | 'purchase'): { bg: string; color: string } {
  if (type === 'sale') return { bg: '#FBEDE4', color: '#E4571B' }
  if (type === 'return') return { bg: '#EAF4EE', color: '#2E8B57' }
  if (type === 'purchase') return { bg: '#FDE7C9', color: '#B26A00' }
  return { bg: '#E8EEF6', color: '#3B6EA5' }
}
