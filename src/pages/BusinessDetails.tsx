import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { isValidPhone, sanitizePhoneInput } from '../utils/validation'

export function BusinessDetails() {
  const { data, loading, refresh } = useAgencySettings()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [city, setCity] = useState('')
  const [pincode, setPincode] = useState('')
  const [gst, setGst] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setName(data.business_name)
      setPhone(data.business_phone ?? '')
      setLine1(data.address_line1 ?? '')
      setLine2(data.address_line2 ?? '')
      setCity(data.city ?? '')
      setPincode(data.pincode ?? '')
      setGst(data.gst_number ?? '')
    }
  }, [data])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Enter a business name')
      return
    }
    if (phone.trim() && !isValidPhone(phone)) {
      setError('Enter a valid 10-digit phone number')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('agency_settings')
      .update({
        business_name: name,
        business_phone: phone,
        gst_number: gst || null,
        address_line1: line1 || null,
        address_line2: line2 || null,
        city: city || null,
        pincode: pincode || null,
      })
      .eq('id', true)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    refresh()
    navigate('/account')
  }

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-semibold text-ink'

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Business details</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Identity</p>
          <div className="space-y-4 rounded-[20px] bg-surface p-5 shadow-card">
            <div>
              <p className={fieldLabel}>Business name</p>
              <input value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />
            </div>
            <div>
              <p className={fieldLabel}>Phone</p>
              <input
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                className={fieldInput}
              />
            </div>
            <div>
              <p className={fieldLabel}>GST number</p>
              <input value={gst} onChange={(e) => setGst(e.target.value)} className={fieldInput} />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Address</p>
          <div className="space-y-4 rounded-[20px] bg-surface p-5 shadow-card">
            <div>
              <p className={fieldLabel}>Address line 1</p>
              <input value={line1} onChange={(e) => setLine1(e.target.value)} className={fieldInput} />
            </div>
            <div>
              <p className={fieldLabel}>Address line 2</p>
              <input
                placeholder="Landmark / area (optional)"
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                className={fieldInput}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <p className={fieldLabel}>City</p>
                <input value={city} onChange={(e) => setCity(e.target.value)} className={fieldInput} />
              </div>
              <div className="flex-1">
                <p className={fieldLabel}>Pincode</p>
                <input value={pincode} onChange={(e) => setPincode(e.target.value)} className={fieldInput} />
              </div>
            </div>
          </div>
        </div>

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
