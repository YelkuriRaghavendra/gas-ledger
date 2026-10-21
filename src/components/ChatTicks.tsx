import type { WhatsAppDeliveryStatus } from '../types/db'

// WhatsApp's own delivery marks: one grey tick sent, two grey delivered,
// two blue read. A failed message gets a red exclamation instead.
export function ChatTicks({ status, size = 16 }: { status: WhatsAppDeliveryStatus | null; size?: number }) {
  if (status === 'failed') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label="Not delivered" role="img">
        <circle cx="8" cy="8" r="6.5" fill="#C23B22" />
        <rect x="7.2" y="4" width="1.6" height="5" rx="0.8" fill="#fff" />
        <circle cx="8" cy="11.2" r="0.95" fill="#fff" />
      </svg>
    )
  }
  const double = status === 'delivered' || status === 'read'
  const color = status === 'read' ? '#2F80C9' : '#9A8F80'
  const label = status === 'read' ? 'Read' : status === 'delivered' ? 'Delivered' : 'Sent'
  return (
    <svg width={size} height={size} viewBox="0 0 16 11" fill="none" aria-label={label} role="img">
      <path d="M11.07.65 4.88 8.6 2.1 5.82" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {double && <path d="M14.4.65 8.2 8.6l-.9-.9" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}
