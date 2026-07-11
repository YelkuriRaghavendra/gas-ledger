import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { useBundleComponents } from '../../hooks/useBundleComponents'
import { BottomSheet } from '../../components/BottomSheet'
import { Stepper } from '../../components/Stepper'
import { ChevronLeftIcon, PlusIcon } from '../../components/icons'
import type { Product } from '../../types/db'

// Combo editor: a combo (bundle) is a product — usually a service like
// "New Connection" — that consumes other items' stock when billed.
export function DomesticCombos() {
  const { data: products, refresh: refreshProducts } = useProducts('domestic')
  const { data: bundles, refresh } = useBundleComponents()

  const [editing, setEditing] = useState<Product | null>(null)
  const [qtyByComponent, setQtyByComponent] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')

  const productNameById = new Map(products.map((p) => [p.id, p.name]))
  // A combo can be built from anything that holds stock.
  const componentCandidates = products.filter((p) => p.kind !== 'service')
  const bundleCandidates = products.filter((p) => p.kind === 'service')

  function componentsOf(productId: number) {
    return bundles.filter((b) => b.bundle_product_id === productId)
  }

  function openEditor(p: Product) {
    const current: Record<number, number> = {}
    for (const c of componentsOf(p.id)) current[c.component_product_id] = c.qty
    setQtyByComponent(current)
    setError(null)
    setEditing(p)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    const maxSort = products.reduce((m, p) => Math.max(m, p.sort_order), 0)
    const { data: created, error: insError } = await supabase
      .from('products')
      .insert({
        name,
        price: Number(newPrice || 0),
        segment: 'domestic',
        kind: 'service',
        unit: 'pc',
        sort_order: maxSort + 1,
      })
      .select()
      .single()
    setSaving(false)
    if (insError) {
      setError(insError.message)
      return
    }
    setCreating(false)
    setNewName('')
    setNewPrice('')
    await refreshProducts()
    // Jump straight into picking what the new combo includes.
    openEditor(created as Product)
  }

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    setError(null)
    const { error: delError } = await supabase
      .from('bundle_components')
      .delete()
      .eq('bundle_product_id', editing.id)
    if (delError) {
      setError(delError.message)
      setSaving(false)
      return
    }
    const rows = Object.entries(qtyByComponent)
      .map(([pid, qty]) => ({ bundle_product_id: editing.id, component_product_id: Number(pid), qty }))
      .filter((r) => r.qty > 0)
    if (rows.length > 0) {
      const { error: insError } = await supabase.from('bundle_components').insert(rows)
      if (insError) {
        setError(insError.message)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    setEditing(null)
    refresh()
  }

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'

  return (
    <div className="p-5 pb-[110px] pt-3">
      <Link to="/domestic/stock" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Stock
      </Link>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Combos</h1>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setCreating(true)
          }}
          className="flex items-center gap-[6px] rounded-[13px] bg-[#2E8B57] px-[14px] py-[9px] text-[13px] font-bold text-white shadow-[0_8px_18px_-8px_rgba(46,139,87,0.7)]"
        >
          <PlusIcon size={16} strokeWidth={2.4} /> New combo
        </button>
      </div>
      <p className="mb-5 text-[13px] font-medium leading-[1.5] text-subtle">
        A combo bundles items into one billed product — selling it takes each included item out of stock.
      </p>

      <ul className="flex flex-col gap-[11px]">
        {bundleCandidates.map((p) => {
          const comps = componentsOf(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => openEditor(p)}
                className="w-full rounded-[18px] bg-surface p-[15px] text-left shadow-card transition active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14.5px] font-bold text-ink">{p.name}</p>
                  <span className="text-[13px] font-bold text-[#2E8B57]">Edit ›</span>
                </div>
                <p className="mt-[4px] text-[12px] font-semibold text-subtle">
                  {comps.length > 0
                    ? `includes ${comps
                        .map((c) => `${c.qty} × ${productNameById.get(c.component_product_id) ?? 'item'}`)
                        .join(' + ')}`
                    : 'No items bundled — billing this won’t move stock'}
                </p>
              </button>
            </li>
          )
        })}
        {bundleCandidates.length === 0 && (
          <li className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
            No combos yet — tap "New combo" to create one
          </li>
        )}
      </ul>

      {/* Create a new combo product */}
      <BottomSheet open={creating} onClose={() => setCreating(false)} slideUp>
        <form onSubmit={handleCreate}>
          <h2 className="mb-4 font-display text-[19px] font-bold text-ink">New combo</h2>
          <div className="mb-3">
            <p className={fieldLabel}>Name</p>
            <input
              required
              autoFocus
              placeholder="e.g. New Connection (Special)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={fieldInput}
            />
          </div>
          <div className="mb-1">
            <p className={fieldLabel}>Price (₹)</p>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className={fieldInput}
            />
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="mt-4 h-[50px] w-full rounded-[14px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] font-bold text-white shadow-[0_12px_26px_-10px_rgba(46,139,87,0.65)] transition active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create & choose items'}
          </button>
        </form>
      </BottomSheet>

      {/* Edit what a combo includes */}
      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} slideUp>
        {editing && (
          <div>
            <h2 className="mb-1 font-display text-[19px] font-bold text-ink">{editing.name}</h2>
            <p className="mb-4 text-[12.5px] font-semibold text-subtle">What does this combo include?</p>
            <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto pb-1">
              {componentCandidates.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink">{c.name}</p>
                  <div className="w-[150px] shrink-0">
                    <Stepper
                      value={qtyByComponent[c.id] ?? 0}
                      onChange={(v) => setQtyByComponent((s) => ({ ...s, [c.id]: v }))}
                      min={0}
                      variant="secondary"
                      tone="surface"
                      size="sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-4 h-[50px] w-full rounded-[14px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] font-bold text-white shadow-[0_12px_26px_-10px_rgba(46,139,87,0.65)] transition active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save combo'}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
