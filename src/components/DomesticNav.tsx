import { useCallback, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BottomSheet } from './BottomSheet'
import { HomeIcon, BoxIcon, TruckIcon, CalendarIcon, PlusIcon, ReturnIcon } from './icons'

const ACTIVE = '#2E8B57'
const INACTIVE = '#B0A594'

export function DomesticNav() {
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)

  const loadCount = useCallback(async () => {
    const { count } = await supabase
      .from('bill_lines')
      .select('id, products!inner(pending_delivery)', { count: 'exact', head: true })
      .eq('products.pending_delivery', true)
      .eq('delivered', false)
    setPendingCount(count ?? 0)
  }, [])

  useEffect(() => { loadCount() }, [loadCount])

  function go(path: string) {
    setSheetOpen(false)
    navigate(path)
  }

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-[#EBE1D1] bg-cream/[.92] px-1 pb-[10px] backdrop-blur-md"
        style={{ height: 72 }}
      >
        {/* Home */}
        <NavLink to="/domestic" end className="flex flex-1 flex-col items-center gap-[3px]">
          {({ isActive }) => (
            <>
              <HomeIcon size={24} color={isActive ? ACTIVE : INACTIVE} />
              <span className="text-[10.5px] font-bold" style={{ color: isActive ? ACTIVE : INACTIVE }}>Home</span>
            </>
          )}
        </NavLink>

        {/* Pending */}
        <NavLink to="/domestic/pending-deliveries" className="relative flex flex-1 flex-col items-center gap-[3px]">
          {({ isActive }) => (
            <>
              <div className="relative">
                <CalendarIcon size={24} color={isActive ? ACTIVE : INACTIVE} />
                {pendingCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#E67E22] px-[4px] text-[9px] font-bold text-white">
                    {pendingCount}
                  </span>
                )}
              </div>
              <span className="text-[10.5px] font-bold" style={{ color: isActive ? ACTIVE : INACTIVE }}>Pending</span>
            </>
          )}
        </NavLink>

        {/* + (Quick add) */}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Quick add"
            className="-mt-6 flex h-[54px] w-[54px] items-center justify-center rounded-[18px] bg-[#2E8B57] shadow-[0_12px_24px_-8px_rgba(46,139,87,0.7)]"
          >
            <PlusIcon size={28} color="#fff" strokeWidth={2.4} />
          </button>
        </div>

        {/* Purchases */}
        <NavLink to="/domestic/purchases" className="flex flex-1 flex-col items-center gap-[3px]">
          {({ isActive }) => (
            <>
              <TruckIcon size={24} color={isActive ? ACTIVE : INACTIVE} />
              <span className="text-[10.5px] font-bold" style={{ color: isActive ? ACTIVE : INACTIVE }}>Purchases</span>
            </>
          )}
        </NavLink>

        {/* Godown */}
        <NavLink to="/domestic/stock" className="flex flex-1 flex-col items-center gap-[3px]">
          {({ isActive }) => (
            <>
              <BoxIcon size={24} color={isActive ? ACTIVE : INACTIVE} />
              <span className="text-[10.5px] font-bold" style={{ color: isActive ? ACTIVE : INACTIVE }}>Godown</span>
            </>
          )}
        </NavLink>
      </nav>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} slideUp>
        <h2 className="mb-4 font-display text-[19px] font-bold text-ink">Quick add</h2>
        <div className="flex flex-col gap-[11px]">
          <button
            onClick={() => go('/domestic/bill')}
            className="flex items-center gap-[14px] rounded-2xl border border-[#EBE1D1] bg-white p-[15px] text-left"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]" style={{ backgroundColor: '#FBEDE4' }}>
              <PlusIcon size={22} color="#E4571B" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-ink">New sale</p>
              <p className="text-[12.5px] font-medium text-[#9A8F80]">Record cylinders sold</p>
            </div>
          </button>
          <button
            onClick={() => go('/domestic/return')}
            className="flex items-center gap-[14px] rounded-2xl border border-[#EBE1D1] bg-white p-[15px] text-left"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]" style={{ backgroundColor: '#EAF4EE' }}>
              <ReturnIcon size={22} color="#2E8B57" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-ink">Log return</p>
              <p className="text-[12.5px] font-medium text-[#9A8F80]">Items returned to godown</p>
            </div>
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
