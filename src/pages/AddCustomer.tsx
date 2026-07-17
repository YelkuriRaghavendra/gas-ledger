import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'
import { ChevronLeftIcon } from '../components/icons'
import { isValidPhone, sanitizePhoneInput } from '../utils/validation'

export function AddCustomer() {
  const navigate = useNavigate()
  const { data: products } = useProducts()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [startingEmpties, setStartingEmpties] = useState('')
  const [startingEmptiesProductId, setStartingEmptiesProductId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (startingEmptiesProductId === null && products.length > 0) setStartingEmptiesProductId(products[0].id)
  }, [products, startingEmptiesProductId])

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
        name,
        phone,
        address,
        starting_empties_owed: Number(startingEmpties || 0),
        starting_empties_product_id: startingEmptiesProductId,
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
          <div>
            <p className={fieldLabel}>Empties already owed (optional)</p>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                placeholder="0"
                value={startingEmpties}
                onChange={(e) => setStartingEmpties(e.target.value)}
                className={`${fieldInput} min-w-0 flex-1`}
              />
              <div className="flex shrink-0 gap-1 rounded-[14px] bg-cream p-[5px]">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setStartingEmptiesProductId(p.id)}
                    className={`rounded-[11px] px-3 py-2 font-display text-[13px] font-bold transition ${
                      startingEmptiesProductId === p.id
                        ? 'bg-gradient-to-br from-accentSoft to-accent text-white shadow-glow'
                        : 'text-muted'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[12px] font-medium text-subtle">
              If this customer already had cylinders from before you started using this app
            </p>
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
