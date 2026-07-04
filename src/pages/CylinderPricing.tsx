import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAgencySettings } from '../hooks/useAgencySettings'

export function CylinderPricing() {
  const { data, loading, refresh } = useAgencySettings()
  const navigate = useNavigate()
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setPrice(String(data.price_per_cylinder))
  }, [data])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const priceNum = Number(price)
    if (priceNum <= 0) {
      setError('Price must be greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('agency_settings').update({ price_per_cylinder: priceNum }).eq('id', true)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    refresh()
    navigate('/account')
  }

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Cylinder pricing</h1>
      <p className="mb-4 text-sm text-muted">
        This is the default price per 19 kg cylinder — it prefills the "Price each" field on the New Sale form
        and can still be overridden per sale.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-xs font-semibold uppercase text-muted">
          Price per cylinder (₹)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-lg border border-borderMuted bg-white px-3 py-2"
          />
        </label>
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
