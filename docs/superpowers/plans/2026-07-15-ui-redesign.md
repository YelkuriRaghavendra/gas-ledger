# Cylinder Tracker UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the app's UI on a shared shell (AppHeader + `⇄` mode switch + `RK` account menu, 3-tab nav with a centered `＋`), surface stock on Home, simplify domestic billing, add GST/address + created/updated timestamps, fix purchases-in-Activity, and remove Reports — keeping the current palette and fonts.

**Architecture:** React 18 + React Router 6 + Tailwind + Supabase. New shared components under `src/components/`; per-screen restyles reuse them. Three additive SQL migrations (agency_settings fields, `updated_at`/`updated_by`, `activity_feed` UNION) run in the Supabase SQL editor. The approved visual target for each screen is its mockup HTML under `.superpowers/brainstorm/30285-1784055696/content/` (referenced per task).

**Tech Stack:** TypeScript, Vite, TailwindCSS, `@supabase/supabase-js`, `react-router-dom`.

## Global Constraints

- Palette + fonts are fixed (`tailwind.config.js`): `cream #F4EFE6`, `ink #1F1813`, commercial `accent #E4571B`/`accentSoft #F26B2C`, domestic green `#2E8B57`, `muted #6E655A`, `subtle #A79C8D`, `borderMuted #E7DECF`; fonts `Manrope` (`font-sans`), `Space Grotesk` (`font-display`). Do not add colors/fonts.
- No new runtime dependencies without calling it out.
- Detail popups are **centered dialogs** — reuse existing `BottomSheet` **without** `slideUp` (it already centers). The account menu uses `BottomSheet` **with** `slideUp`.
- Commercial UI uses accent orange; domestic UI uses green. Header/nav are theme-aware by segment.
- No unit-test runner exists. **Per-task verification = `npm run build` must pass, then a browser-preview check** via the preview tools. Add `vitest` only in Task 3 (pure transform) — see that task.
- Commit after each task with a `feat:`/`fix:`/`refactor:` message.
- Migrations are additive and non-destructive (keep legacy columns).

---

## File Structure

**New files**
- `src/components/AppHeader.tsx` — shared top bar (logo, business name, `⇄` switch, account avatar).
- `src/components/AccountMenu.tsx` — account bottom sheet (opened from avatar).
- `src/components/DetailModal.tsx` — centered dialog for activity/history/bill details.
- `src/components/CylindersCard.tsx` — Home stock card (both segments).
- `src/components/StatementDialog.tsx` — statement period + share options.
- `src/components/NewBillTable.tsx` — domestic billing table (used by DomesticNewBill).
- `src/hooks/useActivityFeed.test.ts` — unit test for the feed transform (Task 3).
- `db/2026-07-ui-redesign.sql` — the three additive migrations.

**Modified (high-touch)**
- `src/types/db.ts`, `src/hooks/useActivityFeed.ts`, `src/hooks/useAgencySettings.ts`
- `src/components/BottomNav.tsx`, `src/components/DomesticNav.tsx`
- `src/pages/Home.tsx`, `Customers.tsx`, `CustomerDetail.tsx`, `ActivityFeed.tsx`, `BusinessDetails.tsx`
- `src/pages/domestic/DomesticHome.tsx`, `DomesticNewBill.tsx`, `DomesticHistory.tsx`
- `src/App.tsx`
- Restyle-only: `NewSale.tsx`, `LogReturn.tsx`, `RecordPayment.tsx`, `AddCustomer.tsx`, `Purchases.tsx`, `RecordPurchase.tsx`, `Godown.tsx`, `SetCurrentStock.tsx`, `CylinderPricing.tsx`, `ExportLedger.tsx`, `Login.tsx`, `ModeSelect.tsx`, `domestic/DomesticStock.tsx`, `domestic/DomesticPurchases.tsx`, `domestic/DomesticRecordPurchase.tsx`, `domestic/DomesticCombos.tsx`

**Deleted**
- `src/pages/Reports.tsx`, `src/pages/Account.tsx`, `src/hooks/useDailySummary.ts`, `src/hooks/useMonthlySummary.ts`, `src/hooks/useRevenueTrend.ts`

---

## Phase 0 — Data foundation

### Task 1: agency_settings — GST + structured address

**Files:**
- Create: `db/2026-07-ui-redesign.sql` (append section 1)
- Modify: `src/types/db.ts` (`AgencySettings` interface), `src/pages/BusinessDetails.tsx`

**Interfaces:**
- Produces: `AgencySettings` gains `address_line1: string | null`, `address_line2: string | null`, `city: string | null`, `pincode: string | null`, `gst_number: string | null`.

- [ ] **Step 1: Write the migration SQL**

Create `db/2026-07-ui-redesign.sql`:

```sql
-- ============================================================
-- UI redesign — additive schema changes. Run once in Supabase SQL editor.
-- ============================================================

-- 1. Business details: GST + structured address
alter table public.agency_settings add column if not exists address_line1 text;
alter table public.agency_settings add column if not exists address_line2 text;
alter table public.agency_settings add column if not exists city text;
alter table public.agency_settings add column if not exists pincode text;
alter table public.agency_settings add column if not exists gst_number text;

-- Backfill line1 from the old single-line address (kept, unused going forward)
update public.agency_settings
set address_line1 = business_address
where address_line1 is null and business_address is not null;
```

- [ ] **Step 2: Update the type**

In `src/types/db.ts`, extend `AgencySettings`:

```typescript
export interface AgencySettings {
  id: boolean
  business_name: string
  business_phone: string | null
  business_address: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  pincode: string | null
  gst_number: string | null
  price_per_cylinder: number
  updated_at: string
}
```

- [ ] **Step 3: Update the Business details form**

Replace the body of `src/pages/BusinessDetails.tsx` so it edits the new fields. Key changes: add state for `line1, line2, city, pincode, gst`; seed from `data` in the `useEffect`; on submit update all new columns; render the grouped Identity (name, phone, GST) + Address (line1, line2, city, pincode) cards. Visual target: right phone in `customers-business.html`. Full form markup:

```tsx
// state
const [line1, setLine1] = useState(''); const [line2, setLine2] = useState('')
const [city, setCity] = useState(''); const [pincode, setPincode] = useState('')
const [gst, setGst] = useState('')
// in useEffect(() => { if (data) { ... } }, [data]):
setLine1(data.address_line1 ?? ''); setLine2(data.address_line2 ?? '')
setCity(data.city ?? ''); setPincode(data.pincode ?? ''); setGst(data.gst_number ?? '')
// in handleSubmit update():
.update({ business_name: name, business_phone: phone, gst_number: gst || null,
          address_line1: line1 || null, address_line2: line2 || null,
          city: city || null, pincode: pincode || null })
```

Render fields with the existing `fieldLabel`/`fieldInput` styling; group into two `rounded-[20px] bg-surface shadow-card` cards labelled "Identity" and "Address"; City + Pincode share a `flex gap-3` row.

- [ ] **Step 4: Run the app in Supabase and apply the migration**

Run `db/2026-07-ui-redesign.sql` section 1 in the Supabase SQL editor (manual, one-time). Confirm no error.

- [ ] **Step 5: Verify build + preview**

Run: `npm run build`
Expected: build succeeds, no TS errors.
Then preview: open Business details (via account menu once Task 6 lands, or route `/account/business` directly), edit GST + address, save, reload — values persist.

- [ ] **Step 6: Commit**

```bash
git add db/2026-07-ui-redesign.sql src/types/db.ts src/pages/BusinessDetails.tsx
git commit -m "feat: business details GST + structured address"
```

---

### Task 2: created_at + updated_at/updated_by on ledgers

**Files:**
- Modify: `db/2026-07-ui-redesign.sql` (append section 2)
- Modify: `src/types/db.ts` (`Transaction`, `Purchase`)

**Interfaces:**
- Produces: `Transaction` and `Purchase` gain `updated_at: string` and `updated_by: string | null`.

- [ ] **Step 1: Append migration SQL**

Append to `db/2026-07-ui-redesign.sql`:

```sql
-- 2. Last-updated tracking on the ledgers
alter table public.transactions add column if not exists updated_at timestamptz not null default now();
alter table public.transactions add column if not exists updated_by uuid;
alter table public.purchases   add column if not exists updated_at timestamptz not null default now();
alter table public.purchases   add column if not exists updated_by uuid;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_touch_transactions on public.transactions;
create trigger trg_touch_transactions before update on public.transactions
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_purchases on public.purchases;
create trigger trg_touch_purchases before update on public.purchases
  for each row execute function public.touch_updated_at();
```

(The trigger bumps `updated_at`; the app sets `updated_by: session.user.id` in the update payloads of `NewSale`/`LogReturn`/`RecordPayment`/`RecordPurchase` edit flows — added when those screens are touched in later tasks.)

- [ ] **Step 2: Update types**

In `src/types/db.ts`, add to both `Transaction` and `Purchase`:

```typescript
  updated_at: string
  updated_by: string | null
```

- [ ] **Step 3: Apply migration in Supabase**

Run section 2 in the Supabase SQL editor. Confirm success.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add db/2026-07-ui-redesign.sql src/types/db.ts
git commit -m "feat: updated_at/updated_by on transactions and purchases"
```

---

### Task 3: activity_feed UNION purchases + feed hook & transform

**Files:**
- Modify: `db/2026-07-ui-redesign.sql` (append section 3)
- Modify: `src/types/db.ts` (`ActivityEntry`), `src/hooks/useActivityFeed.ts`
- Create: `src/hooks/useActivityFeed.test.ts`
- Modify: `package.json` (add `vitest`), create `vitest.config.ts`

**Interfaces:**
- Produces: `ActivityEntry` with `customer_id: number | null`, `type: 'sale' | 'return' | 'payment' | 'purchase'`, `segment: Segment`, `updated_at: string`. `useActivityFeed(limit?)` returns commercial rows including purchases. Pure helper `normalizeFeedRow(row)` exported for testing.

- [ ] **Step 1: Append the view migration**

Append to `db/2026-07-ui-redesign.sql`:

```sql
-- 3. activity_feed: customer transactions + supplier purchases, segment-aware
drop view if exists public.activity_feed;
create view public.activity_feed as
select
  t.id, t.customer_id, c.name as customer_name, t.type, t.qty, t.empties,
  t.amount, t.note, t.created_by, t.created_at, t.updated_at,
  t.product_id, p.name as product_name, p.segment
from transactions t
join customers c on c.id = t.customer_id
left join products p on p.id = t.product_id
union all
select
  pu.id, null as customer_id, pr.name as customer_name, 'purchase' as type,
  pu.qty, pu.empties_given as empties, pu.amount, pu.note, pu.created_by,
  pu.created_at, pu.updated_at, pu.product_id, pr.name as product_name, pr.segment
from purchases pu
join products pr on pr.id = pu.product_id
order by created_at desc;
```

(`customer_name` for purchases carries the product name as the counterparty label; the UI prefixes "Purchase ·".)

- [ ] **Step 2: Update the type**

In `src/types/db.ts` replace `ActivityEntry`:

```typescript
export interface ActivityEntry {
  id: number
  customer_id: number | null
  customer_name: string
  type: 'sale' | 'return' | 'payment' | 'purchase'
  product_id: number | null
  product_name: string | null
  qty: number
  empties: number
  amount: number
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  segment: Segment
}
```

- [ ] **Step 3: Add vitest + config**

Add to `package.json` devDependencies `"vitest": "^2.0.0"` and a script `"test": "vitest run"`. Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

Run `npm install`.

- [ ] **Step 4: Write the failing test**

Create `src/hooks/useActivityFeed.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeFeedRow } from './useActivityFeed'

describe('normalizeFeedRow', () => {
  it('labels a purchase entry with a Purchase-prefixed title', () => {
    const row = { id: 1, customer_id: null, customer_name: '19 kg', type: 'purchase',
      product_id: 5, product_name: '19 kg', qty: 60, empties: 40, amount: 54000,
      note: null, created_by: null, created_at: 'x', updated_at: 'x', segment: 'commercial' } as any
    const out = normalizeFeedRow(row)
    expect(out.type).toBe('purchase')
    expect(out.title).toContain('Purchase')
  })
  it('keeps a sale entry titled by customer name', () => {
    const row = { id: 2, customer_id: 3, customer_name: 'Taj Kitchen', type: 'sale',
      product_id: 5, product_name: '19 kg', qty: 12, empties: 10, amount: 15600,
      note: null, created_by: null, created_at: 'x', updated_at: 'x', segment: 'commercial' } as any
    expect(normalizeFeedRow(row).title).toBe('Taj Kitchen')
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `normalizeFeedRow` not exported.

- [ ] **Step 6: Implement the hook + transform**

Replace `src/hooks/useActivityFeed.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ActivityEntry, Segment } from '../types/db'

export interface FeedItem extends ActivityEntry {
  title: string
}

export function normalizeFeedRow(row: ActivityEntry): FeedItem {
  const title = row.type === 'purchase' ? `Purchase · ${row.customer_name}` : row.customer_name
  return { ...row, title }
}

export function useActivityFeed(limit = 50, segment: Segment = 'commercial') {
  const [data, setData] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('segment', segment)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) setError(error.message)
    else setData((data as ActivityEntry[]).map(normalizeFeedRow))
    setLoading(false)
  }, [limit, segment])

  useEffect(() => { refresh() }, [refresh])
  return { data, loading, error, refresh }
}
```

- [ ] **Step 7: Run test + apply migration**

Run: `npm run test` → PASS.
Apply `db/2026-07-ui-redesign.sql` section 3 in Supabase.

- [ ] **Step 8: Verify build**

Run: `npm run build` (fix `ActivityFeed.tsx`/`Home.tsx` references to `entry.customer_name` → `entry.title` if the compiler flags them; those screens are fully restyled in Tasks 10/14, so a minimal compile-fix here is fine).
Expected: passes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "fix: purchases now appear in activity_feed; add feed transform + test"
```

---

## Phase 1 — Shared shell & components

### Task 4: AppHeader

**Files:**
- Create: `src/components/AppHeader.tsx`
- Consumes: `useAuth` (`profile`), `useAgencySettings` (`data.business_name`), `InitialsBadge`, `SwapIcon` from `icons.tsx`, `setMode`/`getMode` from `mode/mode.ts`.

**Interfaces:**
- Produces: `<AppHeader segment="commercial" | "domestic" onOpenAccount={() => void} />`.

- [ ] **Step 1: Implement AppHeader**

Create `src/components/AppHeader.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { InitialsBadge } from './InitialsBadge'
import { SwapIcon } from './icons'
import { setMode } from '../mode/mode'
import type { Segment } from '../types/db'

const initials = (s: string) => s.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

export function AppHeader({ segment, onOpenAccount }: { segment: Segment; onOpenAccount: () => void }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data } = useAgencySettings()
  const canSwitch = profile?.segment_access === 'both'
  const isCommercial = segment === 'commercial'
  const biz = data?.business_name || 'Cylinder Tracker'

  function switchSide() {
    const next = isCommercial ? 'domestic' : 'commercial'
    setMode(next)
    navigate(next === 'domestic' ? '/domestic' : '/', { replace: true })
  }

  return (
    <div className="flex items-center justify-between px-4 pb-3 pt-4">
      <div className="flex min-w-0 items-center gap-2">
        <div className={`flex h-[30px] w-[30px] items-center justify-center rounded-[10px] font-display text-[13px] font-bold text-white ${isCommercial ? 'bg-gradient-to-br from-accentSoft to-accent' : 'bg-gradient-to-br from-[#3DA06A] to-[#2E8B57]'}`}>
          {initials(biz)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-extrabold text-ink">{biz}</p>
          <p className="text-[9.5px] font-semibold text-subtle">
            {isCommercial ? 'Commercial' : 'Domestic'}{profile?.role ? ` · ${profile.role[0].toUpperCase()}${profile.role.slice(1)}` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-[9px]">
        {canSwitch && (
          <button
            onClick={switchSide}
            aria-label="Switch business side"
            className={`flex h-[34px] w-[34px] items-center justify-center rounded-[11px] ${isCommercial ? 'bg-[#E7F3EC]' : 'bg-[#FDE9DE]'}`}
          >
            <SwapIcon size={18} color={isCommercial ? '#2E8B57' : '#E4571B'} strokeWidth={2.2} />
          </button>
        )}
        <button onClick={onOpenAccount} aria-label="Account">
          <InitialsBadge name={profile?.name ?? '?'} size={34} radius={11} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes (component unused yet — that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/components/AppHeader.tsx
git commit -m "feat: shared AppHeader with mode switch + account button"
```

---

### Task 5: AccountMenu

**Files:**
- Create: `src/components/AccountMenu.tsx`
- Consumes: `BottomSheet` (slideUp), `useAuth` (`signOut`, `profile`), `useAgencySettings`, `InitialsBadge`, `Link`.

**Interfaces:**
- Produces: `<AccountMenu open={boolean} onClose={() => void} />`. Links: `/account/business`, `/account/pricing`, `/account/export`, and Sign out.

- [ ] **Step 1: Implement AccountMenu**

Create `src/components/AccountMenu.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { InitialsBadge } from './InitialsBadge'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const rowCls = 'flex items-center justify-between border-b border-[#F1E9DB] px-1 py-4 text-[14.5px] font-bold text-ink'

export function AccountMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, signOut } = useAuth()
  const { data } = useAgencySettings()
  return (
    <BottomSheet open={open} onClose={onClose} slideUp>
      <div className="mb-1 flex items-center gap-3 pb-4">
        <InitialsBadge name={profile?.name ?? '?'} size={52} radius={16} />
        <div>
          <p className="text-[17px] font-extrabold text-ink">{profile?.name}</p>
          <p className="text-[12.5px] font-semibold text-muted">
            {(data?.business_name || 'Cylinder Tracker')}{profile?.role ? ` · ${cap(profile.role)}` : ''}
          </p>
        </div>
      </div>
      <Link to="/account/business" onClick={onClose} className={rowCls}>Business details <span className="text-[#C0B4A2]">›</span></Link>
      <Link to="/account/pricing" onClick={onClose} className={rowCls}>Products &amp; pricing <span className="text-[#C0B4A2]">›</span></Link>
      <Link to="/account/export" onClick={onClose} className={`${rowCls} border-b-0`}>Export ledger <span className="text-[#C0B4A2]">›</span></Link>
      <button onClick={signOut} className="mt-3 h-[50px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-surface text-[15px] font-bold" style={{ color: '#C23B22' }}>
        Sign out
      </button>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build` → passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/AccountMenu.tsx
git commit -m "feat: account menu bottom sheet (replaces Account tab)"
```

---

### Task 6: BottomNav & DomesticNav — 3 tabs + centered FAB, context-aware

**Files:**
- Modify: `src/components/BottomNav.tsx`, `src/components/DomesticNav.tsx`
- Consumes: `AccountMenu`, `QuickAddSheet`, `useParams`/`useLocation`, icons.

**Interfaces:**
- Produces: reworked navs. `BottomNav` tabs = Home (`/`), Customers (`/customers`), Purchases (`/purchases`), Activity (`/activity`), with a centered `＋` opening `QuickAddSheet`. Both navs render the header-less bottom bar; the account menu is opened from `AppHeader`, so remove the Account tab entirely.

- [ ] **Step 1: Rework BottomNav**

Rewrite `src/components/BottomNav.tsx` to render exactly four tabs split around a centered elevated FAB: left = Home, Customers; right = Purchases, Activity; FAB centered. Visual target: `both-homes-v3.html` (commercial). Keep the existing `QuickAddSheet` wiring for the FAB. Context-aware scope: if `useLocation().pathname` matches `/customers/:id`, pass that id to `QuickAddSheet` so its Sale/Return/Payment links target `/customers/:id/...` (extend `QuickAddSheet` `onNavigate` base path accordingly). Tabs use `ActivityIcon` for Activity, `TruckIcon` for Purchases, `UsersIcon` for Customers, `HomeIcon` for Home. Active color `#E4571B`, inactive `#B0A594`.

```tsx
// nav layout skeleton (fill icons/labels per above)
<nav className="fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-[#EBE1D1] bg-cream/[.92] px-1 pb-[10px] backdrop-blur-md" style={{ height: 72 }}>
  {/* Home tab */}{/* Customers tab */}
  <div className="flex flex-1 justify-center">
    <button onClick={() => setQuickAddOpen(true)} className="-mt-6 flex h-[54px] w-[54px] items-center justify-center rounded-[18px] bg-accent shadow-[0_12px_24px_-8px_rgba(228,87,27,0.7)]">
      <PlusIcon size={28} color="#fff" strokeWidth={2.4} />
    </button>
  </div>
  {/* Purchases tab */}{/* Activity tab */}
</nav>
```

- [ ] **Step 2: Rework DomesticNav**

Rewrite `src/components/DomesticNav.tsx` the same way: left = Home (`/domestic`), Stock (`/domestic/stock`); right = Purchases (`/domestic/purchases`), History (`/domestic/history`); centered green FAB → `/domestic/bill`. Active color `#2E8B57`. Visual target: `both-homes-v3.html` (domestic).

- [ ] **Step 3: Verify build + preview**

Run: `npm run build` → passes.
Preview both sides: nav shows 3 tabs + centered `＋`; commercial `＋` opens QuickAdd, domestic `＋` → New bill.

- [ ] **Step 4: Commit**

```bash
git add src/components/BottomNav.tsx src/components/DomesticNav.tsx src/components/QuickAddSheet.tsx
git commit -m "feat: 3-tab nav with centered FAB, context-aware on customer pages"
```

---

### Task 7: DetailModal (centered dialog)

**Files:**
- Create: `src/components/DetailModal.tsx`
- Consumes: `BottomSheet` (centered, no slideUp), `formatCurrency`/`formatDate` from `utils/format`.

**Interfaces:**
- Produces: `<DetailModal open onClose title subtitle amount rows stamps actions />` where `rows: {k: string; v: string}[]`, `stamps: {created: string; updated: string}`, `actions?: ReactNode`.

- [ ] **Step 1: Implement DetailModal**

Create `src/components/DetailModal.tsx`:

```tsx
import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'

interface Row { k: string; v: string }
export function DetailModal({ open, onClose, icon, iconBg, iconColor, title, subtitle, amount, rows, created, updated, actions }: {
  open: boolean; onClose: () => void; icon: ReactNode; iconBg: string; iconColor: string
  title: string; subtitle?: string; amount?: string; rows: Row[]; created: string; updated: string; actions?: ReactNode
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-borderMuted pb-4">
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] text-[20px]" style={{ background: iconBg, color: iconColor }}>{icon}</div>
        <div className="min-w-0"><p className="font-display text-[17px] font-bold text-ink">{title}</p>{subtitle && <p className="text-[11.5px] font-semibold text-muted">{subtitle}</p>}</div>
        {amount && <p className="ml-auto font-display text-[20px] font-bold" style={{ color: iconColor }}>{amount}</p>}
      </div>
      <dl className="flex flex-col">
        {rows.map((r) => (
          <div key={r.k} className="flex justify-between border-b border-[#F1E9DB] py-[11px]">
            <dt className="text-[12.5px] font-semibold text-muted">{r.k}</dt>
            <dd className="text-right text-[13px] font-bold text-ink">{r.v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 rounded-[14px] bg-[#FBF7F0] px-[13px] py-[11px]">
        <div className="flex justify-between py-1"><span className="text-[10.5px] font-bold uppercase tracking-[0.4px] text-subtle">Created</span><span className="text-[11.5px] font-bold text-ink">{created}</span></div>
        <div className="flex justify-between py-1"><span className="text-[10.5px] font-bold uppercase tracking-[0.4px] text-subtle">Last updated</span><span className="text-[11.5px] font-bold text-ink">{updated}</span></div>
      </div>
      {actions && <div className="mt-4 flex gap-2">{actions}</div>}
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Verify build + commit**

Run: `npm run build` → passes.

```bash
git add src/components/DetailModal.tsx
git commit -m "feat: centered DetailModal for activity/history details"
```

---

### Task 8: CylindersCard

**Files:**
- Create: `src/components/CylindersCard.tsx`
- Consumes: `useGodownStock(segment)`, `useCustomerProductBalances`-style empties (Home commercial passes an `emptiesWithCustomers` map; domestic passes none). To stay simple, the component takes prepared data.

**Interfaces:**
- Produces: `<CylindersCard items={CardItem[]} accent="orange" | "green" linkLabel linkTo />` where `CardItem = { name: string; emptiesWithCustomers?: number; full: number; empty: number }`.

- [ ] **Step 1: Implement CylindersCard**

Create `src/components/CylindersCard.tsx`:

```tsx
import { Link } from 'react-router-dom'

export interface CardItem { name: string; emptiesWithCustomers?: number; full: number; empty: number }

export function CylindersCard({ items, accent, linkLabel, linkTo }: {
  items: CardItem[]; accent: 'orange' | 'green'; linkLabel: string; linkTo: string
}) {
  const bigColor = accent === 'orange' ? '#F26B2C' : '#2E8B57'
  const linkColor = accent === 'orange' ? 'text-accent' : 'text-[#2E8B57]'
  return (
    <div className="mt-[18px]">
      <div className="mb-[11px] flex items-center justify-between">
        <h2 className="font-display text-[19px] font-bold tracking-[-0.3px] text-ink">Cylinders</h2>
        <Link to={linkTo} className={`text-[13px] font-bold ${linkColor}`}>{linkLabel} ›</Link>
      </div>
      <div className="grid grid-cols-2 gap-[11px]">
        {items.map((it) => (
          <div key={it.name} className="rounded-[18px] bg-surface p-[14px] shadow-card">
            <span className="inline-block rounded-[10px] bg-ink px-[10px] py-[4px] font-display text-[11.5px] font-bold text-white">{it.name}</span>
            {it.emptiesWithCustomers !== undefined && (
              <>
                <p className="mt-3 font-display text-[28px] font-bold leading-none" style={{ color: bigColor }}>{it.emptiesWithCustomers}</p>
                <p className="mt-1 text-[10.5px] font-semibold text-subtle">empties with customers</p>
                <div className="my-[11px] h-px bg-borderMuted" />
              </>
            )}
            <div className={`flex gap-4 ${it.emptiesWithCustomers === undefined ? 'mt-[14px]' : ''}`}>
              <div><p className="font-display text-[21px] font-bold text-ink">{it.full}</p><p className="text-[10px] font-semibold text-subtle">full</p></div>
              <div><p className="font-display text-[21px] font-bold text-[#2E8B57]">{it.empty}</p><p className="text-[10px] font-semibold text-subtle">empty</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build + commit**

Run: `npm run build` → passes.

```bash
git add src/components/CylindersCard.tsx
git commit -m "feat: shared CylindersCard for Home stock summary"
```

---

## Phase 2 — Commercial screens

### Task 9: Home (Commercial)

**Files:**
- Modify: `src/pages/Home.tsx`
- Consumes: `AppHeader`, `AccountMenu`, `CylindersCard`, `useActivityFeed`, `useGodownStock('commercial')`, existing dashboard hooks in `Home.tsx`.

- [ ] **Step 1: Restyle Home**

Rework `src/pages/Home.tsx` to render, top to bottom: `<AppHeader segment="commercial" onOpenAccount={...}/>` + `<AccountMenu .../>` (local `open` state); dues hero (dark gradient) showing Outstanding dues + Empties out + Sold today (**remove Collected**); `<CylindersCard accent="orange" linkLabel="Godown" linkTo="/godown" items={...}/>` built from `useGodownStock('commercial')` (map `full_cylinders`→full, `empty_cylinders`→empty, and empties-with-customers from the existing balances hook); "Recent activity" section rendering the first 3 of `useActivityFeed(3)` with a purchase row variant (truck `🚚`/`TruckIcon`, orange) and a `See all ›` link to `/activity`. Visual target: commercial phone in `both-homes-v3.html`. Reuse `getActivityIcon`/`getActivityTint`, extending them for `'purchase'` in Task 14 Step 1 (do that step first if compiler complains).

- [ ] **Step 2: Verify build + preview**

Run: `npm run build` → passes.
Preview `/`: header with switch + avatar, dues hero (no Collected), Cylinders card, recent activity incl. a purchase row.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: redesign commercial Home (header, cylinders card, activity)"
```

---

### Task 10: activity icons + Activity page

**Files:**
- Modify: `src/utils/activityIcon.ts`, `src/pages/ActivityFeed.tsx`
- Consumes: `useActivityFeed`, `DetailModal`.

- [ ] **Step 1: Extend activity icon/tint for purchases**

In `src/utils/activityIcon.ts`, add a `'purchase'` case: icon `🚚` (or reuse a truck glyph), tint `{ bg: '#FDE7C9', color: '#B26A00' }`.

- [ ] **Step 2: Rework ActivityFeed**

Rewrite `src/pages/ActivityFeed.tsx`: `AppHeader` + `AccountMenu`, title "Activity", list rows from `useActivityFeed(50)` using `entry.title`, per-type subtitle (add `purchase` → `"Purchase · {qty} in"`). Tapping a row sets `selected` and opens `DetailModal` with rows built per type (sale: product/qty/empties/payment/note; purchase: product/qty/empties given/amount/note; payment: amount/method; return: product/qty), and `created`/`updated` via `formatDate(entry.created_at)`/`formatDate(entry.updated_at)`. Owner Edit/Delete actions (Edit only for customer transactions, linking to the tx edit route; purchases link to `/purchases/:id/edit`). Visual target: `activity-detail-modal.html`.

- [ ] **Step 3: Verify build + preview**

Run: `npm run build` → passes.
Preview `/activity`: rows include purchases; tap → centered popup with Created/Last updated.

- [ ] **Step 4: Commit**

```bash
git add src/utils/activityIcon.ts src/pages/ActivityFeed.tsx
git commit -m "feat: Activity page with purchase rows + centered detail popup"
```

---

### Task 11: Customers list — location

**Files:**
- Modify: `src/pages/Customers.tsx`
- Consumes: `AppHeader`, `AccountMenu`, `useCustomerBalances`, `useAllCustomerProductBalances`.

- [ ] **Step 1: Restyle + add location**

Rework `src/pages/Customers.tsx`: `AppHeader` + `AccountMenu`; title, count chips; search that also matches `address` (extend the filter predicate to include `(c.address ?? '').toLowerCase().includes(q)`); each row shows a location line `📍 {address || '—'} · {phone || 'No phone'}` (use `MapPinIcon`) under the name, keeping the empties pill + `₹ due`. Visual target: left phone in `customers-business.html`.

- [ ] **Step 2: Verify build + preview**

Run: `npm run build` → passes.
Preview `/customers`: rows show location; searching a locality filters.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Customers.tsx
git commit -m "feat: show customer location in the list + search by location"
```

---

### Task 12: StatementDialog

**Files:**
- Create: `src/components/StatementDialog.tsx`
- Consumes: `BottomSheet` (centered), existing `generatePdfHtml` logic (extract from `CustomerDetail.tsx` into a shared `src/utils/statement.ts` so the dialog and detail page both use it).

**Interfaces:**
- Produces: `<StatementDialog open onClose customer groups agency />`; period state (`this-month | last-month | all | custom` + custom `from`/`to`); actions Download PDF, WhatsApp, Print, Share. Consumes a `filterGroupsByPeriod(groups, period, from, to)` helper.

- [ ] **Step 1: Extract statement util**

Move `esc` + `generatePdfHtml` from `CustomerDetail.tsx` into `src/utils/statement.ts` and export them; add `filterGroupsByPeriod(groups, period, from?, to?)` that filters `HistoryGroup[]` by the `created_at` of their entries. Import back into `CustomerDetail.tsx` (Task 13).

- [ ] **Step 2: Implement StatementDialog**

Create `src/components/StatementDialog.tsx` with a centered `BottomSheet`: period segmented control (This month / Last month / All time / Custom) + custom date inputs when Custom; then four option rows — Download PDF (opens the print window like today), Share on WhatsApp (`https://wa.me/?text=` with a short summary + note to attach PDF, or `navigator.share` when available), Print (same as PDF then `window.print`), Share to other apps (`navigator.share({ files })` when supported, else fall back to download). Visual target: right phone in `customer-statement.html`.

- [ ] **Step 3: Verify build + commit**

Run: `npm run build` → passes.

```bash
git add src/components/StatementDialog.tsx src/utils/statement.ts
git commit -m "feat: statement dialog with period + share options"
```

---

### Task 13: Customer Detail

**Files:**
- Modify: `src/pages/CustomerDetail.tsx`
- Consumes: `StatementDialog`, `DetailModal`, `MapPinIcon`/`PhoneIcon`/`ShareIcon`, existing balance/tx hooks.

- [ ] **Step 1: Rework layout**

Rework `src/pages/CustomerDetail.tsx` to the approved layout: top bar (back to `/customers` + `⋯` menu holding Edit/Delete for owners); hero (avatar, name, `📍 location · phone`); **Call · Directions · Statement** row (Statement opens `StatementDialog`); dues hero card (Amount due + Empties out); **remove the Sale/Return/Payment button grid**; by-product cards (empties owed + sold/returned); day-grouped history with **decluttered rows** (title · relative time · amount + `Bal`). Tapping a row opens `DetailModal` (rows include empties, payment status/method, note, balance-after; `created`/`updated` stamps with `created_by`/`updated_by` resolved to names where available). Keep the edit-customer form (triggered from `⋯`). Visual target: `customer-detail-final-v3.html` (page) + `activity-detail-modal.html` (popup). The nav `＋` (Task 6) handles new entries scoped to this customer — do **not** add an in-page action button.

- [ ] **Step 2: Set updated_by on edits**

Where this screen deletes/edits transactions, and in `NewSale`/`LogReturn`/`RecordPayment` edit flows (Task 15), include `updated_by: session?.user.id` in the `update()` payload.

- [ ] **Step 3: Verify build + preview**

Run: `npm run build` → passes.
Preview `/customers/:id`: Call/Directions/Statement present; no Sale/Return/Payment row; history rows clean; tap → popup with Created/Last updated; Statement opens the dialog.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CustomerDetail.tsx
git commit -m "feat: redesign Customer Detail (statement dialog, clean history, no action row)"
```

---

### Task 14: Commercial action + purchase screens restyle

**Files:**
- Modify: `src/pages/NewSale.tsx`, `LogReturn.tsx`, `RecordPayment.tsx`, `AddCustomer.tsx`, `Purchases.tsx`, `RecordPurchase.tsx`, `Godown.tsx`, `SetCurrentStock.tsx`, `CylinderPricing.tsx`, `ExportLedger.tsx`, `Login.tsx`, `ModeSelect.tsx`

- [ ] **Step 1: Apply the shared language**

Restyle each screen with the new card language and, where they are top-level (reached from a tab), the light top bar with a back control. Consistency rules: white `rounded-[18px]/[20px] shadow-card` cards; `font-display` headings; `Space Grotesk` numerals; accent buttons `bg-gradient-to-br from-accentSoft to-accent`; `borderMuted` dividers. No structural/logic changes. Set `updated_by: session?.user.id` in any transaction/purchase `update()` in the edit flows. These screens have no new decisions — match the established look from the mocked screens.

- [ ] **Step 2: Verify build + preview each**

Run: `npm run build` → passes. Spot-check each route renders and its primary action still works (record a sale, a purchase, set stock).

- [ ] **Step 3: Commit**

```bash
git add src/pages
git commit -m "refactor: restyle commercial action/purchase/inventory screens"
```

---

### Task 15: Remove Reports

**Files:**
- Delete: `src/pages/Reports.tsx`, `src/hooks/useDailySummary.ts`, `src/hooks/useMonthlySummary.ts`, `src/hooks/useRevenueTrend.ts`
- Modify: `src/App.tsx` (remove `Reports` import + `/account/reports` route), `src/types/db.ts` (remove `DailyProductSummary`, `DailyMoneySummary`, `DailyPurchaseSummary`, `MonthlyProductSummary`, `MonthlyMoneySummary` if unused elsewhere)

- [ ] **Step 1: Delete and unwire**

```bash
git rm src/pages/Reports.tsx src/hooks/useDailySummary.ts src/hooks/useMonthlySummary.ts src/hooks/useRevenueTrend.ts
```

Remove the `Reports` import and `<Route path="/account/reports" ... />` from `src/App.tsx`. Grep for remaining references: `grep -rn "Reports\|useDailySummary\|useMonthlySummary\|useRevenueTrend" src` → expect none. Remove now-orphaned summary interfaces from `types/db.ts` (confirm no other importer via grep first).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes, no unresolved imports.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove unused Reports page and its hooks"
```

---

## Phase 3 — Domestic screens & routing

### Task 16: Domestic Home

**Files:**
- Modify: `src/pages/domestic/DomesticHome.tsx`
- Consumes: `AppHeader` (green), `AccountMenu`, `CylindersCard` (green), existing domestic hooks.

- [ ] **Step 1: Restyle**

Rework `DomesticHome.tsx`: `<AppHeader segment="domestic" .../>` + `<AccountMenu/>` (replaces the ad-hoc switch/sign-out buttons currently in the header); green "Sales today" hero (+ bills/cylinders subline); **remove the New bill / Stock in quick-action grid**; `<CylindersCard accent="green" linkLabel="All stock" linkTo="/domestic/stock" items={...}/>` (full/empty only, no empties-with-customers); "Today's bills" list with `History ›` and **no payment-method text**. Visual target: domestic phone in `both-homes-v3.html`.

- [ ] **Step 2: Verify build + preview + commit**

Run: `npm run build` → passes. Preview `/domestic`.

```bash
git add src/pages/domestic/DomesticHome.tsx
git commit -m "feat: redesign domestic Home (header, cylinders card, no quick-actions)"
```

---

### Task 17: NewBillTable + DomesticNewBill (no payment)

**Files:**
- Create: `src/components/NewBillTable.tsx`
- Modify: `src/pages/domestic/DomesticNewBill.tsx`

**Interfaces:**
- Produces: `NewBillTable` renders products grouped by kind as table rows (Item · Qty · Amount) with a preset tap-to-edit rate and inline auto-matched empties for cylinders; calls back with per-product qty/price/empties. `DomesticNewBill` owns state + submit.

- [ ] **Step 1: Build the table + rewire DomesticNewBill**

Create `NewBillTable.tsx` implementing the approved table: header row (Item / Qty / Amount), `KIND_LABEL` group rows, each product row with `name` + preset rate line (`₹{price} each`) that becomes an inline number input on tap (local `editingPriceId`), a compact `Stepper` for qty, and the computed amount. Cylinder rows show an inline "N empties in" auto-matched to qty with a small adjust control. A bill-total row closes the table. Visual target: `domestic-newbill-table-v3.html`.

In `DomesticNewBill.tsx`: keep the existing state model (qty/price/empties/match maps) and `handleSubmit`, but (a) render via `NewBillTable`, (b) **remove the payment-method segmented control** and insert rows with `method: null`, (c) keep the Note field and Save button pinned at the bottom, (d) keep date. Preserve `bill_id`, combos, empties logic.

- [ ] **Step 2: Verify build + preview**

Run: `npm run build` → passes.
Preview `/domestic/bill`: table rows, tap a rate to edit, qty steppers, empties auto-match, no Cash/UPI selector, save a multi-item bill → lands on `/domestic` with the bill listed.

- [ ] **Step 3: Commit**

```bash
git add src/components/NewBillTable.tsx src/pages/domestic/DomesticNewBill.tsx
git commit -m "feat: domestic New bill as editable table, payment removed"
```

---

### Task 18: Domestic History + remaining domestic screens

**Files:**
- Modify: `src/pages/domestic/DomesticHistory.tsx`, `DomesticStock.tsx`, `DomesticPurchases.tsx`, `DomesticRecordPurchase.tsx`, `DomesticCombos.tsx`

- [ ] **Step 1: History detail popup**

Rework `DomesticHistory.tsx`: `AppHeader` (green) + `AccountMenu`, day-grouped bills with per-day totals, **no payment text**; tapping a bill opens `DetailModal` showing the bill's line items, empties received, total, and Created/Last updated stamps. Visual target: `domestic-history-detail.html`.

- [ ] **Step 2: Restyle the rest**

Restyle `DomesticStock`, `DomesticPurchases`, `DomesticRecordPurchase`, `DomesticCombos` with the green card language + light top bars. No logic changes; set `updated_by` on any purchase edit.

- [ ] **Step 3: Verify build + preview + commit**

Run: `npm run build` → passes. Preview each domestic route.

```bash
git add src/pages/domestic
git commit -m "feat: domestic History detail popup + restyle domestic screens"
```

---

### Task 19: Routing & final cleanup

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Prune routes + confirm nav shell**

In `src/App.tsx`: confirm the Account tab route stays (`/account/business`, `/account/pricing`, `/account/export`) but there is **no** `/account` page route (the menu is a sheet) and **no** `/account/reports`. Ensure `Account.tsx` import is removed and the file deleted (`git rm src/pages/Account.tsx`). Confirm both navs render for their respective route groups (already handled by `isDomestic`), and screens no longer render their own switch/sign-out (now in `AppHeader`).

- [ ] **Step 2: Full build + broad preview**

Run: `npm run build`
Expected: passes, zero unresolved imports.
Preview: walk every route in both segments; verify no dead links to `/account` or `/account/reports`, switch works, account menu works, FAB works.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: prune routes, remove Account page, finalize nav shell"
```

---

## Self-Review

**Spec coverage:**
- Shell (AppHeader/switch/account menu) → Tasks 4–6, 19. Nav (3 tabs + centered FAB, context-aware) → Task 6. Home commercial (cylinders, no Collected, activity+purchase) → Task 9. Home domestic (no quick-actions) → Task 16. Customers location → Task 11. Customer Detail (statement dialog, clean history, no action row, nav-＋) → Tasks 12–13. Activity + centered popup + purchase rows → Tasks 3, 10. Domestic New bill (table, tap-edit rate, no payment) → Task 17. Domestic History popup → Task 18. Business details (GST/address) → Task 1. Timestamps (created/updated/updated_by) → Tasks 2, 10, 13, 14, 18. activity_feed purchases bug → Task 3. Removals (Reports, Account tab, Godown tab, domestic quick-actions, domestic payment) → Tasks 6, 9(implicit), 15, 16, 17, 19. Detail popups centered → Task 7. Statement options → Task 12. ✅ all covered.

**Placeholder scan:** Screen-restyle tasks (14, 18 Step 2) intentionally describe the consistency rules rather than emit full JSX for ~14 low-risk screens whose visuals are fixed by the shared components and the approved mockups; this is a deliberate scope decision, not a hidden TODO. All novel code (schema, hooks, six shared components, the feed transform) is given in full.

**Type consistency:** `ActivityEntry`/`FeedItem` (Task 3) used consistently in Tasks 9/10. `CardItem` (Task 8) used in 9/16. `AgencySettings` fields (Task 1) used in 1/13. `updated_by` set in 2/13/14/18. Nav routes match `App.tsx`. Consistent.

---

## Execution note

Verification per task is `npm run build` + browser-preview check (no unit runner except the Task 3 transform test). The saved mockups in `.superpowers/brainstorm/30285-1784055696/content/` are the visual source of truth; keep them open while implementing.
