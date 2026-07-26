import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useGodownStock } from '../hooks/useGodownStock'
import { useProducts } from '../hooks/useProducts'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { BottomSheet } from '../components/BottomSheet'
import { PriceOptionsEditor } from '../components/PriceOptionsEditor'
import { PlusIcon } from '../components/icons'
import type { GodownStock, Product, PriceOption, ProductKind, Segment } from '../types/db'

const cleanOptions = (opts: PriceOption[]) => opts.filter((o) => o.amount > 0)

function CylinderCard({ s, onEdit }: { s: GodownStock; onEdit: (id: number) => void }) {
  return (
    <div className="rounded-[18px] bg-surface p-[18px] shadow-card">
      <div className="flex items-center justify-between">
        <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
          {s.product_name}
        </span>
        <button type="button" onClick={() => onEdit(s.product_id)} className="text-[12px] font-bold text-accent">
          Edit
        </button>
      </div>
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

function AccessoryRows({ rows, onEdit }: { rows: GodownStock[]; onEdit: (id: number) => void }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-surface shadow-card">
      {rows.map((s, i) => (
        <button
          key={s.product_id}
          type="button"
          onClick={() => onEdit(s.product_id)}
          className={`flex w-full items-center justify-between px-[18px] py-[14px] text-left transition active:bg-cream ${i > 0 ? 'border-t border-[#F1E9DB]' : ''}`}
        >
          <span className="text-sm font-bold text-ink">{s.product_name}</span>
          <span className="flex items-center gap-3">
            <span className={`font-display text-[17px] font-bold ${s.full_cylinders < 0 ? 'text-red-600' : s.full_cylinders === 0 ? 'text-subtle' : 'text-[#2E8B57]'}`}>
              {s.full_cylinders} <span className="text-[11px] font-semibold text-subtle">{s.unit}</span>
            </span>
            <span className="text-[12px] font-bold text-accent">Edit</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function SegmentBlock({ label, color, segment, rows, onEdit, onAdd }: {
  label: string; color: string; segment: Segment; rows: GodownStock[];
  onEdit: (id: number) => void; onAdd: (segment: Segment) => void
}) {
  const cylinders = rows.filter((s) => s.kind === 'cylinder')
  const accessories = rows.filter((s) => s.kind === 'accessory')

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[20px] font-bold tracking-[-0.3px]" style={{ color }}>
          {label}
        </h2>
        <div className="flex items-center gap-2">
          {segment === 'domestic' && (
            <Link
              to="/domestic/combos"
              className="flex items-center rounded-[13px] border-[1.5px] px-[12px] py-[8px] text-[13px] font-bold"
              style={{ borderColor: color, color }}
            >
              Combos
            </Link>
          )}
          <button
            type="button"
            onClick={() => onAdd(segment)}
            className="flex items-center gap-1 rounded-[13px] border-[1.5px] px-[12px] py-[8px] text-[13px] font-bold"
            style={{ borderColor: color, color }}
          >
            <PlusIcon size={15} strokeWidth={2.4} color={color} /> Add item
          </button>
        </div>
      </div>

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
                  <CylinderCard key={s.product_id} s={s} onEdit={onEdit} />
                ))}
              </div>
            </>
          )}
          {accessories.length > 0 && (
            <>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Accessories</h3>
              <AccessoryRows rows={accessories} onEdit={onEdit} />
            </>
          )}
        </>
      )}
    </div>
  )
}

export function AllStock() {
  const navigate = useNavigate()
  const { data: stock, loading, refresh: refreshStock } = useGodownStock('all')
  const { data: commercialProducts, refresh: refreshCommercial } = useProducts('commercial')
  const { data: domesticProducts, refresh: refreshDomestic } = useProducts('domestic')
  const [accountOpen, setAccountOpen] = useState(false)

  const allProducts = [...commercialProducts, ...domesticProducts]
  const productById = new Map<number, Product>(allProducts.map((p) => [p.id, p]))

  const refreshAll = async () => {
    await refreshCommercial()
    await refreshDomestic()
    refreshStock()
  }

  // --- Edit ---
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editPriceOptions, setEditPriceOptions] = useState<PriceOption[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function openEdit(productId: number) {
    const p = productById.get(productId)
    if (!p) return
    setEditName(p.name)
    setEditPrice(String(p.price))
    setEditPriceOptions(p.price_options ?? [])
    setEditError(null)
    setEditingProduct(p)
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault()
    if (!editingProduct) return
    const trimmed = editName.trim()
    if (!trimmed) return
    setEditSaving(true)
    setEditError(null)
    const { error: updError } = await supabase
      .from('products')
      .update({
        name: trimmed,
        price: Number(editPrice || 0),
        price_options: editingProduct.kind === 'service' ? [] : cleanOptions(editPriceOptions),
      })
      .eq('id', editingProduct.id)
    setEditSaving(false)
    if (updError) {
      setEditError(updError.message)
      return
    }
    setEditingProduct(null)
    await refreshAll()
  }

  async function handleEditDelete() {
    if (!editingProduct) return
    if (!confirm(`Remove "${editingProduct.name}"? It disappears from stock and billing.`)) return
    setEditSaving(true)
    setEditError(null)
    const { error: delError } = await supabase.from('products').delete().eq('id', editingProduct.id)
    if (delError) {
      const { error: updError } = await supabase.from('products').update({ active: false }).eq('id', editingProduct.id)
      if (updError) {
        setEditError(updError.message)
        setEditSaving(false)
        return
      }
    }
    setEditSaving(false)
    setEditingProduct(null)
    await refreshAll()
  }

  // --- Add ---
  const [adding, setAdding] = useState(false)
  const [addSegment, setAddSegment] = useState<Segment>('domestic')
  const [addName, setAddName] = useState('')
  const [addKind, setAddKind] = useState<ProductKind>('accessory')
  const [addPrice, setAddPrice] = useState('')
  const [addUnit, setAddUnit] = useState('pc')
  const [addPriceOptions, setAddPriceOptions] = useState<PriceOption[]>([])
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function openAdd(segment: Segment) {
    setAddSegment(segment)
    setAddName('')
    setAddKind('accessory')
    setAddPrice('')
    setAddUnit('pc')
    setAddPriceOptions([])
    setAddError(null)
    setAdding(true)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = addName.trim()
    if (!trimmed) return
    setAddSaving(true)
    setAddError(null)
    const products = addSegment === 'commercial' ? commercialProducts : domesticProducts
    const maxSort = products.reduce((m, p) => Math.max(m, p.sort_order), 0)
    const payload: Record<string, unknown> = {
      name: trimmed,
      price: Number(addPrice || 0),
      segment: addSegment,
      kind: addKind,
      unit: addUnit.trim() || 'pc',
      sort_order: maxSort + 1,
      price_options: addKind === 'service' ? [] : cleanOptions(addPriceOptions),
    }
    const { data: created, error: insError } = await supabase.from('products').insert(payload).select().single()
    setAddSaving(false)
    if (insError) {
      setAddError(insError.message)
      return
    }
    setAdding(false)
    if (addKind === 'service' && addSegment === 'domestic') {
      navigate('/domestic/combos', { state: { editProductId: (created as Product).id } })
      return
    }
    await refreshAll()
  }

  const bySegment = (segment: Segment) => stock.filter((s) => s.segment === segment)

  const segColor = addSegment === 'commercial' ? '#E4571B' : '#2E8B57'
  const segBtnClass = (active: boolean) =>
    `flex-1 rounded-[12px] py-[11px] text-[13.5px] font-bold transition ${
      active
        ? `text-white shadow-[0_8px_18px_-8px_${segColor}99]`
        : 'bg-cream text-muted'
    }`

  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'
  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'

  return (
    <div className="pb-10">
      <AppHeader view="commercial" title="Godown Inventory" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="p-5 pt-1">
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            <SegmentBlock label="Commercial" color="#E4571B" segment="commercial" rows={bySegment('commercial')} onEdit={openEdit} onAdd={openAdd} />
            <SegmentBlock label="Domestic" color="#2E8B57" segment="domestic" rows={bySegment('domestic')} onEdit={openEdit} onAdd={openAdd} />
          </>
        )}
      </div>

      {/* Edit popup */}
      <BottomSheet open={editingProduct !== null} onClose={() => setEditingProduct(null)}>
        {editingProduct && (
          <form onSubmit={handleEditSave}>
            <h2 className="mb-4 font-display text-[19px] font-bold text-ink">Edit item</h2>
            <div className="mb-3">
              <p className={fieldLabel}>Name</p>
              <input required value={editName} onChange={(e) => setEditName(e.target.value)} className={fieldInput} />
            </div>
            <div className="mb-3">
              <p className={fieldLabel}>Price (₹)</p>
              <input type="number" min="0" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className={fieldInput} />
            </div>
            {editingProduct.kind !== 'service' && <PriceOptionsEditor value={editPriceOptions} onChange={setEditPriceOptions} />}
            {editError && <p className="mt-3 text-sm font-semibold text-red-600">{editError}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={handleEditDelete} disabled={editSaving} className="h-[50px] w-[110px] shrink-0 rounded-[14px] border-[1.5px] border-borderMuted bg-surface font-bold text-red-600 transition active:scale-[0.99] disabled:opacity-50">Delete</button>
              <button type="submit" disabled={editSaving} className="h-[50px] flex-1 rounded-[14px] bg-gradient-to-br from-accentSoft to-accent font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50">{editSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </BottomSheet>

      {/* Add popup */}
      <BottomSheet open={adding} onClose={() => setAdding(false)}>
        <form onSubmit={handleAdd}>
          <h2 className="mb-4 font-display text-[19px] font-bold text-ink">Add {addSegment} item</h2>
          <div className="mb-3">
            <p className={fieldLabel}>Name</p>
            <input required autoFocus placeholder="e.g. Suraksha Gas Pipe" value={addName} onChange={(e) => setAddName(e.target.value)} className={fieldInput} />
          </div>
          <div className="mb-3">
            <p className={fieldLabel}>Type</p>
            <div className="flex gap-2">
              {([
                { k: 'cylinder' as ProductKind, label: 'Cylinder' },
                { k: 'accessory' as ProductKind, label: 'Accessory' },
                ...(addSegment === 'domestic' ? [{ k: 'service' as ProductKind, label: 'Combo' }] : []),
              ]).map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setAddKind(k)} className={segBtnClass(addKind === k)} style={addKind === k ? { background: `linear-gradient(135deg, ${segColor}cc, ${segColor})` } : {}}>{label}</button>
              ))}
            </div>
          </div>
          <div className="mb-3 flex gap-3">
            <div className="flex-1">
              <p className={fieldLabel}>Price (₹)</p>
              <input type="number" min="0" step="0.01" placeholder="0" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} className={fieldInput} />
            </div>
            <div className="w-[110px]">
              <p className={fieldLabel}>Unit</p>
              <input value={addUnit} onChange={(e) => setAddUnit(e.target.value)} className={fieldInput} />
            </div>
          </div>
          {addKind !== 'service' && <PriceOptionsEditor value={addPriceOptions} onChange={setAddPriceOptions} />}
          {addKind === 'service' && <p className="mb-1 text-[12px] font-semibold text-subtle">You'll pick which items this combo includes next.</p>}
          {addError && <p className="mt-3 text-sm font-semibold text-red-600">{addError}</p>}
          <button type="submit" disabled={addSaving} className="mt-4 h-[50px] w-full rounded-[14px] font-bold text-white transition active:scale-[0.99] disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${segColor}cc, ${segColor})` }}>
            {addSaving ? 'Adding…' : addKind === 'service' ? 'Create & choose items' : 'Add item'}
          </button>
        </form>
      </BottomSheet>
    </div>
  )
}
