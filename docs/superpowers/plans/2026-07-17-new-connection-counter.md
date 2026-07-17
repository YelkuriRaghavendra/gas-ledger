# New Connection Sold Counter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-flaggable "New Connections sold" counter to the domestic sales summaries, without altering existing cylinder counts or stock math.

**Architecture:** A new `products.is_new_connection` boolean marks which combos count. Screens derive the count client-side from data they already load (a pure helper over domestic bills), then render it on DomesticHome and DomesticHistory. No new SQL view; no commercial changes.

**Tech Stack:** React 18 + TypeScript, Supabase (Postgres), Vite, Vitest (node env), Tailwind.

## Global Constraints

- Domestic segment only. No commercial screen changes. No changes to `godown_stock` view or `cylindersSoldToday`.
- Verification gate for every task touching TS/TSX: `npx tsc -b --noEmit` = 0 errors AND `npm run build` succeeds.
- Follow `docs/redesign-system.md`: domestic green accent `#2E8B57`, checkbox style from `NewSale.tsx` (`h-[16px] w-[16px]`).
- Count `qty` (not line count): one bill selling 2 New Connections counts as 2.
- The NC clause/tile renders only when the count is `> 0`.
- Spec: `docs/superpowers/specs/2026-07-17-new-connection-counter-design.md`.

---

### Task 1: Schema + type for `is_new_connection`

**Files:**
- Create: `db/2026-07-17-new-connection-flag.sql`
- Modify: `db/schema.sql:41-55` (products table block)
- Modify: `src/types/db.ts:16-27` (`Product` interface)

**Interfaces:**
- Produces: `Product.is_new_connection: boolean`; DB column `public.products.is_new_connection boolean not null default false`.

- [ ] **Step 1: Write the migration file**

Create `db/2026-07-17-new-connection-flag.sql`:

```sql
-- Adds a per-product flag marking a combo as a "New Connection" so its
-- sales are counted in the domestic New-Connections-sold summaries.
-- Safe to run on the live DB (idempotent, additive, defaults false).
alter table public.products
  add column if not exists is_new_connection boolean not null default false;
```

- [ ] **Step 2: Mirror the column into the canonical schema**

In `db/schema.sql`, inside the `create table if not exists public.products (...)` block, add the column after the `active` line (currently `active boolean not null default true,`):

```sql
  active             boolean     not null default true,
  is_new_connection  boolean     not null default false,
  sort_order         int         not null default 0,
```

- [ ] **Step 3: Add the field to the `Product` type**

In `src/types/db.ts`, add to the `Product` interface after `active: boolean`:

```ts
  active: boolean
  is_new_connection: boolean
  sort_order: number
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc -b --noEmit`
Expected: 0 errors. (`useProducts` selects `*`, so the new field is populated automatically once the DB column exists; no query change needed.)

- [ ] **Step 5: Commit**

```bash
git add db/2026-07-17-new-connection-flag.sql db/schema.sql src/types/db.ts
git commit -m "feat: add products.is_new_connection flag + type"
```

---

### Task 2: `countNewConnections` pure helper (TDD)

**Files:**
- Create: `src/utils/newConnection.ts`
- Test: `src/utils/newConnection.test.ts`

**Interfaces:**
- Consumes: `DomesticBill` (type-only) from `src/hooks/useDomesticSales.ts` — shape `{ lines: { product_id: number | null; qty: number }[] }`.
- Produces: `countNewConnections(bills: DomesticBill[], ncProductIds: Set<number>): number`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/newConnection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { countNewConnections } from './newConnection'

const bill = (lines: Array<{ product_id: number | null; qty: number }>) =>
  ({ lines } as any)

describe('countNewConnections', () => {
  it('returns 0 when no combos are flagged', () => {
    expect(countNewConnections([bill([{ product_id: 5, qty: 3 }])], new Set())).toBe(0)
  })

  it('sums qty of flagged-combo lines across bills', () => {
    const bills = [bill([{ product_id: 8, qty: 2 }]), bill([{ product_id: 8, qty: 1 }])]
    expect(countNewConnections(bills, new Set([8]))).toBe(3)
  })

  it('ignores non-flagged and cylinder lines in a mixed bill', () => {
    const bills = [bill([{ product_id: 1, qty: 5 }, { product_id: 8, qty: 1 }])]
    expect(countNewConnections(bills, new Set([8]))).toBe(1)
  })

  it('skips lines with a null product_id', () => {
    const bills = [bill([{ product_id: null, qty: 4 }, { product_id: 8, qty: 2 }])]
    expect(countNewConnections(bills, new Set([8]))).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/newConnection.test.ts`
Expected: FAIL — cannot resolve `./newConnection` / `countNewConnections is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/newConnection.ts`:

```ts
import type { DomesticBill } from '../hooks/useDomesticSales'

// Count of New Connections sold = sum of qty across sale lines whose product
// is a flagged combo (products.is_new_connection). `import type` is erased at
// compile, so this pulls in no supabase runtime code.
export function countNewConnections(bills: DomesticBill[], ncProductIds: Set<number>): number {
  return bills.reduce(
    (sum, b) =>
      sum +
      b.lines.reduce(
        (s, l) => s + (l.product_id !== null && ncProductIds.has(l.product_id) ? l.qty : 0),
        0,
      ),
    0,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/newConnection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/newConnection.ts src/utils/newConnection.test.ts
git commit -m "feat: countNewConnections helper + tests"
```

---

### Task 3: "Count as New Connection" toggle in the Combos editor

**Files:**
- Modify: `src/pages/domestic/DomesticCombos.tsx` (state, `openEditor`, `handleSave`, editor JSX)

**Interfaces:**
- Consumes: `Product.is_new_connection` (Task 1); `refreshProducts` (already destructured at line 14).
- Produces: persisted `products.is_new_connection` for the edited combo.

- [ ] **Step 1: Add flag state**

In `DomesticCombos.tsx`, after the `qtyByComponent` state (line 18), add:

```ts
  const [ncFlag, setNcFlag] = useState(false)
```

- [ ] **Step 2: Seed the flag when opening the editor**

In `openEditor(p: Product)`, after `setQtyByComponent(current)` (line 37), add:

```ts
    setNcFlag(p.is_new_connection)
```

- [ ] **Step 3: Persist the flag in `handleSave`**

In `handleSave`, after the `bundle_components` insert block (after line 120, before `setSaving(false)` at line 121), add the product update, then refresh products:

```ts
    const { error: prodError } = await supabase
      .from('products')
      .update({ is_new_connection: ncFlag })
      .eq('id', editing.id)
    if (prodError) {
      setError(prodError.message)
      setSaving(false)
      return
    }
    setSaving(false)
    setEditing(null)
    await refreshProducts()
    refresh()
```

Replace the existing trailing `setSaving(false)`, `setEditing(null)`, `refresh()` lines (121-123) with the block above so they are not duplicated.

- [ ] **Step 4: Add the toggle to the editor sheet**

In the edit BottomSheet, immediately after the components list `</div>` (line 243, the one closing `flex max-h-[50vh] ...`) and before the `{error && ...}` line (244), add:

```tsx
            <label className="mt-4 flex cursor-pointer items-center gap-[8px] text-[12px] font-semibold text-muted">
              <input
                type="checkbox"
                checked={ncFlag}
                onChange={(e) => setNcFlag(e.target.checked)}
                className="h-[16px] w-[16px] accent-[#2E8B57]"
              />
              Count as New Connection
            </label>
```

- [ ] **Step 5: Verify build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 6: Manual verify**

In domestic mode → Stock → Combos, open a combo, tick "Count as New Connection", Save. Reopen the same combo: the box stays ticked (proves persistence + `refreshProducts`).

- [ ] **Step 7: Commit**

```bash
git add src/pages/domestic/DomesticCombos.tsx
git commit -m "feat: flag combos as New Connection in Combos editor"
```

---

### Task 4: Show NC count on DomesticHome today-summary

**Files:**
- Modify: `src/pages/domestic/DomesticHome.tsx` (import, derive count, render clause)

**Interfaces:**
- Consumes: `countNewConnections` (Task 2); `products`, `bills` (already loaded at lines 19, 22).

- [ ] **Step 1: Import the helper**

After the existing imports (after line 9's `CylindersCard` import), add:

```ts
import { countNewConnections } from '../../utils/newConnection'
```

- [ ] **Step 2: Derive the count**

After `cylindersSoldToday` is computed (after line 30), add:

```ts
  const ncProductIds = new Set(products.filter((p) => p.is_new_connection).map((p) => p.id))
  const newConnectionsSold = countNewConnections(bills, ncProductIds)
```

- [ ] **Step 3: Render the clause**

In the summary `<p>` (lines 66-69), after the `{cylindersSoldToday === 1 ? '' : 's'} sold` text and before the closing `</p>`, append:

```tsx
                {newConnectionsSold > 0 && (
                  <>
                    {' · '}
                    {newConnectionsSold} New Connection{newConnectionsSold === 1 ? '' : 's'}
                  </>
                )}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 5: Manual verify**

With a combo flagged (Task 3), create a domestic bill including it. DomesticHome hero line shows `… · 1 New Connection`; the `cylinders sold` number is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/pages/domestic/DomesticHome.tsx
git commit -m "feat: show New Connections sold on DomesticHome"
```

---

### Task 5: Show per-day NC count on DomesticHistory

**Files:**
- Modify: `src/pages/domestic/DomesticHistory.tsx` (import, derive ids, render per-day clause)

**Interfaces:**
- Consumes: `countNewConnections` (Task 2); `products` (loaded at line 72), `g.bills` per day group.

- [ ] **Step 1: Import the helper**

After the existing imports (after line 10's `DetailModal` import), add:

```ts
import { countNewConnections } from '../../utils/newConnection'
```

- [ ] **Step 2: Derive the flagged ids once**

After `const groups = groupByDay(bills)` (line 78), add:

```ts
  const ncProductIds = new Set(products.filter((p) => p.is_new_connection).map((p) => p.id))
```

- [ ] **Step 3: Render per-day count in the group header**

In the group header `<p>` (lines 108-110), after `{g.bills.length} bill{g.bills.length === 1 ? '' : 's'}` and before the closing `</p>`, append:

```tsx
                    {(() => {
                      const nc = countNewConnections(g.bills, ncProductIds)
                      return nc > 0 ? ` · ${nc} NC` : null
                    })()}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 5: Manual verify**

DomesticHistory → the day that has an NC bill shows `₹… · N bills · 1 NC` in its header.

- [ ] **Step 6: Commit**

```bash
git add src/pages/domestic/DomesticHistory.tsx
git commit -m "feat: show per-day New Connections on DomesticHistory"
```

---

## Notes

- The DB migration (`db/2026-07-17-new-connection-flag.sql`) must be run against the live Supabase DB before the flag persists in production. Until then the column defaults false and the counter reads 0 — degrades gracefully.
- No historical backfill: flagging a combo counts its past bills too, since the flag lives on the product, not the bill.
