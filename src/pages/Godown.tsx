import { Link } from 'react-router-dom'
import { useGodownStock } from '../hooks/useGodownStock'
import { useEmptiesNetRate } from '../hooks/useEmptiesNetRate'
import { usePurchases } from '../hooks/usePurchases'
import { predictDaysUntilFull } from '../utils/godownPrediction'
import { ChevronLeftIcon } from '../components/icons'

export function Godown() {
  const { data: stock, loading } = useGodownStock()
  const { data: rates } = useEmptiesNetRate()
  const { data: purchases } = usePurchases()
  const hasAdjustment = purchases.some((p) => p.note === 'Opening stock adjustment')

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to="/account" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[22px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Godown inventory</h1>

      {!hasAdjustment && (
        <Link
          to="/godown/set-stock"
          className="mb-4 flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-accent bg-[#FBEDE4] text-[14px] font-bold text-accent"
        >
          Set current stock
        </Link>
      )}

      <div className="grid grid-cols-1 gap-3">
        {stock.map((s) => {
          const netRate = rates.find((r) => r.product_id === s.product_id)?.net_rate_per_day ?? 0
          const prediction =
            s.godown_capacity !== null ? predictDaysUntilFull(s.godown_capacity, s.empty_cylinders, netRate) : null

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

              {prediction && (
                <div className="mt-4 border-t border-borderMuted pt-3">
                  {prediction.kind === 'not_approaching' && (
                    <p className="text-[13px] font-semibold text-subtle">Not approaching capacity</p>
                  )}
                  {prediction.kind === 'at_capacity' && (
                    <p className="text-[13px] font-bold text-[#C23B22]">Godown is already at or over capacity</p>
                  )}
                  {prediction.kind === 'days_until_full' && (
                    <p className="text-[13px] font-semibold text-muted">
                      <span className="font-display font-bold text-accent">~{prediction.days} days</span> until full at current pace
                    </p>
                  )}
                </div>
              )}
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
  )
}
