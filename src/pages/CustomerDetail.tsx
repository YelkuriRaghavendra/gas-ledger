import { FormEvent, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalance } from '../hooks/useCustomerBalance'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, formatDate } from '../utils/format'
import { getActivityIcon } from '../utils/activityIcon'
import { Avatar } from '../components/Avatar'
import { HeroCard } from '../components/HeroCard'

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
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-accent py-2 font-semibold text-white"
            >
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
          <div className="flex items-center gap-3">
            <Avatar name={balance.name} />
            <div>
              <h1 className="text-xl font-bold text-ink">{balance.name}</h1>
              <p className="text-sm text-ink/60">{balance.phone}</p>
            </div>
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

      <div className="mb-4 flex gap-2">
        {balance.phone && (
          <a
            href={`tel:${balance.phone}`}
            className="flex-1 rounded-lg border border-ink/20 bg-white py-2 text-center text-sm font-semibold text-ink"
          >
            📞 Call
          </a>
        )}
        {balance.address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(balance.address)}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-lg border border-ink/20 bg-white py-2 text-center text-sm font-semibold text-ink"
          >
            📍 {balance.address}
          </a>
        )}
      </div>

      <HeroCard>
        <p className="mb-2 text-xs font-semibold uppercase text-white/60">Empty cylinder balance</p>
        <div className="flex items-center gap-2">
          <div>
            <p className="font-display text-2xl font-bold text-white">{balance.sold}</p>
            <p className="text-xs text-white/60">Sold</p>
          </div>
          <span className="text-white/40">−</span>
          <div>
            <p className="font-display text-2xl font-bold text-green-400">{balance.returned}</p>
            <p className="text-xs text-white/60">Returned</p>
          </div>
          <span className="text-white/40">=</span>
          <div className="ml-auto rounded-xl bg-accent/20 px-4 py-2 text-center">
            <p className="font-display text-2xl font-bold text-accent">{balance.empties_outstanding}</p>
            <p className="text-xs text-white/60">Empties</p>
          </div>
        </div>
        <div className="mt-4 flex justify-between border-t border-white/10 pt-4">
          <p className="text-white/60">Amount due</p>
          <p className="font-display text-xl font-bold text-accent">{formatCurrency(balance.amount_due)}</p>
        </div>
      </HeroCard>

      <div className="my-6 flex gap-2">
        <Link
          to={`/customers/${customerId}/sale`}
          className="flex-1 rounded-lg bg-accent py-2 text-center text-sm font-semibold text-white"
        >
          Sale
        </Link>
        <Link
          to={`/customers/${customerId}/return`}
          className="flex-1 rounded-lg border border-green-600 py-2 text-center text-sm font-semibold text-green-600"
        >
          Return
        </Link>
        <Link
          to={`/customers/${customerId}/payment`}
          className="flex-1 rounded-lg border border-blue-600 py-2 text-center text-sm font-semibold text-blue-600"
        >
          Payment
        </Link>
      </div>

      <h2 className="mb-2 font-semibold text-ink">History</h2>
      <ul className="space-y-2">
        {transactions.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
            <span className="text-xl">{getActivityIcon(t.type)}</span>
            <div className="flex-1">
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
              <button onClick={() => handleDeleteTransaction(t.id)} className="text-xs text-red-600">
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
