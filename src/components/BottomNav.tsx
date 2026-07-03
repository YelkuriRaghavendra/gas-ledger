import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { QuickAddSheet } from './QuickAddSheet'

const leftTabs = [{ to: '/', label: 'Home' }, { to: '/customers', label: 'Customers' }]
const rightTabs = [{ to: '/activity', label: 'Activity' }, { to: '/account', label: 'Account' }]

export function BottomNav() {
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 flex items-center border-t border-ink/10 bg-white">
        {leftTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-accent' : 'text-muted'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => setQuickAddOpen(true)}
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-bold text-white shadow-lg"
          >
            +
          </button>
        </div>
        {rightTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-accent' : 'text-muted'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <QuickAddSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onNavigate={(path, state) => {
          setQuickAddOpen(false)
          navigate(path, { state })
        }}
      />
    </>
  )
}
