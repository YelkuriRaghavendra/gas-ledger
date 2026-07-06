# Sale Tab "Smart List" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `src/pages/NewSale.tsx` so each product size is a slim row that expands into a full entry line on demand, with a sticky bottom total + Save bar.

**Architecture:** Pure presentation + local-state refactor of one page component. Split the form into three stacked cards (Customer+Date / Product rows / Payment) and add an `expanded: Set<number>` state controlling whether each product renders as a slim tappable row or a full Sold/Empties/Price line. Submit logic, hooks, routes, and the database are untouched.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind (2.0 warm-paper theme), `Stepper` component, `formatCurrency`.

## Global Constraints

- No new dependencies; Tailwind classes only.
- No changes to Supabase schema, hooks, or `App.tsx` routes.
- Submit behavior unchanged: create = one `transactions` insert per line with `qty > 0`; edit = single-row `update`. Validation rules unchanged.
- Empties start at `0` and are manual (no auto-mirror).
- Design tokens: cream `#F4EFE6`/`bg-cream`, surface white, ink `#1F1813`, accent `#E4571B`, secondary green `#2E8B57`, owed-red `#C23B22`. Cards use `bg-surface shadow-card`, no borders.
- The app's `BottomNav` is `fixed` at the viewport bottom, **80px** tall, and IS present on this route — any fixed bottom UI must sit above it (`bottom-[80px]`).
- No automated test framework exists. Every task verifies with `npx tsc -b` (typecheck, expect no errors) plus the manual preview checks listed, then commits.

**Starting point:** `src/pages/NewSale.tsx` already has uncommitted working-tree changes (the current form). All line references below are to that working-tree version. Read the whole file before Task 1.

---

### Task 1: Slim product rows with expand/collapse (create mode)

Restructure the form body into three cards and render each product as a slim row until expanded. Keep the existing bottom total banner + Save button for now (replaced in Task 3).

**Files:**
- Modify: `src/pages/NewSale.tsx`

**Interfaces:**
- Consumes: existing state `qtyByProduct`, `emptiesByProduct`, `priceByProduct`, helpers `setQty/setEmpties/setPrice`, `ownedFor`, `shownProducts`, `saleTotal`, style consts `fieldLabel`/`fieldInput`/`segBtn`.
- Produces: new state `expanded: Set<number>` and helpers `expand(pid)`, `collapse(pid)` used by Tasks 2–4.

- [ ] **Step 1: Add expand state + helpers**

Add below the existing `const editing = Boolean(txId)` line:

```tsx
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const expand = (pid: number) => setExpanded((s) => new Set(s).add(pid))
  const collapse = (pid: number) => {
    setExpanded((s) => {
      const n = new Set(s)
      n.delete(pid)
      return n
    })
    setQtyByProduct((s) => {
      const n = { ...s }
      delete n[pid]
      return n
    })
    setEmptiesByProduct((s) => {
      const n = { ...s }
      delete n[pid]
      return n
    })
    setPriceByProduct((s) => ({ ...s, [pid]: String(products.find((p) => p.id === pid)?.price || '') }))
  }
```

- [ ] **Step 2: Replace the form body markup**

Replace the entire `<form onSubmit={handleSubmit}> ... </form>` block (currently the single big `rounded-[24px]` card plus the total banner, error, and submit button) with the three-card structure below. This keeps the total banner + submit button unchanged at the bottom (Task 3 replaces them).

```tsx
      <form onSubmit={handleSubmit}>
        {/* Customer + Date */}
        <div className="rounded-[20px] bg-surface p-4 shadow-card">
          <div className="flex gap-3">
            <div className="flex-1">
              <p className={fieldLabel}>Customer</p>
              <select
                value={customerId ?? ''}
                onChange={(e) => setCustomerId(Number(e.target.value))}
                disabled={editing}
                className={`${fieldInput} appearance-none disabled:opacity-60`}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <p className={fieldLabel}>Date</p>
              <input
                type="date"
                value={date}
                max={todayInputValue()}
                onChange={(e) => setDate(e.target.value)}
                className={fieldInput}
              />
            </div>
          </div>
        </div>

        {!editing && (
          <p className="mb-2 mt-4 px-1 text-[12px] font-semibold text-subtle">Add each size you're selling.</p>
        )}

        {/* Product rows */}
        <div className="mt-3 space-y-[10px]">
          {shownProducts.map((p) => {
            const isOpen = editing || expanded.has(p.id)
            const qty = qtyByProduct[p.id] ?? 0
            const lineTotal = qty * Number(priceByProduct[p.id] || 0)

            if (!isOpen) {
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => expand(p.id)}
                  className="flex w-full items-center justify-between rounded-[16px] bg-surface px-4 py-[15px] shadow-card"
                >
                  <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
                    {p.name}
                  </span>
                  <span className="text-[13px] font-bold text-accent">+ Add to sale</span>
                </button>
              )
            }

            return (
              <div key={p.id} className="rounded-[20px] bg-surface p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
                      {p.name}
                    </span>
                    {qty > 0 && (
                      <span className="text-[11px] font-bold text-muted">
                        ×{qty} · {formatCurrency(lineTotal)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={fieldLabel}>Sold</p>
                    <Stepper value={qtyByProduct[p.id] ?? 0} onChange={(v) => setQty(p.id, v)} min={editing ? 1 : 0} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={fieldLabel}>Empties taken</p>
                    <Stepper value={emptiesByProduct[p.id] ?? 0} onChange={(v) => setEmpties(p.id, v)} min={0} variant="secondary" />
                  </div>
                </div>
                <div className="mt-3">
                  <p className={fieldLabel}>Price each (₹)</p>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceByProduct[p.id] ?? ''}
                    onChange={(e) => setPrice(p.id, e.target.value)}
                    className={fieldInput}
                  />
                </div>
                <p className="mt-2 text-[12px] font-semibold text-muted">
                  Customer owes <span className="font-bold text-[#C23B22]">{ownedFor(p.id)}</span> {p.name} empties
                </p>
              </div>
            )
          })}
        </div>

        {/* Payment */}
        <div className="mt-4 rounded-[20px] bg-surface p-4 shadow-card">
          <p className={fieldLabel}>Payment</p>
          <div className="flex gap-2 rounded-[14px] bg-cream p-[5px]">
            <button type="button" onClick={() => setReceived(false)} className={segBtn(!received)}>
              On credit
            </button>
            <button type="button" onClick={() => setReceived(true)} className={segBtn(received)}>
              Received now
            </button>
          </div>
          {received && (
            <>
              <div className="mt-4">
                <p className={fieldLabel}>Payment method</p>
                <div className="flex gap-2 rounded-[14px] bg-cream p-[5px]">
                  <button type="button" onClick={() => setMethod('cash')} className={segBtn(method === 'cash')}>
                    Cash
                  </button>
                  <button type="button" onClick={() => setMethod('upi')} className={segBtn(method === 'upi')}>
                    UPI
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <p className={fieldLabel}>Note (optional)</p>
                <input
                  placeholder="e.g. Paid via GPay"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={`${fieldInput} font-semibold`}
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between rounded-[20px] bg-gradient-to-br from-[#FBEDE4] to-[#F7DFC9] p-5">
          <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#9A6A4A]">Sale total</span>
          <span className="font-display text-[30px] font-bold leading-none text-ink">{formatCurrency(saleTotal)}</span>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save sale'}
        </button>
      </form>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (If `formatCurrency` is not already imported, it is — line 10 imports it; confirm.)

- [ ] **Step 4: Manual preview verification**

Start the dev server and open `/sale`. Verify:
- All sizes appear as slim "+ Add to sale" rows; none show steppers initially.
- Tapping a row expands it into Sold/Empties/Price with the "Customer owes X empties" helper; price is prefilled from the product default.
- Setting a qty and saving records the sale (redirects to the customer). A multi-size sale (two rows expanded, both qty > 0) creates two rows.

- [ ] **Step 5: Commit**

```bash
git add src/pages/NewSale.tsx
git commit -m "feat(ui): slim expandable product rows on New Sale (Smart List)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Remove/collapse affordance on expanded lines (create mode)

Add a "Remove" control to expanded lines so staff can collapse a size back to a slim row and reset it. Hidden in edit mode.

**Files:**
- Modify: `src/pages/NewSale.tsx`

**Interfaces:**
- Consumes: `collapse(pid)` from Task 1, `editing`.
- Produces: none.

- [ ] **Step 1: Add the Remove button to the expanded line header**

In the expanded-line header `<div className="flex items-center justify-between">` (added in Task 1), add a Remove button as the second child, after the `<div className="flex items-center gap-2">…</div>`:

```tsx
                  {!editing && (
                    <button
                      type="button"
                      onClick={() => collapse(p.id)}
                      className="text-[13px] font-bold text-muted active:scale-95"
                    >
                      Remove
                    </button>
                  )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Manual preview verification**

On `/sale`: expand a size, set qty 3 and a price, confirm the header shows `×3 · ₹…`. Tap **Remove** → the row collapses back to "+ Add to sale", and re-expanding it shows Sold 0 / Empties 0 with the price reset to the product default.

- [ ] **Step 4: Commit**

```bash
git add src/pages/NewSale.tsx
git commit -m "feat(ui): add Remove/collapse control to New Sale product lines

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Sticky total + Save bar

Replace the inline total banner and Save button with a fixed bar pinned above the 80px bottom nav; pad the page so content clears it.

**Files:**
- Modify: `src/pages/NewSale.tsx`

**Interfaces:**
- Consumes: `saleTotal`, `saving`, `editing`, `error`.
- Produces: none.

- [ ] **Step 1: Pad the page container**

Change the outer wrapper from:

```tsx
    <div className="p-5 pb-10 pt-3">
```

to:

```tsx
    <div className="p-5 pb-[172px] pt-3">
```

- [ ] **Step 2: Remove the old total banner + submit button**

Delete this block (added verbatim in Task 1, sitting just before `</form>`):

```tsx
        <div className="mt-4 flex items-end justify-between rounded-[20px] bg-gradient-to-br from-[#FBEDE4] to-[#F7DFC9] p-5">
          <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#9A6A4A]">Sale total</span>
          <span className="font-display text-[30px] font-bold leading-none text-ink">{formatCurrency(saleTotal)}</span>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save sale'}
        </button>
```

- [ ] **Step 3: Add the sticky bar as the last child inside `<form>`**

Immediately before `</form>`, add:

```tsx
        <div className="fixed inset-x-0 bottom-[80px] z-30 px-5">
          {error && (
            <p className="mb-2 rounded-[12px] bg-surface px-4 py-2 text-sm font-semibold text-red-600 shadow-card">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between rounded-[18px] bg-gradient-to-br from-accentSoft to-accent p-3 pl-5 shadow-glow">
            <div className="text-white">
              <p className="text-[10px] font-bold uppercase tracking-[0.5px] opacity-90">Sale total</p>
              <p className="font-display text-[26px] font-bold leading-none">{formatCurrency(saleTotal)}</p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-[14px] bg-surface px-6 py-3 text-[15px] font-bold text-accent shadow-card transition active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save sale'}
            </button>
          </div>
        </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Manual preview verification**

On `/sale`: the total + Save bar is pinned at the bottom, sitting just above the bottom nav (not overlapping it). Scroll the form — the bar stays put and the last field (Payment card / note) is fully visible above the bar, not hidden behind it. Trigger a validation error (e.g. save with no qty) → the error appears just above the bar. Save works.

- [ ] **Step 6: Commit**

```bash
git add src/pages/NewSale.tsx
git commit -m "feat(ui): sticky total + Save bar on New Sale

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Confirm edit-mode behavior

Edit mode must show exactly one pre-expanded line, no slim rows, no Remove. Task 1 already routes edit lines through `isOpen = editing || …` and gates Remove on `!editing`; this task seeds `expanded` for consistency and verifies the full edit flow.

**Files:**
- Modify: `src/pages/NewSale.tsx`

**Interfaces:**
- Consumes: the edit-loading `useEffect` that sets `editProductId` and other fields; `shownProducts` (already filters to the single edited product in edit mode).
- Produces: none.

- [ ] **Step 1: Seed expanded set when loading an edit**

In the edit-loading `useEffect` (the one guarded by `if (!editing || loadedEdit) return`), add this line right after `setEditProductId(tx.product_id)`:

```tsx
    setExpanded(new Set([tx.product_id]))
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Manual preview verification**

From a customer with an existing sale, open the sale's edit route (`/customers/:id/sale/:txId/edit`). Verify:
- Exactly one product line, pre-expanded, showing the saved qty/empties/price.
- No "+ Add to sale" slim rows for other sizes and no "Remove" control.
- Customer select is disabled; the Save button reads "Save changes".
- Changing qty and saving updates the transaction and returns to the customer detail.

- [ ] **Step 4: Commit**

```bash
git add src/pages/NewSale.tsx
git commit -m "feat(ui): seed expanded line for New Sale edit mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Header — unchanged (untouched). ✓
- Customer + Date card — Task 1 Step 2. ✓
- Product slim rows → expand → full line with owes helper — Task 1. ✓
- Line summary header + Remove/collapse — Task 1 (summary) + Task 2 (Remove). ✓
- Payment card unchanged — Task 1 Step 2. ✓
- Sticky total + Save bar, error above it, content padding — Task 3. ✓
- Empties manual start 0 — preserved (no auto-mirror added anywhere). ✓
- Edit mode single pre-expanded line, no add/remove — Task 1 (`isOpen`/`!editing` gates) + Task 4 (seed). ✓
- No data/hook/route changes — no such edits in any task. ✓
- Validation unchanged — `handleSubmit` untouched. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `expand(pid: number)`, `collapse(pid: number)`, `expanded: Set<number>` used consistently across Tasks 1–4. `formatCurrency` already imported at line 10. `Stepper` props match its signature (`value`, `onChange`, `min`, `variant`). ✓
