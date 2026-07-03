export function CylinderIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <rect x="10" y="1.5" width="4" height="2.4" rx="1" />
      <rect x="8.6" y="3.6" width="6.8" height="2.6" rx="1.3" />
      <rect x="6" y="6" width="12" height="16.5" rx="5" />
      <rect x="8.5" y="9.5" width="7" height="1.8" rx=".9" fill="#E4571B" opacity=".9" />
    </svg>
  )
}
