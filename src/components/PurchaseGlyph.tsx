/** The supplier-crate mark used across the Purchases tab. */
export function PurchaseGlyph({ size = 18, color = '#E4571B' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7h18l-1.5 11a2 2 0 0 1-2 1.7H6.5a2 2 0 0 1-2-1.7Z" />
      <path d="M8 7V5a4 4 0 0 1 8 0v2" />
    </svg>
  )
}
