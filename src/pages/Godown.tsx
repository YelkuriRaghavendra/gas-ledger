import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGodownStock } from '../hooks/useGodownStock'
import { usePurchaseOrders } from '../hooks/usePurchaseOrders'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'

export function Godown() {
  const { data: stock, loading } = useGodownStock('all')
  const { data: purchaseOrders } = usePurchaseOrders()
  const [accountOpen, setAccountOpen] = useState(false)
  const hasAdjustment = purchaseOrders.some((p) => p.type === 'opening')

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="pb-[110px]">
      <AppHeader view="commercial" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="p-5 pt-1">
        <h1 className="mb-[22px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Godown inventory</h1>

        {!hasAdjustment && (
          <Link
            to="/commercial/godown/set-stock"
            className="mb-4 flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-accent bg-[#FBEDE4] text-[14px] font-bold text-accent"
          >
            Set current stock
          </Link>
        )}

        <div className="grid grid-cols-1 gap-3">
          {stock.map((s) => {
            return (
              <div key={s.product_id} className="rounded-[18px] bg-surface p-[18px] shadow-card">
                <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
                  {s.product_name}
                </span>
                <div className="mt-4 flex items-stretch">
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-subtle">Full</p>
                    <p className={`mt-[3px] font-display text-[30px] font-bold leading-none ${s.full_cylinders < 0 ? 'text-red-600' : 'text-ink'}`}>
                      {s.full_cylinders}
                    </p>
                    <p className="mt-[3px] text-[11px] font-semibold text-subtle">ready to sell</p>
                  </div>
                  <div className="mx-2 w-px bg-borderMuted" />
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-subtle">Empty</p>
                    <p className={`mt-[3px] font-display text-[30px] font-bold leading-none ${s.empty_cylinders < 0 ? 'text-red-600' : 'text-[#2E8B57]'}`}>
                      {s.empty_cylinders}
                    </p>
                    <p className="mt-[3px] text-[11px] font-semibold text-subtle">to return to plant</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {stock.length === 0 && (
          <p className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
            No products yet
          </p>
        )}
      </div>
    </div>
  )
}
