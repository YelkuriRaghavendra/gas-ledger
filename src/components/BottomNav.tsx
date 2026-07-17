import { useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { QuickAddSheet } from './QuickAddSheet'
import { HomeIcon, UsersIcon, TruckIcon, ActivityIcon, PlusIcon } from './icons'

const ACTIVE = '#E4571B'
const INACTIVE = '#B0A594'

const leftTabs = [
  { to: '/commercial', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/commercial/customers', label: 'Customers', Icon: UsersIcon, end: false },
]
const rightTabs = [
  { to: '/commercial/purchases', label: 'Purchases', Icon: TruckIcon, end: false },
  { to: '/commercial/activity', label: 'Activity', Icon: ActivityIcon, end: false },
]

export function BottomNav() {
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const customerId = useMemo(() => {
    const match = location.pathname.match(/^\/commercial\/customers\/(\d+)$/)
    return match ? Number(match[1]) : undefined
  }, [location.pathname])

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-[#EBE1D1] bg-cream/[.92] px-1 pb-[10px] backdrop-blur-md"
        style={{ height: 72 }}
      >
        {leftTabs.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="flex flex-1 flex-col items-center gap-[3px]">
            {({ isActive }) => (
              <>
                <Icon size={24} color={isActive ? ACTIVE : INACTIVE} />
                <span className="text-[10.5px] font-bold" style={{ color: isActive ? ACTIVE : INACTIVE }}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => setQuickAddOpen(true)}
            aria-label="Quick add"
            className="-mt-6 flex h-[54px] w-[54px] items-center justify-center rounded-[18px] bg-accent shadow-[0_12px_24px_-8px_rgba(228,87,27,0.7)]"
          >
            <PlusIcon size={28} color="#fff" strokeWidth={2.4} />
          </button>
        </div>
        {rightTabs.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="flex flex-1 flex-col items-center gap-[3px]">
            {({ isActive }) => (
              <>
                <Icon size={24} color={isActive ? ACTIVE : INACTIVE} />
                <span className="text-[10.5px] font-bold" style={{ color: isActive ? ACTIVE : INACTIVE }}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <QuickAddSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        customerId={customerId}
        onNavigate={(path) => {
          setQuickAddOpen(false)
          navigate(path)
        }}
      />
    </>
  )
}
