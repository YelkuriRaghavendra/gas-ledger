import { Link } from 'react-router-dom'
import { useGodownStock } from '../../hooks/useGodownStock'
import { TruckIcon } from '../../components/icons'

export function DomesticStock() {
  const { data: stock, loading, error } = useGodownStock('domestic')

  const cylinders = stock.filter((s) => s.kind === 'cylinder')
  const accessories = stock.filter((s) => s.kind === 'accessory')

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-5 pb-[110px] pt-3">
      <div className="mb-[22px] flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Stock</h1>
        <div className="flex items-center gap-3">
          <Link to="/domestic/combos" className="text-[13px] font-bold text-[#2E8B57]">
            Combos ›
          </Link>
          <Link
            to="/domestic/purchases/new"
            className="flex items-center gap-2 rounded-[13px] bg-[#2E8B57] px-[14px] py-[9px] text-[13px] font-bold text-white shadow-[0_8px_18px_-8px_rgba(46,139,87,0.7)]"
          >
            <TruckIcon size={16} color="#fff" strokeWidth={2.2} /> Stock in
          </Link>
        </div>
      </div>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      <h2 className="mb-3 font-display text-[16px] font-bold tracking-[-0.3px] text-ink">Cylinders</h2>
      <div className="grid grid-cols-1 gap-3">
        {cylinders.map((s) => (
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
        ))}
        {cylinders.length === 0 && (
          <p className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
            No cylinder products yet
          </p>
        )}
      </div>

      <h2 className="mb-3 mt-6 font-display text-[16px] font-bold tracking-[-0.3px] text-ink">Accessories</h2>
      <div className="overflow-hidden rounded-[18px] bg-surface shadow-card">
        {accessories.map((s, i) => (
          <div
            key={s.product_id}
            className={`flex items-center justify-between px-[18px] py-[14px] ${i > 0 ? 'border-t border-[#F1E9DB]' : ''}`}
          >
            <p className="text-sm font-bold text-ink">{s.product_name}</p>
            <p className={`font-display text-[17px] font-bold ${s.full_cylinders < 0 ? 'text-red-600' : s.full_cylinders === 0 ? 'text-subtle' : 'text-[#2E8B57]'}`}>
              {s.full_cylinders} <span className="text-[11px] font-semibold text-subtle">{s.unit}</span>
            </p>
          </div>
        ))}
        {accessories.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-medium text-subtle">No accessory products yet</p>
        )}
      </div>
    </div>
  )
}
