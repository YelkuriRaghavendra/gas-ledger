import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { QuickAddSheet } from './QuickAddSheet'
import { HomeIcon, UsersIcon, ActivityIcon, AccountIcon, PlusIcon } from './icons'

const ACTIVE = '#E4571B'
const INACTIVE = '#B0A594'

const leftTabs = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/customers', label: 'Customers', Icon: UsersIcon, end: false },
]
const rightTabs = [
  { to: '/activity', label: 'Activity', Icon: ActivityIcon, end: false },
  { to: '/account', label: 'Account', Icon: AccountIcon, end: false },
]

export function BottomNav() {
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-[#EBE1D1] bg-cream/[.92] px-2 pb-[14px] backdrop-blur-md"
        style={{ height: 80 }}
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
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-[20px] bg-accent shadow-[0_12px_24px_-8px_rgba(228,87,27,0.7)]"
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
        onNavigate={(path) => {
          setQuickAddOpen(false)
          navigate(path)
        }}
      />
    </>
  )
}
