import { Children, Fragment } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'

type HeroCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  /** Fill for the cylinder watermark; defaults to the commercial orange. */
  watermark?: string
}

/**
 * The shared, primary summary-card surface. Content stays page-specific; this
 * component owns the fixed visual format.
 */
export function HeroCard({
  children,
  className = '',
  watermark = 'rgba(228,87,27,.16)',
  ...props
}: HeroCardProps) {
  return (
    <div
      {...props}
      className={`relative min-h-[212px] overflow-hidden rounded-[26px] bg-gradient-to-br from-inkSoft to-ink text-white shadow-float ${className}`.trim()}
    >
      <svg
        aria-hidden="true"
        width="170"
        height="170"
        viewBox="0 0 24 24"
        fill={watermark}
        className="pointer-events-none absolute -bottom-12 -right-8"
      >
        <rect x="6" y="6" width="12" height="16.5" rx="5" />
        <rect x="8.6" y="3.6" width="6.8" height="2.6" rx="1.3" />
      </svg>
      {children}
    </div>
  )
}

type HeroCardStatsProps = {
  children: ReactNode
  className?: string
}

/** A consistent, side-by-side metric row for hero cards. */
export function HeroCardStats({ children, className = '' }: HeroCardStatsProps) {
  const stats = Children.toArray(children)

  return (
    <div className={`mt-[15px] flex items-center gap-5 ${className}`.trim()}>
      {stats.map((stat, index) => (
        <Fragment key={index}>
          {index > 0 && <div className="h-[26px] w-px bg-white/[.14]" />}
          {stat}
        </Fragment>
      ))}
    </div>
  )
}
