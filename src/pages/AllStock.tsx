import { useState } from 'react'
import { useGodownStock } from '../hooks/useGodownStock'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import type { GodownStock, Segment } from '../types/db'

// Cylinders track full (ready to sell) + empties (to return to plant).
function CylinderCard({ s }: { s: GodownStock }) {
  return (
    <div className="rounded-[18px] bg-surface p-[18px] shadow-card">
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
}

// Accessories/services carry stock only — no empties to return.
function AccessoryRows({ rows }: { rows: GodownStock[] }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-surface shadow-card">
      {rows.map((s, i) => (
        <div
          key={s.product_id}
          className={`flex w-full items-center justify-between px-[18px] py-[14px] ${i > 0 ? 'border-t border-[#F1E9DB]' : ''}`}
        >
          <span className="text-sm font-bold text-ink">{s.product_name}</span>
          <span className={`font-display text-[17px] font-bold ${s.full_cylinders < 0 ? 'text-red-600' : s.full_cylinders === 0 ? 'text-subtle' : 'text-[#2E8B57]'}`}>
            {s.full_cylinders} <span className="text-[11px] font-semibold text-subtle">{s.unit}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function SegmentBlock({ label, color, rows }: { label: string; color: string; rows: GodownStock[] }) {
  const cylinders = rows.filter((s) => s.kind === 'cylinder')
  const accessories = rows.filter((s) => s.kind === 'accessory')

  return (
    <div className="mb-8">
      <h2 className="mb-3 font-display text-[20px] font-bold tracking-[-0.3px]" style={{ color }}>
        {label}
      </h2>

      {rows.length === 0 ? (
        <p className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
          No products yet
        </p>
      ) : (
        <>
          {cylinders.length > 0 && (
            <>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Cylinders</h3>
              <div className="mb-4 grid grid-cols-1 gap-3">
                {cylinders.map((s) => (
                  <CylinderCard key={s.product_id} s={s} />
                ))}
              </div>
            </>
          )}
          {accessories.length > 0 && (
            <>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Accessories</h3>
              <AccessoryRows rows={accessories} />
            </>
          )}
        </>
      )}
    </div>
  )
}

export function AllStock() {
  const { data: stock, loading } = useGodownStock('all')
  const [accountOpen, setAccountOpen] = useState(false)

  const bySegment = (segment: Segment) => stock.filter((s) => s.segment === segment)

  return (
    <div className="pb-[110px]">
      <AppHeader view="stock" title="Stock" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="p-5 pt-1">
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            <SegmentBlock label="Commercial" color="#E4571B" rows={bySegment('commercial')} />
            <SegmentBlock label="Domestic" color="#2E8B57" rows={bySegment('domestic')} />
          </>
        )}
      </div>
    </div>
  )
}
