import { Link } from 'react-router-dom'
import { useGodownStock } from '../hooks/useGodownStock'
import { useEmptiesNetRate } from '../hooks/useEmptiesNetRate'
import { predictDaysUntilFull } from '../utils/godownPrediction'
import { HeroCard } from '../components/HeroCard'
import { ChevronLeftIcon } from '../components/icons'

function figureClass(value: number) {
  return value < 0 ? 'text-red-600' : 'text-white'
}

export function Godown() {
  const { data: stock, loading } = useGodownStock()
  const { data: rates } = useEmptiesNetRate()

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-5 pb-10 pt-2">
      <Link to="/account" className="mb-[10px] inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[22px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">Godown inventory</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {stock.map((s) => {
          const netRate = rates.find((r) => r.product_id === s.product_id)?.net_rate_per_day ?? 0
          const prediction =
            s.godown_capacity !== null ? predictDaysUntilFull(s.godown_capacity, s.empty_cylinders, netRate) : null

          return (
            <HeroCard key={s.product_id}>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.5px] text-mutedOnDark">{s.product_name}</p>
              <div className="flex items-center gap-[10px]">
                <div className="flex-1 text-center">
                  <p className={`font-display text-[26px] font-bold ${figureClass(s.full_cylinders)}`}>{s.full_cylinders}</p>
                  <p className="mt-[2px] text-[11px] font-semibold text-mutedOnDark">Full cylinders</p>
                </div>
                <div className="flex-1 rounded-[13px] bg-accent/[.18] px-1 py-2 text-center">
                  <p className={`font-display text-[26px] font-bold ${s.empty_cylinders < 0 ? 'text-red-600' : 'text-[#FF8A4C]'}`}>
                    {s.empty_cylinders}
                  </p>
                  <p className="mt-[2px] text-[11px] font-bold text-[#FF8A4C]/[.85]">Empty cylinders</p>
                </div>
              </div>

              {prediction && (
                <div className="mt-4 border-t border-white/10 pt-3">
                  {prediction.kind === 'not_approaching' && (
                    <p className="text-[13px] font-semibold text-mutedOnDark">Not approaching capacity</p>
                  )}
                  {prediction.kind === 'at_capacity' && (
                    <p className="text-[13px] font-bold text-red-600">Godown is already at or over capacity</p>
                  )}
                  {prediction.kind === 'days_until_full' && (
                    <p className="text-[13px] font-semibold text-mutedOnDark">
                      <span className="font-display font-bold text-accent">~{prediction.days} days</span> until full at
                      current pace
                    </p>
                  )}
                </div>
              )}
            </HeroCard>
          )
        })}
      </div>
      {stock.length === 0 && <p className="text-muted">No products yet.</p>}
    </div>
  )
}
