import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

export function NewSale() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { session } = useAuth()
  const [qty, setQty] = useState('1')
  const [empties, setEmpties] = useState('0')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const qtyNum = Number(qty)
    const emptiesNum = Number(empties)
    const amountNum = Number(amount)
    if (qtyNum <= 0 || amountNum <= 0) {
      setError('Quantity and amount must be greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'sale',
      qty: qtyNum,
      empties: emptiesNum,
      amount: amountNum,
      created_by: session?.user.id,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/customers/${customerId}`)
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">New Sale</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm text-ink/60">
          Cylinders sold
          <input
            type="number"
            min="1"
            required
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-ink/60">
          Empties collected
          <input
            type="number"
            min="0"
            value={empties}
            onChange={(e) => setEmpties(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-ink/60">
          Amount charged
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Record sale'}
        </button>
      </form>
    </div>
  )
}
