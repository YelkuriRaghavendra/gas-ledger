# Cylinder Tracker UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Cylinder Tracker's presentation layer to match the actual prototype's design and interaction patterns (dark hero stat cards, colored avatars, steppers, a 5-tab nav with a quick-add FAB, an Account section), on top of the existing, already-working Supabase backend.

**Architecture:** Same backend (Supabase Postgres + Auth + RLS) plus one new singleton table (`agency_settings`). All changes are new/reworked React components and pages, a handful of new reusable UI primitives, and a custom Supabase storage adapter for "remember me."

**Tech Stack:** React 18, TypeScript, Vite, React Router v6, Tailwind CSS, `@supabase/supabase-js` — same stack as the existing app, no new dependencies.

## Global Constraints

- Auth stays Supabase email/password — no phone+PIN.
- Branding is generic/configurable: no hardcoded "Balaji Gas Agency" / "Suresh Reddy" anywhere in code. Agency name comes from `agency_settings.business_name`, person name from `profiles.name`.
- Single cylinder type/price only — no multi-size support.
- Color palette (unchanged): cream `#DED6C9` (background), ink `#211913` (text/dark cards), accent `#E4571B` (primary). New semantic colors for this pass: green (`green-600`/`green-50`/`green-800`) for returns, blue (`blue-600`/`blue-50`/`blue-800`) for payments.
- RLS enforced in Postgres for every owner-only action, including the new `agency_settings` table — never rely on UI-only gating.
- TypeScript `strict` mode. No comments in code unless explaining a non-obvious constraint.
- No automated test suite — verification is manual against the live Supabase project (already connected via `.env.local`).

---

## Task 1: `agency_settings` table and RLS

**Files:**
- Create: `supabase/migrations/002_agency_settings.sql`

**Interfaces:**
- Produces: table `agency_settings` (singleton row, `id = true`), columns `business_name`, `business_phone`, `business_address`, `price_per_cylinder`, `updated_at`.

- [ ] **Step 1: Create `supabase/migrations/002_agency_settings.sql`**

```sql
create table agency_settings (
  id boolean primary key default true check (id),
  business_name text not null default '',
  business_phone text,
  business_address text,
  price_per_cylinder numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into agency_settings (id) values (true);

alter table agency_settings enable row level security;

create policy "public read agency settings" on agency_settings
  for select to anon, authenticated using (true);

create policy "owner update agency settings" on agency_settings
  for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
```

Reads are open to `anon` too (not just `authenticated`) because the Login screen shows the agency name before anyone is signed in — this table only holds non-sensitive business info (name/phone/address/price), never customer data.

- [ ] **Step 2: Run the migration**

Paste the contents of `supabase/migrations/002_agency_settings.sql` into the Supabase dashboard's SQL Editor and run it. Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

In the SQL Editor, run `select * from agency_settings;` — expect exactly one row with `id = true` and empty/zero defaults.

---

## Task 2: `AgencySettings` type and hook

**Files:**
- Modify: `src/types/db.ts`
- Create: `src/hooks/useAgencySettings.ts`

**Interfaces:**
- Produces: `AgencySettings` type; `useAgencySettings()` → `{ data: AgencySettings | null, loading, error, refresh }`.

- [ ] **Step 1: Add to `src/types/db.ts`** (append at the end of the file)

```ts
export interface AgencySettings {
  id: boolean
  business_name: string
  business_phone: string | null
  business_address: string | null
  price_per_cylinder: number
  updated_at: string
}
```

- [ ] **Step 2: Create `src/hooks/useAgencySettings.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AgencySettings } from '../types/db'

export function useAgencySettings() {
  const [data, setData] = useState<AgencySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('agency_settings').select('*').eq('id', true).single()
    if (error) setError(error.message)
    else setData(data as AgencySettings)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit` from `/Users/yelkuriraghavendra/Desktop/Personal/new`
Expected: no errors.

---

## Task 3: UI primitives — Avatar, StatusPill, activity icon util

**Files:**
- Create: `src/components/Avatar.tsx`
- Create: `src/components/StatusPill.tsx`
- Create: `src/utils/activityIcon.ts`

**Interfaces:**
- Consumes: `TransactionType` (`src/types/db.ts`).
- Produces: `Avatar({ name, size? })`, `StatusPill({ owed })`, `getActivityIcon(type: TransactionType): string`.

- [ ] **Step 1: Create `src/components/Avatar.tsx`**

```tsx
const PALETTE = ['#E4571B', '#2F6B4F', '#2F5C8A', '#7A4FA3', '#B5852B', '#A3355C']

function colorForName(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size, backgroundColor: colorForName(name) }}
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold text-white"
    >
      {initialsForName(name)}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/StatusPill.tsx`**

```tsx
export function StatusPill({ owed }: { owed: number }) {
  if (owed <= 0) {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Settled</span>
  }
  return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">{owed} owed</span>
}
```

- [ ] **Step 3: Create `src/utils/activityIcon.ts`**

```ts
import type { TransactionType } from '../types/db'

export function getActivityIcon(type: TransactionType): string {
  if (type === 'sale') return '🔥'
  if (type === 'return') return '↩️'
  return '💳'
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors (these files aren't consumed anywhere yet).

---

## Task 4: UI primitives — Stepper, HeroCard, BottomSheet

**Files:**
- Create: `src/components/Stepper.tsx`
- Create: `src/components/HeroCard.tsx`
- Create: `src/components/BottomSheet.tsx`

**Interfaces:**
- Produces: `Stepper({ value, onChange, min? })`, `HeroCard({ children })`, `BottomSheet({ open, onClose, children })`.

- [ ] **Step 1: Create `src/components/Stepper.tsx`**

```tsx
interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
}

export function Stepper({ value, onChange, min = 0 }: StepperProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-ink/20 bg-white px-2 py-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-10 w-10 rounded-lg bg-cream text-xl font-bold text-ink"
      >
        −
      </button>
      <span className="text-2xl font-bold text-ink">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="h-10 w-10 rounded-lg bg-accent text-xl font-bold text-white"
      >
        +
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/HeroCard.tsx`**

```tsx
import type { ReactNode } from 'react'

export function HeroCard({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-ink p-5 text-white">{children}</div>
}
```

- [ ] **Step 3: Create `src/components/BottomSheet.tsx`**

```tsx
import type { ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-cream p-5 pb-8">{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

---

## Task 5: Remember-me storage adapter

**Files:**
- Modify: `src/lib/supabase.ts`

**Interfaces:**
- Produces: `supabase` client now uses a conditional storage adapter keyed on `localStorage['cylinder-tracker-remember']`.

- [ ] **Step 1: Rewrite `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

const REMEMBER_KEY = 'cylinder-tracker-remember'

const conditionalStorage = {
  getItem: (key: string) => localStorage.getItem(key) ?? sessionStorage.getItem(key),
  setItem: (key: string, value: string) => {
    const remember = localStorage.getItem(REMEMBER_KEY) === 'true'
    ;(remember ? localStorage : sessionStorage).setItem(key, value)
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: conditionalStorage },
})

export const REMEMBER_ME_STORAGE_KEY = REMEMBER_KEY
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

Run `npm run dev`, open the app, and in the browser console run `localStorage.getItem('cylinder-tracker-remember')` — expect `null` (unset until Task 6's Login screen sets it). Confirm the app still boots and the existing login flow still works (this task doesn't change behavior yet, since nothing sets `REMEMBER_KEY` until Task 6).

---

## Task 6: Login rework with Remember me

**Files:**
- Modify: `src/pages/Login.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`session`, `signIn`), `useAgencySettings()` (Task 2), `REMEMBER_ME_STORAGE_KEY` (Task 5).

- [ ] **Step 1: Rewrite `src/pages/Login.tsx`**

```tsx
import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { REMEMBER_ME_STORAGE_KEY } from '../lib/supabase'

export function Login() {
  const { session, signIn } = useAuth()
  const { data: settings } = useAgencySettings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    localStorage.setItem(REMEMBER_ME_STORAGE_KEY, String(remember))
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-3xl">
        🛢️
      </div>
      <h1 className="mb-1 text-2xl font-bold text-ink">{settings?.business_name || 'Cylinder Tracker'}</h1>
      <p className="mb-8 text-sm text-ink/60">Cylinder distribution ledger</p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-ink/20 bg-white px-4 py-3"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-ink/20 bg-white px-4 py-3"
        />
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
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

Run `npm run dev`. Confirm the login screen shows "Cylinder Tracker" (the `agency_settings.business_name` is still empty from Task 1's default), the Remember me checkbox is present and checked by default, and logging in with the owner account still works. After logging in, check `localStorage.getItem('cylinder-tracker-remember')` in the console — expect `"true"`.

---

## Task 7: New Sale rework — picker, Stepper, price prefill, live total

**Files:**
- Modify: `src/pages/NewSale.tsx`
- Modify: `src/App.tsx` (add one route)

**Interfaces:**
- Consumes: `useCustomerBalances()` (Task 8 of the original plan), `useAgencySettings()` (Task 2), `Stepper` (Task 4), `formatCurrency` (existing).

- [ ] **Step 1: Rewrite `src/pages/NewSale.tsx`**

```tsx
import { FormEvent, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { Stepper } from '../components/Stepper'
import { formatCurrency } from '../utils/format'

export function NewSale() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const { data: settings } = useAgencySettings()
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [search, setSearch] = useState('')
  const [qty, setQty] = useState(1)
  const [empties, setEmpties] = useState(0)
  const [priceEach, setPriceEach] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const customer = customers.find((c) => c.id === customerId)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.name.toLowerCase().includes(q))
  }, [customers, search])

  if (!customerId) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-xl font-bold text-ink">New Sale</h1>
        <input
          placeholder="Search customer"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-lg border border-ink/20 bg-white px-3 py-2"
        />
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setCustomerId(c.id)}
                className="w-full rounded-xl bg-white p-4 text-left shadow-sm"
              >
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink/60">{c.phone}</p>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <p className="text-ink/60">No customers found.</p>}
        </ul>
      </div>
    )
  }

  const price = Number(priceEach || settings?.price_per_cylinder || 0)
  const saleTotal = qty * price
  const newEmptiesOwed = qty - empties

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (qty <= 0 || price <= 0) {
      setError('Quantity and price must be greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'sale',
      qty,
      empties,
      amount: saleTotal,
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
      <h1 className="mb-4 text-xl font-bold text-ink">Record a sale</h1>
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase text-ink/60">Customer</p>
        <div className="rounded-lg border border-ink/20 bg-white px-4 py-3 font-semibold text-ink">
          {customer?.name}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-ink/60">19 kg cylinders sold</p>
          <Stepper value={qty} onChange={setQty} min={1} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase text-ink/60">
            Price each (₹)
            <input
              type="number"
              min="0"
              value={priceEach}
              placeholder={String(settings?.price_per_cylinder ?? 0)}
              onChange={(e) => setPriceEach(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/20 bg-white px-3 py-2"
            />
          </label>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-ink/60">Empties taken</p>
            <Stepper value={empties} onChange={setEmpties} min={0} />
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex justify-between">
            <p className="text-sm text-ink/60">Sale total</p>
            <p className="font-bold text-ink">{formatCurrency(saleTotal)}</p>
          </div>
          <div className="flex justify-between">
            <p className="text-sm text-ink/60">New empties owed</p>
            <p className="font-bold text-accent">+{newEmptiesOwed} cylinders</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save sale'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Add the customer-less route in `src/App.tsx`**

Find the line `<Route path="/customers/:id/sale" element={<NewSale />} />` and add this line directly above it:

```tsx
<Route path="/sale" element={<NewSale />} />
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify manually**

Run `npm run dev`, log in, navigate to `/sale` directly. Expected: a customer search/picker renders (no customer preselected). Pick a customer, confirm the form shows their name, enter a quantity and price, confirm "Sale total" computes live. Then navigate to an existing customer's page and use its "Sale" button (`/customers/:id/sale`) — confirm the customer is preselected and the picker is skipped.

---

## Task 8: Log Return rework — picker, Stepper, live preview

**Files:**
- Modify: `src/pages/LogReturn.tsx`
- Modify: `src/App.tsx` (add one route)

**Interfaces:**
- Consumes: `useCustomerBalances()`, `Stepper` (Task 4).

- [ ] **Step 1: Rewrite `src/pages/LogReturn.tsx`**

```tsx
import { FormEvent, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { Stepper } from '../components/Stepper'

export function LogReturn() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [search, setSearch] = useState('')
  const [qty, setQty] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const customer = customers.find((c) => c.id === customerId)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.name.toLowerCase().includes(q))
  }, [customers, search])

  if (!customerId) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-xl font-bold text-ink">Log Return</h1>
        <input
          placeholder="Search customer"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-lg border border-ink/20 bg-white px-3 py-2"
        />
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setCustomerId(c.id)}
                className="w-full rounded-xl bg-white p-4 text-left shadow-sm"
              >
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink/60">{c.phone}</p>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <p className="text-ink/60">No customers found.</p>}
        </ul>
      </div>
    )
  }

  const currentlyOwed = customer?.empties_outstanding ?? 0
  const remaining = Math.max(0, currentlyOwed - qty)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (qty <= 0) {
      setError('Quantity must be greater than zero')
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

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Log empty return</h1>
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase text-ink/60">Customer</p>
        <div className="rounded-lg border border-ink/20 bg-white px-4 py-3 font-semibold text-ink">
          {customer?.name}
        </div>
      </div>
      <div className="mb-4 flex justify-between rounded-xl bg-ink p-4 text-white">
        <p>Currently owed by customer</p>
        <p className="font-bold text-accent">{currentlyOwed} empties</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-ink/60">Empty cylinders returned</p>
          <Stepper value={qty} onChange={setQty} min={1} />
        </div>
        <div className="rounded-xl bg-green-50 p-4">
          <div className="flex justify-between">
            <p className="text-green-800">Remaining after return</p>
            <p className="font-bold text-green-800">{remaining} empties</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save return'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Add the customer-less route in `src/App.tsx`**

Find `<Route path="/customers/:id/return" element={<LogReturn />} />` and add this line directly above it:

```tsx
<Route path="/return" element={<LogReturn />} />
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify manually**

Navigate to `/return` directly — confirm the picker renders. Pick a customer, confirm "Currently owed" matches their actual `empties_outstanding`, adjust the stepper, confirm "Remaining after return" updates live.

---

## Task 9: Record Payment rework — picker, Pay full, live balance

**Files:**
- Modify: `src/pages/RecordPayment.tsx`
- Modify: `src/App.tsx` (add one route)

**Interfaces:**
- Consumes: `useCustomerBalances()`, `formatCurrency`.

- [ ] **Step 1: Rewrite `src/pages/RecordPayment.tsx`**

```tsx
import { FormEvent, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { formatCurrency } from '../utils/format'

export function RecordPayment() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const [search, setSearch] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const customer = customers.find((c) => c.id === customerId)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.name.toLowerCase().includes(q))
  }, [customers, search])

  if (!customerId) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-xl font-bold text-ink">Record Payment</h1>
        <input
          placeholder="Search customer"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-lg border border-ink/20 bg-white px-3 py-2"
        />
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setCustomerId(c.id)}
                className="w-full rounded-xl bg-white p-4 text-left shadow-sm"
              >
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink/60">{c.phone}</p>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <p className="text-ink/60">No customers found.</p>}
        </ul>
      </div>
    )
  }

  const currentlyDue = customer?.amount_due ?? 0
  const amountNum = Number(amount || 0)
  const balanceAfter = Math.max(0, currentlyDue - amountNum)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (amountNum <= 0) {
      setError('Amount must be greater than zero')
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

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Record payment</h1>
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase text-ink/60">Customer</p>
        <div className="rounded-lg border border-ink/20 bg-white px-4 py-3 font-semibold text-ink">
          {customer?.name}
        </div>
      </div>
      <div className="mb-4 flex justify-between rounded-xl bg-ink p-4 text-white">
        <p>Currently due</p>
        <p className="font-bold text-accent">{formatCurrency(currentlyDue)}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-ink/60">Amount received (₹)</p>
          <button
            type="button"
            onClick={() => setAmount(String(currentlyDue))}
            className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700"
          >
            Pay full
          </button>
        </div>
        <input
          type="number"
          min="0.01"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-ink/20 bg-white px-3 py-3 text-lg"
        />
        <div className="rounded-xl bg-blue-50 p-4">
          <div className="flex justify-between">
            <p className="text-blue-800">Balance after payment</p>
            <p className="font-bold text-blue-800">{formatCurrency(balanceAfter)}</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save payment'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Add the customer-less route in `src/App.tsx`**

Find `<Route path="/customers/:id/payment" element={<RecordPayment />} />` and add this line directly above it:

```tsx
<Route path="/payment" element={<RecordPayment />} />
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify manually**

Navigate to `/payment` directly, pick a customer, click "Pay full" and confirm the amount field fills with their exact `amount_due`, confirm "Balance after payment" shows ₹0 in that case.

---

## Task 10: Home rework — HeroCard, quick actions, recent activity

**Files:**
- Modify: `src/pages/Home.tsx`

**Interfaces:**
- Consumes: `useCustomerBalances()`, `useActivityFeed(limit)`, `HeroCard` (Task 4), `getActivityIcon` (Task 3), `formatCurrency`, `formatDate`.

- [ ] **Step 1: Rewrite `src/pages/Home.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatDate } from '../utils/format'
import { getActivityIcon } from '../utils/activityIcon'
import { HeroCard } from '../components/HeroCard'

export function Home() {
  const { profile, signOut } = useAuth()
  const { data, loading, error } = useCustomerBalances()
  const { data: activity } = useActivityFeed(8)

  const totalDue = data.reduce((sum, c) => sum + c.amount_due, 0)
  const totalSold = data.reduce((sum, c) => sum + c.sold, 0)
  const totalReturned = data.reduce((sum, c) => sum + c.returned, 0)
  const totalEmptiesOut = data.reduce((sum, c) => sum + c.empties_outstanding, 0)
  const customersWithDue = data.filter((c) => c.amount_due > 0).length

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-ink/60">Welcome back</p>
          <h1 className="text-xl font-bold text-ink">{profile?.name ?? '…'}</h1>
        </div>
        <button onClick={signOut} className="text-sm text-accent">
          Log out
        </button>
      </div>

      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <HeroCard>
            <p className="text-xs font-semibold uppercase text-white/60">Amount to collect</p>
            <p className="mb-1 text-3xl font-bold text-white">{formatCurrency(totalDue)}</p>
            <p className="mb-4 text-sm text-white/60">outstanding from {customersWithDue} customers</p>
            <div className="flex gap-6 border-t border-white/10 pt-4">
              <div>
                <p className="text-xs text-white/60">Sold</p>
                <p className="font-bold text-white">{totalSold}</p>
              </div>
              <div>
                <p className="text-xs text-white/60">Returned</p>
                <p className="font-bold text-green-400">{totalReturned}</p>
              </div>
              <div>
                <p className="text-xs text-white/60">Empties out</p>
                <p className="font-bold text-accent">{totalEmptiesOut}</p>
              </div>
            </div>
          </HeroCard>

          <div className="my-4 flex gap-3">
            <Link to="/sale" className="flex-1 rounded-lg bg-accent py-3 text-center font-semibold text-white">
              + New sale
            </Link>
            <Link
              to="/return"
              className="flex-1 rounded-lg border border-ink/20 bg-white py-3 text-center font-semibold text-ink"
            >
              ↩ Log return
            </Link>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-ink">Recent activity</h2>
            <Link to="/activity" className="text-sm text-accent">
              See all
            </Link>
          </div>
          <ul className="space-y-2">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                <span className="text-xl">{getActivityIcon(entry.type)}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">{entry.customer_name}</p>
                  <p className="text-xs text-ink/60">
                    {entry.type === 'sale' && `${entry.qty} sold · ${entry.empties} empties in`}
                    {entry.type === 'return' && 'Empties returned'}
                    {entry.type === 'payment' && formatCurrency(entry.amount)}
                  </p>
                </div>
                <p className="text-xs text-ink/60">{formatDate(entry.created_at)}</p>
              </li>
            ))}
            {activity.length === 0 && <p className="text-ink/60">No activity yet.</p>}
          </ul>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

Open the Home screen, confirm the dark hero card shows correct totals, "New sale"/"Log return" navigate to `/sale`/`/return` with the customer picker, and "Recent activity" lists the latest entries with icons matching their type.

---

## Task 11: Customers list rework — Avatar, StatusPill, aggregate header

**Files:**
- Modify: `src/pages/Customers.tsx`

**Interfaces:**
- Consumes: `Avatar`, `StatusPill` (Task 3), `useCustomerBalances()`.

- [ ] **Step 1: Rewrite `src/pages/Customers.tsx`**

```tsx
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { formatCurrency } from '../utils/format'
import { Avatar } from '../components/Avatar'
import { StatusPill } from '../components/StatusPill'

export function Customers() {
  const { data, loading, error, refresh } = useCustomerBalances()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if ((location.state as { openAdd?: boolean } | null)?.openAdd) {
      setShowAdd(true)
    }
  }, [location.state])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
  }, [data, search])

  const totalEmptiesOut = data.reduce((sum, c) => sum + c.empties_outstanding, 0)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const { error } = await supabase.from('customers').insert({ name, phone, address })
    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setName('')
    setPhone('')
    setAddress('')
    setShowAdd(false)
    refresh()
  }

  return (
    <div className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Customers</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>
      <p className="mb-4 text-sm text-ink/60">
        {data.length} accounts · {totalEmptiesOut} empties outstanding
      </p>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <input
            required
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-accent py-2 font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save customer'}
          </button>
        </form>
      )}

      <input
        placeholder="Search by name or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-lg border border-ink/20 px-3 py-2"
      />

      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <ul className="space-y-2">
        {filtered.map((c) => (
          <li key={c.id}>
            <Link to={`/customers/${c.id}`} className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
              <Avatar name={c.name} size={40} />
              <div className="flex-1">
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink/60">{c.phone}</p>
              </div>
              <div className="text-right">
                <StatusPill owed={c.empties_outstanding} />
                <p className="mt-1 text-xs text-ink/60">{formatCurrency(c.amount_due)} due</p>
              </div>
            </Link>
          </li>
        ))}
        {!loading && filtered.length === 0 && <p className="text-ink/60">No customers found.</p>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

Confirm each customer row shows a colored avatar with correct initials, a "Settled" pill for zero-balance customers and an "N owed" pill otherwise, and the aggregate line at the top matches the actual customer count and total empties outstanding.

---

## Task 12: Customer Detail rework — Avatar, Call/Address, equation HeroCard

**Files:**
- Modify: `src/pages/CustomerDetail.tsx`

**Interfaces:**
- Consumes: `Avatar`, `HeroCard`, `getActivityIcon` (Tasks 3-4).

- [ ] **Step 1: Rewrite `src/pages/CustomerDetail.tsx`**

```tsx
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
            <p className="text-2xl font-bold text-white">{balance.sold}</p>
            <p className="text-xs text-white/60">Sold</p>
          </div>
          <span className="text-white/40">−</span>
          <div>
            <p className="text-2xl font-bold text-green-400">{balance.returned}</p>
            <p className="text-xs text-white/60">Returned</p>
          </div>
          <span className="text-white/40">=</span>
          <div className="ml-auto rounded-xl bg-accent/20 px-4 py-2 text-center">
            <p className="text-2xl font-bold text-accent">{balance.empties_outstanding}</p>
            <p className="text-xs text-white/60">Empties</p>
          </div>
        </div>
        <div className="mt-4 flex justify-between border-t border-white/10 pt-4">
          <p className="text-white/60">Amount due</p>
          <p className="text-xl font-bold text-accent">{formatCurrency(balance.amount_due)}</p>
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

Open a customer with a phone and address set — confirm Call/Address buttons appear and link correctly (`tel:` and a Google Maps search URL). Confirm the dark equation card shows `Sold − Returned = Empties` correctly and "Amount due" matches. Re-verify (from the original plan's Task 11) that a staff account still cannot see Edit/Delete controls, and RLS still blocks staff writes.

---

## Task 13: Activity Feed icon update

**Files:**
- Modify: `src/pages/ActivityFeed.tsx`

**Interfaces:**
- Consumes: `getActivityIcon` (Task 3).

- [ ] **Step 1: Rewrite `src/pages/ActivityFeed.tsx`**

```tsx
import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatDate } from '../utils/format'
import { getActivityIcon } from '../utils/activityIcon'

export function ActivityFeed() {
  const { data, loading, error } = useActivityFeed(50)

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Activity</h1>
      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      <ul className="space-y-2">
        {data.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
            <span className="text-xl">{getActivityIcon(entry.type)}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{entry.customer_name}</p>
                <p className="text-xs text-ink/60">{formatDate(entry.created_at)}</p>
              </div>
              <p className="text-xs capitalize text-ink/60">
                {entry.type} {entry.amount > 0 && `· ${formatCurrency(entry.amount)}`}
              </p>
            </div>
          </li>
        ))}
        {!loading && data.length === 0 && <p className="text-ink/60">No activity yet.</p>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify manually**

Confirm each row shows the correct icon for its type (🔥 sale, ↩️ return, 💳 payment).

---

## Task 14: Account screen

**Files:**
- Create: `src/pages/Account.tsx`
- Modify: `src/App.tsx` (add one route)

**Interfaces:**
- Consumes: `useAuth()`, `useAgencySettings()`, `Avatar`.

- [ ] **Step 1: Create `src/pages/Account.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { Avatar } from '../components/Avatar'

export function Account() {
  const { profile, signOut } = useAuth()
  const { data: settings } = useAgencySettings()

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Account</h1>
      <div className="mb-4 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
        <Avatar name={profile?.name ?? '?'} />
        <div>
          <p className="font-semibold text-ink">{profile?.name}</p>
          <p className="text-sm text-ink/60">
            {settings?.business_name || 'Cylinder Tracker'} · {profile?.role}
          </p>
        </div>
      </div>
      <div className="mb-4 divide-y divide-ink/10 rounded-2xl bg-white shadow-sm">
        <Link to="/account/business" className="flex items-center justify-between p-4">
          <span className="text-ink">Business details</span>
          <span className="text-ink/40">›</span>
        </Link>
        <Link to="/account/pricing" className="flex items-center justify-between p-4">
          <span className="text-ink">Cylinder pricing</span>
          <span className="text-ink/40">›</span>
        </Link>
        <Link to="/account/export" className="flex items-center justify-between p-4">
          <span className="text-ink">Export ledger</span>
          <span className="text-ink/40">›</span>
        </Link>
      </div>
      <button onClick={signOut} className="w-full rounded-2xl bg-white py-4 font-semibold text-red-600 shadow-sm">
        Sign out
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add the route in `src/App.tsx`**

Add this import near the other page imports:

```tsx
import { Account } from './pages/Account'
```

Add this route inside the `<Route element={<ProtectedRoute />}>` block, next to `<Route path="/activity" element={<ActivityFeed />} />`:

```tsx
<Route path="/account" element={<Account />} />
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify manually**

Navigate to `/account`, confirm your avatar/name/role show correctly, the three navigation rows are present (they'll 404 until Tasks 15-17 add their routes — that's expected at this point), and Sign out logs you out.

---

## Task 15: Business details screen

**Files:**
- Create: `src/pages/BusinessDetails.tsx`
- Modify: `src/App.tsx` (add one route)

**Interfaces:**
- Consumes: `useAgencySettings()` (Task 2), `supabase`.

- [ ] **Step 1: Create `src/pages/BusinessDetails.tsx`**

```tsx
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
```

- [ ] **Step 2: Add the route in `src/App.tsx`**

Add this import:

```tsx
import { BusinessDetails } from './pages/BusinessDetails'
```

Add this route next to `/account`:

```tsx
<Route path="/account/business" element={<BusinessDetails />} />
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify manually**

As owner: navigate to Account → Business details, change the business name, save, confirm it redirects to `/account` and the new name shows there and on the Login screen after signing out. As staff: attempt the same edit and confirm it fails with an RLS error message shown (not a silent success) — this is the same owner-only-write pattern as `customers`/`transactions`.

---

## Task 16: Cylinder pricing screen

**Files:**
- Create: `src/pages/CylinderPricing.tsx`
- Modify: `src/App.tsx` (add one route)

**Interfaces:**
- Consumes: `useAgencySettings()` (Task 2), `supabase`.

- [ ] **Step 1: Create `src/pages/CylinderPricing.tsx`**

```tsx
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
    if (priceNum < 0) {
      setError('Price cannot be negative')
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

  if (loading) return <p className="p-4 text-ink/60">Loading…</p>

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Cylinder pricing</h1>
      <p className="mb-4 text-sm text-ink/60">
        This is the default price per 19 kg cylinder — it prefills the "Price each" field on the New Sale form
        and can still be overridden per sale.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-xs font-semibold uppercase text-ink/60">
          Price per cylinder (₹)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
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
```

- [ ] **Step 2: Add the route in `src/App.tsx`**

Add this import:

```tsx
import { CylinderPricing } from './pages/CylinderPricing'
```

Add this route next to `/account/business`:

```tsx
<Route path="/account/pricing" element={<CylinderPricing />} />
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify manually**

As owner: set a price, save, then open `/sale` (Task 7) and confirm the "Price each" field's placeholder shows the saved price. As staff: confirm the price is visible (read access) but saving a change fails with an RLS error.

---

## Task 17: Export ledger screen

**Files:**
- Create: `src/pages/ExportLedger.tsx`
- Modify: `src/App.tsx` (add one route)

**Interfaces:**
- Consumes: `supabase` (queries `activity_feed`).

- [ ] **Step 1: Create `src/pages/ExportLedger.tsx`**

```tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}

export function ExportLedger() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    const { data, error } = await supabase
      .from('activity_feed')
      .select('*')
      .order('created_at', { ascending: false })
    setExporting(false)
    if (error) {
      setError(error.message)
      return
    }
    const csv = toCsv(data ?? [])
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Export ledger</h1>
      <p className="mb-4 text-sm text-ink/60">Download every sale, return, and payment as a CSV file.</p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
      >
        {exporting ? 'Preparing…' : 'Export CSV'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add the route in `src/App.tsx`**

Add this import:

```tsx
import { ExportLedger } from './pages/ExportLedger'
```

Add this route next to `/account/pricing`:

```tsx
<Route path="/account/export" element={<ExportLedger />} />
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify manually**

Navigate to Account → Export ledger, click "Export CSV", confirm a file downloads and opening it (e.g. in a spreadsheet app) shows one row per transaction with a header row and correct columns.

---

## Task 18: Bottom nav — 5 slots, FAB, Quick-add sheet

**Files:**
- Create: `src/components/QuickAddSheet.tsx`
- Modify: `src/components/BottomNav.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (Task 4).
- Produces: `QuickAddSheet({ open, onClose, onNavigate })`.

- [ ] **Step 1: Create `src/components/QuickAddSheet.tsx`**

```tsx
import { BottomSheet } from './BottomSheet'

interface QuickAddSheetProps {
  open: boolean
  onClose: () => void
  onNavigate: (path: string, state?: Record<string, unknown>) => void
}

const items = [
  { path: '/sale', label: 'New sale', description: 'Record cylinders sold' },
  { path: '/return', label: 'Log return', description: 'Empty cylinders back' },
  { path: '/payment', label: 'Record payment', description: 'Collect dues from customer' },
  { path: '/customers', label: 'Add customer', description: 'New account', state: { openAdd: true } },
]

export function QuickAddSheet({ open, onClose, onNavigate }: QuickAddSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="mb-4 text-lg font-bold text-ink">Quick add</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path, item.state)}
            className="flex w-full items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm"
          >
            <div>
              <p className="font-semibold text-ink">{item.label}</p>
              <p className="text-sm text-ink/60">{item.description}</p>
            </div>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Rewrite `src/components/BottomNav.tsx`**

```tsx
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { QuickAddSheet } from './QuickAddSheet'

const leftTabs = [{ to: '/', label: 'Home' }, { to: '/customers', label: 'Customers' }]
const rightTabs = [{ to: '/activity', label: 'Activity' }, { to: '/account', label: 'Account' }]

export function BottomNav() {
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 flex items-center border-t border-ink/10 bg-white">
        {leftTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-accent' : 'text-ink/60'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => setQuickAddOpen(true)}
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-bold text-white shadow-lg"
          >
            +
          </button>
        </div>
        {rightTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-accent' : 'text-ink/60'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <QuickAddSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onNavigate={(path, state) => {
          setQuickAddOpen(false)
          navigate(path, { state })
        }}
      />
    </>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify manually**

Run `npm run build` to exercise the full accumulated app (all 18 tasks together) — confirm it builds clean. Then `npm run dev` and confirm: the bottom nav shows 5 items (Home, Customers, FAB, Activity, Account) on every protected route; tapping the FAB opens the "Quick add" sheet; each of its 4 items navigates correctly (New sale/Log return/Record payment open their picker since no customer is preset, Add customer navigates to `/customers` with the add form already open).

---

## Post-plan notes

- `supabase/migrations/002_agency_settings.sql` is a new migration on top of the original `supabase/schema.sql` — don't edit the original file, per the same convention established there.
- The `agency_settings` anon-read policy (Task 1) is a deliberate, scoped exception to "authenticated only" — it only exposes non-sensitive business info, never customer/transaction data.
