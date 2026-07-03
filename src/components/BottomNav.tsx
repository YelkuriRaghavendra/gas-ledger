import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Home' },
  { to: '/customers', label: 'Customers' },
  { to: '/activity', label: 'Activity' },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex border-t border-ink/10 bg-white">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-accent' : 'text-ink/60'}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
