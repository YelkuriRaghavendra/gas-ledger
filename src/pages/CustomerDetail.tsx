import { FormEvent, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalance } from '../hooks/useCustomerBalance'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, formatDate } from '../utils/format'

export function CustomerDetail() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: balance, loading, error, refresh: refreshBalance } = useCustomerBalance(customerId)
  const { data: transactions, refresh: refreshTx } = useTransactions(customerId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  function startEdit() {
    if (!balance) return
    setName(balance.name)
    setPhone(balance.phone ?? '')
    setAddress(balance.address ?? '')
    setEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setActionError(null)
    const { error } = await supabase.from('customers').update({ name, phone, address }).eq('id', customerId)
    setSaving(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setEditing(false)
    refreshBalance()
  }

  async function handleDeleteCustomer() {
    if (!confirm('Delete this customer and all their transactions?')) return
    setActionError(null)
    const { error } = await supabase.from('customers').delete().eq('id', customerId)
    if (error) {
      setActionError(error.message)
      return
    }
    navigate('/customers')
  }

  async function handleDeleteTransaction(txId: number) {
    if (!confirm('Delete this entry?')) return
    setActionError(null)
    const { error } = await supabase.from('transactions').delete().eq('id', txId)
    if (error) {
      setActionError(error.message)
      return
    }
    refreshTx()
    refreshBalance()
  }

  if (loading) return <p className="p-4 text-ink/60">Loading…</p>
  if (error || !balance) return <p className="p-4 text-red-600">{error ?? 'Customer not found'}</p>

  return (
    <div className="p-4">
      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
      {editing ? (
        <form onSubmit={handleSave} className="mb-4 space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-accent py-2 font-semibold text-white">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg border border-ink/20 py-2 font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">{balance.name}</h1>
            <p className="text-sm text-ink/60">{balance.phone}</p>
            <p className="text-sm text-ink/60">{balance.address}</p>
          </div>
          {isOwner && (
            <div className="flex gap-3 text-sm">
              <button onClick={startEdit} className="text-accent">
                Edit
              </button>
              <button onClick={handleDeleteCustomer} className="text-red-600">
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-ink/60">Amount due</p>
          <p className="text-lg font-bold text-ink">{formatCurrency(balance.amount_due)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-ink/60">Empties outstanding</p>
          <p className="text-lg font-bold text-ink">{balance.empties_outstanding}</p>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <Link
          to={`/customers/${customerId}/sale`}
          className="flex-1 rounded-lg bg-accent py-2 text-center text-sm font-semibold text-white"
        >
          New Sale
        </Link>
        <Link
          to={`/customers/${customerId}/return`}
          className="flex-1 rounded-lg border border-accent py-2 text-center text-sm font-semibold text-accent"
        >
          Log Return
        </Link>
        <Link
          to={`/customers/${customerId}/payment`}
          className="flex-1 rounded-lg border border-accent py-2 text-center text-sm font-semibold text-accent"
        >
          Payment
        </Link>
      </div>

      <h2 className="mb-2 font-semibold text-ink">History</h2>
      <ul className="space-y-2">
        {transactions.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
            <div>
              <p className="text-sm font-semibold capitalize text-ink">{t.type}</p>
              <p className="text-xs text-ink/60">{formatDate(t.created_at)}</p>
            </div>
            <div className="text-right">
              {t.amount > 0 && <p className="text-sm font-semibold text-ink">{formatCurrency(t.amount)}</p>}
              {(t.qty > 0 || t.empties > 0) && (
                <p className="text-xs text-ink/60">
                  qty {t.qty} · empties {t.empties}
                </p>
              )}
            </div>
            {isOwner && (
              <button onClick={() => handleDeleteTransaction(t.id)} className="ml-3 text-xs text-red-600">
                Delete
              </button>
            )}
          </li>
        ))}
        {transactions.length === 0 && <p className="text-ink/60">No transactions yet.</p>}
      </ul>
    </div>
  )
}
