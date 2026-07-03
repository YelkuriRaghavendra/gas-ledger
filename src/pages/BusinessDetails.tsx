import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAgencySettings } from '../hooks/useAgencySettings'

export function BusinessDetails() {
  const { data, loading, refresh } = useAgencySettings()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setName(data.business_name)
      setPhone(data.business_phone ?? '')
      setAddress(data.business_address ?? '')
    }
  }, [data])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('agency_settings')
      .update({ business_name: name, business_phone: phone, business_address: address })
      .eq('id', true)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    refresh()
    navigate('/account')
  }

  if (loading) return <p className="p-4 text-ink/60">Loading…</p>

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Business details</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-xs font-semibold uppercase text-ink/60">
          Business name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 bg-white px-3 py-2"
          />
        </label>
        <label className="block text-xs font-semibold uppercase text-ink/60">
          Phone
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 bg-white px-3 py-2"
          />
        </label>
        <label className="block text-xs font-semibold uppercase text-ink/60">
          Address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 bg-white px-3 py-2"
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
