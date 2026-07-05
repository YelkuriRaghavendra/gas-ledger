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
    navigate(`/customers/${data.id}`)
  }

  return (
    <div className="p-5 pb-10 pt-2">
      <Link to="/customers" className="mb-[10px] inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[22px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">Add customer</h1>

      <form onSubmit={handleSubmit} className="mb-[26px] flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Name</p>
          <input
            placeholder="Business or person"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface px-4 font-semibold text-ink shadow-card"
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Phone number</p>
          <input
            placeholder="10-digit mobile"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
            className="h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface px-4 font-semibold text-ink shadow-card"
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Address</p>
          <input
            placeholder="Locality / area"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface px-4 font-semibold text-ink shadow-card"
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Empties already owed (optional)</p>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              placeholder="0"
              value={startingEmpties}
              onChange={(e) => setStartingEmpties(e.target.value)}
              className="h-[52px] w-full flex-1 rounded-[14px] border-[1.5px] border-borderMuted bg-white px-4 font-semibold text-ink"
            />
            <select
              value={startingEmptiesProductId ?? ''}
              onChange={(e) => setStartingEmptiesProductId(Number(e.target.value))}
              className="h-[52px] w-32 shrink-0 appearance-none rounded-[14px] border-[1.5px] border-borderMuted bg-white px-3 font-bold text-ink"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-muted">If this customer already had cylinders from before you started using this app</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="h-[54px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add customer'}
        </button>
      </form>
    </div>
  )
}
