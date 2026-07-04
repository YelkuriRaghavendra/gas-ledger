# History Redesign, Sale Payment Option, and Form Validations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Customer Detail's history list with day-grouping and a running balance, add a "received now vs. on credit" option to New Sale, and add business-sense validation (can't return more empties than outstanding, can't overpay, phone format, required names, positive pricing) across the app's forms.

**Architecture:** All changes are to existing React/TypeScript pages and one new shared utility (`src/utils/validation.ts`). No backend/schema changes — the "received now" option inserts two rows into the existing `transactions` table in one atomic `insert()` call instead of one.

**Tech Stack:** React 18, TypeScript, Vite, Supabase JS client — same stack as the rest of the app, no new dependencies.

## Global Constraints

- No automated test suite — verification is manual against the live Supabase project, consistent with the rest of the app.
- TypeScript `strict` mode. No comments in code unless explaining a non-obvious constraint.
- All validation errors use the existing pattern: a single red-text message rendered below the fields on submit failure (`{error && <p className="text-sm text-red-600">{error}</p>}` or the page's equivalent `actionError`/`error` state) — no new UI component for validation.
- The History redesign is scoped to `src/pages/CustomerDetail.tsx` only. The global Activity feed and Home's recent-activity snippet are unchanged (they span multiple customers, so a per-customer running balance doesn't apply).
- Duplicate phone number detection is explicitly out of scope.

---

## Task 1: Shared phone validator

**Files:**
- Create: `src/utils/validation.ts`

**Interfaces:**
- Produces: `isValidPhone(phone: string): boolean`.

- [ ] **Step 1: Create `src/utils/validation.ts`**

```ts
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return true
  if (digits.length === 12 && digits.startsWith('91')) return true
  return false
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit` from `/Users/yelkuriraghavendra/Desktop/Personal/new`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/validation.ts
git commit -m "feat: add shared phone number validator"
```

---

## Task 2: New Sale — empties validation, and Received now / On credit option

**Files:**
- Modify: `src/pages/NewSale.tsx`

**Interfaces:**
- Consumes: `supabase` (existing), `useAuth()` (existing).
- Produces: no new exports — this is a self-contained page behavior change.

- [ ] **Step 1: Rewrite `src/pages/NewSale.tsx`**

```tsx
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { Stepper } from '../components/Stepper'
import { formatCurrency } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'

export function NewSale() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const { data: settings } = useAgencySettings()
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [qty, setQty] = useState(1)
  const [empties, setEmpties] = useState(0)
  const [priceEach, setPriceEach] = useState('')
  const [received, setReceived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customerId === null && customers.length > 0) setCustomerId(customers[0].id)
  }, [customers, customerId])

  useEffect(() => {
    if (settings && !priceEach) setPriceEach(String(settings.price_per_cylinder || ''))
  }, [settings, priceEach])

  const price = Number(priceEach || 0)
  const saleTotal = qty * price
  const newEmptiesOwed = qty - empties

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId || qty <= 0 || price <= 0) {
      setError('Quantity and price must be greater than zero')
      return
    }
    if (empties > qty) {
      setError("Empties taken can't exceed cylinders sold.")
      return
    }
    setSaving(true)
    setError(null)
    const saleRow = {
      customer_id: customerId,
      type: 'sale' as const,
      qty,
      empties,
      amount: saleTotal,
      created_by: session?.user.id,
    }
    const rows = received
      ? [
          saleRow,
          {
            customer_id: customerId,
            type: 'payment' as const,
            qty: 0,
            empties: 0,
            amount: saleTotal,
            created_by: session?.user.id,
          },
        ]
      : [saleRow]
    const { error } = await supabase.from('transactions').insert(rows)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/customers/${customerId}`)
  }

  return (
    <div className="p-5 pb-10 pt-2">
      <Link to={customerId ? `/customers/${customerId}` : '/'} className="mb-[10px] inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[22px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">Record a sale</h1>

      <form onSubmit={handleSubmit}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Customer</p>
        <select
          value={customerId ?? ''}
          onChange={(e) => setCustomerId(Number(e.target.value))}
          className="mb-5 h-[52px] w-full appearance-none rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-bold text-ink"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">19 kg cylinders sold</p>
        <div className="mb-5">
          <Stepper value={qty} onChange={setQty} min={1} />
        </div>

        <div className="mb-5 flex gap-3">
          <div className="flex-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Price each (₹)</p>
            <input
              type="number"
              min="0"
              value={priceEach}
              onChange={(e) => setPriceEach(e.target.value)}
              className="h-[52px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-white px-[14px] font-bold text-ink"
            />
          </div>
          <div className="flex-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Empties taken</p>
            <Stepper value={empties} onChange={setEmpties} min={0} variant="secondary" />
          </div>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.5px] text-muted">Payment</p>
        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => setReceived(false)}
            className={`flex-1 rounded-[14px] border-[1.5px] py-3 text-sm font-bold ${
              !received ? 'border-accent bg-accent text-white' : 'border-borderMuted bg-white text-ink'
            }`}
          >
            On credit
          </button>
          <button
            type="button"
            onClick={() => setReceived(true)}
            className={`flex-1 rounded-[14px] border-[1.5px] py-3 text-sm font-bold ${
              received ? 'border-accent bg-accent text-white' : 'border-borderMuted bg-white text-ink'
            }`}
          >
            Received now
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-[#F3D9C6] bg-[#FBEDE4] p-4">
          <div className="mb-2 flex justify-between">
            <span className="text-[13px] font-semibold text-[#9A6A4A]">Sale total</span>
            <span className="font-display text-lg font-bold text-ink">{formatCurrency(saleTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[13px] font-semibold text-[#9A6A4A]">New empties owed</span>
            <span className="font-display text-[15px] font-bold text-[#C23B22]">
              {newEmptiesOwed >= 0 ? `+${newEmptiesOwed}` : newEmptiesOwed} cylinders
            </span>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="h-[54px] w-full rounded-[14px] bg-accent font-bold text-white shadow-[0_12px_26px_-10px_rgba(228,87,27,0.7)] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save sale'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

Run `npm run dev`, log in, open New Sale for a customer:
1. Set "Empties taken" higher than "19 kg cylinders sold" — confirm submit is blocked with the error "Empties taken can't exceed cylinders sold."
2. Leave "On credit" selected (default), submit a valid sale — confirm the customer's `amount_due` increases by the sale total (existing behavior, unchanged).
3. Open New Sale again, select "Received now", submit a valid sale — confirm the customer's `amount_due` is unchanged (net zero) afterward, and both a sale and a payment entry appear in their history.

- [ ] **Step 4: Commit**

```bash
git add src/pages/NewSale.tsx
git commit -m "feat: add empties validation and received-now/on-credit option to new sale"
```

---

## Task 3: Log Return — can't return more than outstanding

**Files:**
- Modify: `src/pages/LogReturn.tsx`

- [ ] **Step 1: Update `handleSubmit` in `src/pages/LogReturn.tsx`**

Replace the existing `handleSubmit` function:

```tsx
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId || qty <= 0) {
      setError('Quantity must be greater than zero')
      return
    }
    if (qty > currentlyOwed) {
      setError(`Can't return more than the ${currentlyOwed} empties outstanding.`)
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'return',
      qty,
      empties: 0,
      amount: 0,
      created_by: session?.user.id,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/customers/${customerId}`)
  }
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

For a customer with, say, 7 empties outstanding: try returning 8 — confirm it's blocked with "Can't return more than the 7 empties outstanding." Try returning exactly 7 — confirm it succeeds (boundary case).

- [ ] **Step 4: Commit**

```bash
git add src/pages/LogReturn.tsx
git commit -m "feat: block returning more empties than outstanding"
```

---

## Task 4: Record Payment — can't overpay

**Files:**
- Modify: `src/pages/RecordPayment.tsx`

- [ ] **Step 1: Update `handleSubmit` in `src/pages/RecordPayment.tsx`**

Replace the existing `handleSubmit` function:

```tsx
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId || amountNum <= 0) {
      setError('Amount must be greater than zero')
      return
    }
    if (amountNum > currentlyDue) {
      setError(`Amount can't exceed the ${formatCurrency(currentlyDue)} currently due.`)
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'payment',
      qty: 0,
      empties: 0,
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

For a customer with, say, ₹5,000 due: try entering ₹5,001 — confirm it's blocked with "Amount can't exceed the ₹5,000 currently due." Click "Pay full" and submit — confirm it still succeeds (boundary case, since Pay full sets the exact due amount).

- [ ] **Step 4: Commit**

```bash
git add src/pages/RecordPayment.tsx
git commit -m "feat: block recording a payment larger than the amount due"
```

---

## Task 5: Add Customer — phone number validation

**Files:**
- Modify: `src/pages/AddCustomer.tsx`

**Interfaces:**
- Consumes: `isValidPhone` from `src/utils/validation.ts` (Task 1).

- [ ] **Step 1: Update `src/pages/AddCustomer.tsx`**

Add the import at the top of the file, alongside the existing imports:

```tsx
import { isValidPhone } from '../utils/validation'
```

Replace the existing `handleSubmit` function:

```tsx
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
    const { data, error } = await supabase.from('customers').insert({ name, phone, address }).select('id').single()
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/customers/${data.id}`)
  }
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

Try adding a customer with phone `12345` — confirm it's blocked with "Enter a valid 10-digit phone number". Try a valid 10-digit number — confirm it succeeds. Try leaving phone blank — confirm it still succeeds (phone is optional).

- [ ] **Step 4: Commit**

```bash
git add src/pages/AddCustomer.tsx
git commit -m "feat: validate phone number format on add customer"
```

---

## Task 6: Business Details — required name + phone validation

**Files:**
- Modify: `src/pages/BusinessDetails.tsx`

**Interfaces:**
- Consumes: `isValidPhone` from `src/utils/validation.ts` (Task 1).

- [ ] **Step 1: Update `src/pages/BusinessDetails.tsx`**

Add the import at the top of the file, alongside the existing imports:

```tsx
import { isValidPhone } from '../utils/validation'
```

Replace the existing `handleSubmit` function:

```tsx
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

As owner: clear the business name field and try saving — confirm it's blocked with "Enter a business name". Enter an invalid phone (e.g. `123`) — confirm it's blocked. Enter a valid name and a valid or blank phone — confirm it saves.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BusinessDetails.tsx
git commit -m "feat: require business name and validate phone format"
```

---

## Task 7: Cylinder Pricing — price must be greater than zero

**Files:**
- Modify: `src/pages/CylinderPricing.tsx`

- [ ] **Step 1: Update `handleSubmit` in `src/pages/CylinderPricing.tsx`**

Replace the existing validation check (the `if (priceNum < 0)` block) with:

```tsx
    const priceNum = Number(price)
    if (priceNum <= 0) {
      setError('Price must be greater than zero')
      return
    }
```

The full `handleSubmit` function should read:

```tsx
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

As owner, try saving a price of `0` — confirm it's blocked with "Price must be greater than zero". Try a negative number — confirm it's blocked. Try a positive number — confirm it saves.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CylinderPricing.tsx
git commit -m "feat: require cylinder price greater than zero"
```

---

## Task 8: Customer Detail — edit-form phone validation + History redesign

**Files:**
- Modify: `src/pages/CustomerDetail.tsx`

**Interfaces:**
- Consumes: `isValidPhone` from `src/utils/validation.ts` (Task 1), `Transaction` type (existing, `src/types/db.ts`).

This task combines two changes to the same file: adding phone validation to the existing customer-edit form, and redesigning the History section below it with day-grouping and a running balance. Both are shown together as one full-file rewrite so there's no ambiguity about the file's final state.

- [ ] **Step 1: Rewrite `src/pages/CustomerDetail.tsx`**

```tsx
import { FormEvent, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalance } from '../hooks/useCustomerBalance'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { isValidPhone } from '../utils/validation'
import { Avatar } from '../components/Avatar'
import { HeroCard } from '../components/HeroCard'
import { ChevronLeftIcon, PhoneIcon, MapPinIcon, PlusIcon, ReturnIcon, CreditCardIcon } from '../components/icons'
import type { Transaction } from '../types/db'

type HistoryEntry = Transaction & { balanceAfter: number }

interface HistoryGroup {
  key: string
  label: string
  entries: HistoryEntry[]
  sales: number
  returns: number
  collected: number
}

function historyTitle(t: Transaction) {
  if (t.type === 'sale') return `${t.qty} cylinders sold`
  if (t.type === 'return') return `${t.qty} empties returned`
  return 'Payment received'
}

function historySubtitle(t: Transaction) {
  const date = formatRelativeDate(t.created_at)
  if (t.type === 'sale') return `${date} · ${formatCurrency(t.amount)}${t.empties ? ` · ${t.empties} empties collected` : ''}`
  if (t.type === 'payment') return `${date} · ${formatCurrency(t.amount)}`
  return date
}

function historyAmount(t: Transaction) {
  if (t.type === 'sale') return `+${t.qty}`
  if (t.type === 'return') return `−${t.qty}`
  return formatCurrency(t.amount)
}

function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function buildHistoryGroups(transactions: Transaction[]): HistoryGroup[] {
  const chronological = [...transactions].reverse()
  let running = 0
  const withBalance: HistoryEntry[] = chronological.map((t) => {
    if (t.type === 'sale') running += t.amount
    else if (t.type === 'payment') running -= t.amount
    return { ...t, balanceAfter: running }
  })
  const newestFirst = [...withBalance].reverse()

  const groups: HistoryGroup[] = []
  for (const t of newestFirst) {
    const key = dayKey(t.created_at)
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = { key, label: formatRelativeDate(t.created_at), entries: [], sales: 0, returns: 0, collected: 0 }
      groups.push(group)
    }
    group.entries.push(t)
    if (t.type === 'sale') group.sales += 1
    if (t.type === 'return') group.returns += 1
    if (t.type === 'payment') group.collected += t.amount
  }
  return groups
}

function digestLine(group: HistoryGroup) {
  const parts: string[] = []
  if (group.sales > 0) parts.push(`${group.sales} sale${group.sales > 1 ? 's' : ''}`)
  if (group.returns > 0) parts.push(`${group.returns} return${group.returns > 1 ? 's' : ''}`)
  if (group.collected > 0) parts.push(`${formatCurrency(group.collected)} collected`)
  return parts.join(' · ')
}

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
    if (phone.trim() && !isValidPhone(phone)) {
      setActionError('Enter a valid 10-digit phone number')
      return
    }
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

  if (loading) return <p className="p-4 text-muted">Loading…</p>
  if (error || !balance) return <p className="p-4 text-red-600">{error ?? 'Customer not found'}</p>

  const historyGroups = buildHistoryGroups(transactions)

  return (
    <div className="p-5 pb-10 pt-2">
      <Link to="/customers" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Customers
      </Link>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}

      {editing ? (
        <form onSubmit={handleSave} className="mb-[18px] space-y-3 rounded-2xl border border-[#EFE7D8] bg-white p-4">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-[14px] bg-accent py-2 font-bold text-white">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-[14px] border-[1.5px] border-borderMuted py-2 font-bold text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-[18px] flex items-center gap-[14px]">
          <Avatar id={balance.id} name={balance.name} size={58} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold leading-[1.1] tracking-[-0.3px] text-ink">{balance.name}</h1>
            <p className="mt-[3px] text-[13px] font-semibold text-muted">{balance.phone}</p>
          </div>
          {isOwner && (
            <div className="flex shrink-0 gap-3 text-xs font-bold">
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
            className="flex flex-1 items-center justify-center gap-[7px] rounded-[13px] border-[1.5px] border-borderMuted bg-white py-[11px] text-[13.5px] font-bold text-ink"
          >
            <PhoneIcon size={16} /> Call
          </a>
        )}
        {balance.address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(balance.address)}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-[7px] overflow-hidden rounded-[13px] border-[1.5px] border-borderMuted bg-white py-[11px] text-[12.5px] font-semibold text-muted"
          >
            <MapPinIcon size={16} />
            <span className="truncate">{balance.address}</span>
          </a>
        )}
      </div>

      <HeroCard>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.5px] text-mutedOnDark">Empty cylinder balance</p>
        <div className="flex items-center gap-[10px]">
          <div className="flex-1 text-center">
            <p className="font-display text-[26px] font-bold text-white">{balance.sold}</p>
            <p className="mt-[2px] text-[11px] font-semibold text-mutedOnDark">Sold</p>
          </div>
          <span className="text-[22px] font-semibold text-[#6B6154]">−</span>
          <div className="flex-1 text-center">
            <p className="font-display text-[26px] font-bold text-[#5FCF97]">{balance.returned}</p>
            <p className="mt-[2px] text-[11px] font-semibold text-mutedOnDark">Returned</p>
          </div>
          <span className="text-[22px] font-semibold text-[#6B6154]">=</span>
          <div className="flex-1 rounded-[13px] bg-accent/[.18] px-1 py-2 text-center">
            <p className="font-display text-[26px] font-bold text-[#FF8A4C]">{balance.empties_outstanding}</p>
            <p className="mt-[2px] text-[11px] font-bold text-[#FF8A4C]/[.85]">Empties</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/[.12] pt-[14px]">
          <span className="text-[13px] font-semibold text-[#C9BBA8]">Amount due</span>
          <span className="font-display text-xl font-bold text-[#FF8A4C]">{formatCurrency(balance.amount_due)}</span>
        </div>
      </HeroCard>

      <div className="my-[18px] grid grid-cols-3 gap-2">
        <Link
          to={`/customers/${customerId}/sale`}
          className="flex flex-col items-center gap-[5px] rounded-[13px] bg-accent py-3 text-[13px] font-bold text-white"
        >
          <PlusIcon size={18} strokeWidth={2.2} />
          Sale
        </Link>
        <Link
          to={`/customers/${customerId}/return`}
          className="flex flex-col items-center gap-[5px] rounded-[13px] border-[1.5px] border-borderMuted bg-white py-3 text-[13px] font-bold text-ink"
        >
          <ReturnIcon size={18} strokeWidth={2.2} />
          Return
        </Link>
        <Link
          to={`/customers/${customerId}/payment`}
          className="flex flex-col items-center gap-[5px] rounded-[13px] border-[1.5px] border-borderMuted bg-white py-3 text-[13px] font-bold text-ink"
        >
          <CreditCardIcon size={18} strokeWidth={2.2} />
          Payment
        </Link>
      </div>

      <h2 className="mb-3 font-display text-base font-semibold text-ink">History</h2>
      {historyGroups.map((group) => (
        <div key={group.key} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.5px] text-muted">{group.label}</p>
            {digestLine(group) && <p className="text-xs font-medium text-[#9A8F80]">{digestLine(group)}</p>}
          </div>
          <ul className="flex flex-col gap-0">
            {group.entries.map((t) => {
              const tint = getActivityTint(t.type)
              return (
                <li key={t.id} className="flex gap-[14px] pb-[18px]">
                  <div
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] text-[15px]"
                    style={{ backgroundColor: tint.bg, color: tint.color }}
                  >
                    {getActivityIcon(t.type)}
                  </div>
                  <div className="flex-1 pt-px">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-ink">{historyTitle(t)}</p>
                      <p className="font-display text-sm font-bold" style={{ color: tint.color }}>
                        {historyAmount(t)}
                      </p>
                    </div>
                    <p className="mt-[2px] text-xs font-semibold text-[#9A8F80]">{historySubtitle(t)}</p>
                    <p className="mt-[1px] text-xs font-semibold text-muted">Balance: {formatCurrency(t.balanceAfter)}</p>
                  </div>
                  {isOwner && (
                    <button onClick={() => handleDeleteTransaction(t.id)} className="shrink-0 self-start text-xs font-bold text-red-600">
                      Delete
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {transactions.length === 0 && <p className="text-muted">No transactions yet.</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

1. **Phone validation:** open a customer, click Edit, enter an invalid phone (e.g. `123`), try saving — confirm it's blocked with "Enter a valid 10-digit phone number". Enter a valid 10-digit number — confirm it saves.
2. **Day grouping:** open a customer with transactions from more than one day — confirm entries are grouped under day headers ("Today", "Yesterday", etc.), not a flat list.
3. **Daily digest:** for a day with e.g. 2 sales and 1 payment, confirm the digest line reads something like "2 sales · ₹X collected".
4. **Running balance:** for a customer with a known sequence of sales/payments, manually compute the expected running balance after each transaction and confirm the "Balance: ₹N" line on each row matches (sales increase it, payments decrease it, returns leave it unchanged).
5. Confirm owner-only Edit/Delete controls (verified in an earlier round) are still present and still gated — this rewrite must not regress that.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CustomerDetail.tsx
git commit -m "feat: add phone validation to customer edit and redesign history with day grouping and running balance"
```

---

## Post-plan notes

- The "Received now" option in New Sale relies on `supabase.from('transactions').insert(rows)` accepting an array — this is a single SQL statement covering both rows, so it's atomic without needing a database function or RPC.
- The running-balance computation in Task 8 assumes `useTransactions` continues to return rows ordered newest-first (its current, unchanged behavior) — the grouping function reverses to chronological order internally rather than depending on the hook's ordering being changed.
