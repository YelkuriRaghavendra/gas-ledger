import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useGodownStock } from '../../hooks/useGodownStock'
import { useProducts } from '../../hooks/useProducts'
import { TruckIcon, PlusIcon } from '../../components/icons'
import { AppHeader } from '../../components/AppHeader'
import { AccountMenu } from '../../components/AccountMenu'
import { BottomSheet } from '../../components/BottomSheet'
import type { Product, ProductKind } from '../../types/db'

export function DomesticStock() {
  const navigate = useNavigate()
  const [accountOpen, setAccountOpen] = useState(false)
  const { data: stock, loading, error, refresh: refreshStock } = useGodownStock('domestic')
  const { data: products, refresh: refreshProducts } = useProducts('domestic')

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ProductKind>('accessory')
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState('')
  const [unit, setUnit] = useState('pc')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setKind('accessory')
    setPrice('')
    setCapacity('')
    setUnit('pc')
    setFormError(null)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setFormError(null)
    const maxSort = products.reduce((m, p) => Math.max(m, p.sort_order), 0)
    const payload: Record<string, unknown> = {
      name: trimmed,
      price: Number(price || 0),
      segment: 'domestic',
      kind,
      unit: unit.trim() || 'pc',
      sort_order: maxSort + 1,
    }
    if (kind === 'cylinder' && capacity.trim()) payload.godown_capacity = Number(capacity)
    const { data: created, error: insError } = await supabase.from('products').insert(payload).select().single()
    setSaving(false)
    if (insError) {
      setFormError(insError.message)
      return
    }
    setAdding(false)
    resetForm()
    if (kind === 'service') {
      // A combo needs its components chosen — hand off to the Combos editor.
      navigate('/domestic/combos', { state: { editProductId: (created as Product).id } })
      return
    }
    await refreshProducts()
    refreshStock()
  }

  const cylinders = stock.filter((s) => s.kind === 'cylinder')
  const accessories = stock.filter((s) => s.kind === 'accessory')

  return (
    <div className="pb-[110px]">
      <AppHeader segment="domestic" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="p-5 pt-1">
      <div className="mb-[22px] flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Stock</h1>
        <div className="flex items-center gap-3">
          <Link to="/domestic/combos" className="text-[13px] font-bold text-[#2E8B57]">
            Combos ›
          </Link>
          <button
            type="button"
            onClick={() => {
              resetForm()
              setAdding(true)
            }}
            className="flex items-center gap-1 rounded-[13px] border-[1.5px] border-[#2E8B57] px-[12px] py-[8px] text-[13px] font-bold text-[#2E8B57]"
          >
            <PlusIcon size={15} strokeWidth={2.4} color="#2E8B57" /> Add item
          </button>
          <Link
            to="/domestic/purchases/new"
            className="flex items-center gap-2 rounded-[13px] bg-[#2E8B57] px-[14px] py-[9px] text-[13px] font-bold text-white shadow-[0_8px_18px_-8px_rgba(46,139,87,0.7)]"
          >
            <TruckIcon size={16} color="#fff" strokeWidth={2.2} /> Stock in
          </Link>
        </div>
      </div>

      {loading && <p className="mb-4 text-muted">Loading…</p>}
      {error && <p className="mb-4 text-red-600">{error}</p>}

      {!loading && (
        <>
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
        </>
      )}
      </div>

      <BottomSheet open={adding} onClose={() => setAdding(false)} slideUp>
        <form onSubmit={handleAdd}>
          <h2 className="mb-4 font-display text-[19px] font-bold text-ink">Add item</h2>

          <div className="mb-3">
            <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Name</p>
            <input
              required
              autoFocus
              placeholder="e.g. Suraksha Gas Pipe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink"
            />
          </div>

          <div className="mb-3">
            <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Type</p>
            <div className="flex gap-2">
              {([
                { k: 'cylinder' as ProductKind, label: 'Cylinder' },
                { k: 'accessory' as ProductKind, label: 'Accessory' },
                { k: 'service' as ProductKind, label: 'Combo' },
              ]).map(({ k, label }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 rounded-[12px] py-[11px] text-[13.5px] font-bold transition ${
                    kind === k ? 'bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] text-white shadow-[0_8px_18px_-8px_rgba(46,139,87,0.7)]' : 'bg-cream text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex gap-3">
            <div className="flex-1">
              <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Price (₹)</p>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink"
              />
            </div>
            <div className="w-[110px]">
              <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Unit</p>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink"
              />
            </div>
          </div>

          {kind === 'cylinder' && (
            <div className="mb-1">
              <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Godown capacity (optional)</p>
              <input
                type="number"
                min="0"
                placeholder="e.g. 300"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink"
              />
            </div>
          )}

          {kind === 'service' && (
            <p className="mb-1 text-[12px] font-semibold text-subtle">
              You'll pick which items this combo includes on the next screen.
            </p>
          )}

          {formError && <p className="mt-3 text-sm font-semibold text-red-600">{formError}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-4 h-[50px] w-full rounded-[14px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] font-bold text-white shadow-[0_12px_26px_-10px_rgba(46,139,87,0.65)] transition active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? 'Adding…' : kind === 'service' ? 'Create & choose items' : 'Add item'}
          </button>
        </form>
      </BottomSheet>
    </div>
  )
}
