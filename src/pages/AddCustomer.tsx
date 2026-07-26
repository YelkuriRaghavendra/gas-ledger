import { FormEvent, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ChevronLeftIcon } from '../components/icons'
import { isValidPhone, sanitizePhoneInput } from '../utils/validation'

export function AddCustomer() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Enter a name')
      return
    }
    if (phone.trim() && !isValidPhone(phone)) {
      setError('Enter a valid 10-digit phone number')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
      })
      .select('id')
      .single()
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/commercial/customers/${data.id}`)
  }

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-semibold text-ink'

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to="/commercial/customers" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Add customer</h1>

      <form onSubmit={handleSubmit}>
        <div className="rounded-[24px] bg-surface p-5 shadow-card">
          <div className="mb-4">
            <p className={fieldLabel}>Name</p>
            <input
              placeholder="Business or person"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldInput}
            />
          </div>
          <div className="mb-4">
            <p className={fieldLabel}>Phone number</p>
            <input
              placeholder="10-digit mobile"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
              className={fieldInput}
            />
          </div>
          <div className="mb-4">
            <p className={fieldLabel}>Address</p>
            <input
              placeholder="Locality / area"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={fieldInput}
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add customer'}
        </button>
      </form>
    </div>
  )
}
