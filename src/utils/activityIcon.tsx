import type { ReactNode } from 'react'
import type { TransactionType } from '../types/db'

// A gas cylinder that inherits the surrounding tint colour via currentColor.
function CylinderGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="8.6" y="3.6" width="6.8" height="2.6" rx="1.3" />
      <rect x="6" y="6" width="12" height="16.5" rx="5" />
    </svg>
  )
}

export function getActivityIcon(type: TransactionType | 'purchase'): ReactNode {
  if (type === 'sale') return <CylinderGlyph />
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
