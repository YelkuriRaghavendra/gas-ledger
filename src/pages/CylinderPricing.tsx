import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'

export function CylinderPricing() {
  const { data: products, loading, refresh } = useProducts()
  const navigate = useNavigate()
  const [prices, setPrices] = useState<Record<number, string>>({})
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
    }
  }, [products])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const updates = products.map((p) => ({ id: p.id, price: Number(prices[p.id]) }))
    const invalid = updates.find((u) => !(u.price > 0))
    if (invalid) {
      setError('Price must be greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    for (const u of updates) {
      const { error } = await supabase.from('products').update({ price: u.price }).eq('id', u.id)
      if (error) {
        setSaving(false)
        setError(error.message)
        return
      }
    }
    setSaving(false)
    refresh()
    navigate('/account')
  }

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Products</h1>
      <p className="mb-4 text-sm text-muted">
        These prices prefill the "Price each" field on the New Sale form for each cylinder size, and can still be
        overridden per sale.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {products.map((p) => (
          <label key={p.id} className="block text-xs font-semibold uppercase text-muted">
            {p.name} price (₹)
            <input
              type="number"
              min="0"
              step="0.01"
              value={prices[p.id] ?? ''}
              onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-borderMuted bg-white px-3 py-2"
            />
          </label>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
