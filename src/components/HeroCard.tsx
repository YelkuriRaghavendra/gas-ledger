import type { ReactNode } from 'react'

export function HeroCard({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-inkSoft to-ink p-6 text-white shadow-float">
      {children}
    </div>
  )
}
