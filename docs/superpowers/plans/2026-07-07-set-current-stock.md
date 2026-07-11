# Set Current Stock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Set Current Stock" page to the Godown screen that lets users enter their actual physical cylinder counts, and creates catch-up purchase entries so the `godown_stock` view displays the correct numbers.

**Architecture:** A new page (`SetCurrentStock`) at `/godown/set-stock` queries existing totals from `transactions` and `purchases`, computes the delta needed per product, and inserts one purchase row per product with `note = 'Opening stock adjustment'`. The Godown page conditionally shows a "Set Current Stock" button only when no such adjustment purchase exists yet.

**Tech Stack:** React, TypeScript, Supabase client, Tailwind CSS (existing design system)

## Global Constraints

- Follow the existing design system in `docs/redesign-system.md` (warm paper aesthetic, Tailwind classes, rounded cards, Space Grotesk headings)
- No database schema or view changes
- No new dependencies
- `npx tsc -b --noEmit` and `npm run build` must pass

---

### Task 1: Create the SetCurrentStock page

**Files:**
- Create: `src/pages/SetCurrentStock.tsx`

**Interfaces:**
- Consumes: `useProducts()` → `Product[]`, `useGodownStock()` → `GodownStock[]`, `useAuth()` → `{ session }`, `supabase` client
- Produces: Route-ready React component `SetCurrentStock`

- [ ] **Step 1: Create `src/pages/SetCurrentStock.tsx` with the full page**

The page needs to:
1. Load products and current godown stock
2. Show per-product inputs for "Full cylinders" and "Empty cylinders", pre-filled with current godown_stock values (clamped to 0 if negative)
3. On submit, query the raw totals from `transactions` and `purchases` to compute the delta
4. Insert one purchase row per product with the computed `qty` and `empties_given`

```tsx
import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'
import { useGodownStock } from '../hooks/useGodownStock'
import { Stepper } from '../components/Stepper'
import { ChevronLeftIcon } from '../components/icons'

export function SetCurrentStock() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: products } = useProducts()
  const { data: stock, loading } = useGodownStock()

  const [fullByProduct, setFullByProduct] = useState<Record<number, number>>({})
  const [emptyByProduct, setEmptyByProduct] = useState<Record<number, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (stock.length === 0) return
    setFullByProduct((prev) => {
      const next = { ...prev }
      let changed = false
      for (const s of stock) {
        if (next[s.product_id] === undefined) {
          next[s.product_id] = Math.max(0, s.full_cylinders)
          changed = true
        }
      }
      return changed ? next : prev
    })
    setEmptyByProduct((prev) => {
      const next = { ...prev }
      let changed = false
      for (const s of stock) {
        if (next[s.product_id] === undefined) {
          next[s.product_id] = Math.max(0, s.empty_cylinders)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [stock])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const rows: Array<{
        product_id: number
        qty: number
        empties_given: number
        amount: number
        paid: boolean
        method: null
        note: string
        created_by: string | undefined
      }> = []

      for (const p of products) {
        const desiredFull = fullByProduct[p.id] ?? 0
        const desiredEmpty = emptyByProduct[p.id] ?? 0

        // Get total sales qty for this product
        const { data: salesData } = await supabase
          .from('transactions')
          .select('qty')
          .eq('product_id', p.id)
          .eq('type', 'sale')
        const totalSalesQty = (salesData ?? []).reduce((sum, r) => sum + r.qty, 0)

        // Get total sale empties + returns for this product
        const { data: saleEmptiesData } = await supabase
          .from('transactions')
          .select('empties')
          .eq('product_id', p.id)
          .eq('type', 'sale')
        const totalSaleEmpties = (saleEmptiesData ?? []).reduce((sum, r) => sum + r.empties, 0)

        const { data: returnsData } = await supabase
          .from('transactions')
          .select('qty')
          .eq('product_id', p.id)
          .eq('type', 'return')
        const totalReturns = (returnsData ?? []).reduce((sum, r) => sum + r.qty, 0)

        // Get existing purchases (excluding any prior adjustment)
        const { data: purchasesData } = await supabase
          .from('purchases')
          .select('qty, empties_given')
          .eq('product_id', p.id)
          .neq('note', 'Opening stock adjustment')
        const existingPurchaseQty = (purchasesData ?? []).reduce((sum, r) => sum + r.qty, 0)
        const existingEmptiesGiven = (purchasesData ?? []).reduce((sum, r) => sum + r.empties_given, 0)

        // Back-calculate:
        // full = total_purchases - total_sales => catch_up_qty = desired_full + total_sales - existing_purchases
        const catchUpQty = desiredFull + totalSalesQty - existingPurchaseQty

        // empty = (sale_empties + returns) - total_empties_given => catch_up_empties = (sale_empties + returns) - existing_empties_given - desired_empty
        const catchUpEmptiesGiven = (totalSaleEmpties + totalReturns) - existingEmptiesGiven - desiredEmpty

        rows.push({
          product_id: p.id,
          qty: Math.max(0, catchUpQty),
          empties_given: Math.max(0, catchUpEmptiesGiven),
          amount: 0,
          paid: true,
          method: null,
          note: 'Opening stock adjustment',
          created_by: session?.user.id,
        })
      }

      // Delete any prior adjustment purchases (in case this somehow runs twice)
      await supabase.from('purchases').delete().eq('note', 'Opening stock adjustment')

      const { error: insertError } = await supabase.from('purchases').insert(rows)
      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }

      navigate('/godown')
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
      setSaving(false)
    }
  }

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to="/godown" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-2 font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Set current stock</h1>
      <p className="mb-5 text-[13px] font-medium leading-[1.5] text-subtle">
        Count the cylinders physically in your godown right now and enter the numbers below. The app will adjust automatically.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.id} className="rounded-[18px] bg-surface p-[18px] shadow-card">
              <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
                {p.name}
              </span>
              <div className="mt-4 flex gap-4">
                <div className="flex-1">
                  <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Full cylinders</p>
                  <Stepper
                    value={fullByProduct[p.id] ?? 0}
                    onChange={(v) => setFullByProduct((s) => ({ ...s, [p.id]: v }))}
                    min={0}
                    tone="surface"
                    size="sm"
                  />
                </div>
                <div className="flex-1">
                  <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Empty cylinders</p>
                  <Stepper
                    value={emptyByProduct[p.id] ?? 0}
                    onChange={(v) => setEmptyByProduct((s) => ({ ...s, [p.id]: v }))}
                    min={0}
                    tone="surface"
                    size="sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save stock'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc -b --noEmit`
Expected: 0 errors

---

### Task 2: Add route and update Godown page

**Files:**
- Modify: `src/App.tsx` (add route)
- Modify: `src/pages/Godown.tsx` (add "Set Current Stock" button, hidden when adjustment exists)

**Interfaces:**
- Consumes: `SetCurrentStock` component from Task 1, `usePurchases()` hook
- Produces: Working navigation between Godown ↔ SetCurrentStock

- [ ] **Step 1: Add the route in `src/App.tsx`**

Add import at top:
```tsx
import { SetCurrentStock } from './pages/SetCurrentStock'
```

Add route inside the `<ProtectedRoute>` block, after the `/godown` route:
```tsx
<Route path="/godown/set-stock" element={<SetCurrentStock />} />
```

- [ ] **Step 2: Update `src/pages/Godown.tsx` to show/hide the button**

Add imports:
```tsx
import { usePurchases } from '../hooks/usePurchases'
```

Inside the component, after the existing hooks:
```tsx
const { data: purchases } = usePurchases()
const hasAdjustment = purchases.some((p) => p.note === 'Opening stock adjustment')
```

Add the button after the `<h1>` heading, before the grid, only when no adjustment exists:
```tsx
{!hasAdjustment && (
  <Link
    to="/godown/set-stock"
    className="mb-4 flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-accent bg-[#FBEDE4] text-[14px] font-bold text-accent"
  >
    Set current stock
  </Link>
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/SetCurrentStock.tsx src/App.tsx src/pages/Godown.tsx
git commit -m "feat: add Set Current Stock page for godown opening balance"
```
