import { NavLink, useNavigate } from 'react-router-dom'
import { HomeIcon, BoxIcon, TruckIcon, CalendarIcon, PlusIcon } from './icons'

const ACTIVE = '#2E8B57'
const INACTIVE = '#B0A594'

const leftTabs = [
  { to: '/domestic', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/domestic/stock', label: 'Stock', Icon: BoxIcon, end: false },
]
const rightTabs = [
  { to: '/domestic/purchases', label: 'Purchases', Icon: TruckIcon, end: false },
  { to: '/domestic/history', label: 'History', Icon: CalendarIcon, end: false },
]

export function DomesticNav() {
  const navigate = useNavigate()

  return (
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
          onClick={() => navigate('/domestic/bill')}
          aria-label="New bill"
          className="-mt-6 flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#2E8B57] shadow-[0_12px_24px_-8px_rgba(46,139,87,0.7)]"
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
  )
}
