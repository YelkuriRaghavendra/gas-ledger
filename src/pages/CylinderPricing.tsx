import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'
import { ChevronLeftIcon } from '../components/icons'

export function CylinderPricing() {
  const { data: products, loading, refresh } = useProducts()
  const navigate = useNavigate()
  const [prices, setPrices] = useState<Record<number, string>>({})
  const [capacities, setCapacities] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (products.length > 0) {
      setPrices((prev) => {
        const next = { ...prev }
        for (const p of products) {
          if (next[p.id] === undefined) next[p.id] = String(p.price)
        }
        return next
      })
      setCapacities((prev) => {
        const next = { ...prev }
        for (const p of products) {
          if (next[p.id] === undefined) next[p.id] = p.godown_capacity !== null ? String(p.godown_capacity) : ''
        }
        return next
      })
    }
  }, [products])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const updates = products.map((p) => ({
      id: p.id,
      price: Number(prices[p.id]),
      capacityRaw: capacities[p.id] ?? '',
    }))
    const invalid = updates.find((u) => !(u.price > 0))
    if (invalid) {
      setError('Price must be greater than zero')
      return
    }
    const invalidCapacity = updates.find((u) => u.capacityRaw.trim() !== '' && !(Number(u.capacityRaw) > 0))
    if (invalidCapacity) {
      setError('Godown capacity must be greater than zero, or left blank')
      return
    }
    setSaving(true)
    setError(null)
    for (const u of updates) {
      const godown_capacity = u.capacityRaw.trim() === '' ? null : Number(u.capacityRaw)
      const { error } = await supabase.from('products').update({ price: u.price, godown_capacity }).eq('id', u.id)
      if (error) {
        setSaving(false)
        setError(error.message)
        return
      }
    }
    setSaving(false)
    refresh()
    navigate('/')
  }

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to="/" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-2 font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Products</h1>
      <p className="mb-5 text-sm font-medium text-muted">
        These prices prefill the "Price each" field on New Sale for each cylinder size, and can still be overridden per
        sale.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {products.map((p) => (
          <div key={p.id} className="rounded-[18px] bg-surface p-[18px] shadow-card">
            <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
              {p.name}
            </span>
            <div className="mt-4 flex gap-3">
              <div className="flex-1">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Price (₹)</p>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={prices[p.id] ?? ''}
                  onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="h-[50px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-surface px-[14px] font-bold text-ink"
                />
              </div>
              <div className="flex-1">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Godown cap.</p>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Not set"
                  value={capacities[p.id] ?? ''}
                  onChange={(e) => setCapacities((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="h-[50px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-surface px-[14px] font-bold text-ink"
                />
              </div>
            </div>
          </div>
        ))}
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-1 h-[54px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
