# Sale Tab Redesign — "Smart List" (design)

**Date:** 2026-07-06
**Scope:** Rework the presentation and local state of `src/pages/NewSale.tsx` (the "Record a sale" / "Edit sale" screen). No database, hook, or route changes.

## Goal

Restructure the Sale form for less on-screen clutter on multi-product sales and
a faster path to saving, while staying inside the 2.0 warm-paper design system.
Multi-product sales are common, so the layout must handle several sizes cleanly.

## Decisions (locked)

- **Layout direction:** Smart List — each product size is a slim row by default;
  tapping it expands into a full entry line.
- **Empties:** stay manual, starting at `0`, exactly like today. No auto-mirroring
  of qty → empties.
- **No data-model / hook / route changes.** Submit logic (multi-row insert on
  create, single-row update on edit) is unchanged.

## Layout (top → bottom)

1. **Header** — unchanged. `‹ Back` link + title (`Record a sale` / `Edit sale`).

2. **Customer + Date card** — unchanged. Two-up card: customer `<select>` (disabled
   in edit mode) and date `<input type="date">` (max = today).

3. **Product rows** — the restructured section:
   - Each product from `useProducts()` renders as a **slim row**: size pill
     (e.g. `19 kg`) left, **"+ Add to sale"** right.
   - Tapping a slim row (or its "+ Add") **expands it in place** into the full line:
     - **Sold** stepper (primary variant), min 0.
     - **Empties taken** stepper (secondary/green variant), min 0, starts at 0.
     - **Price each (₹)** number input, prefilled from `product.price`.
     - Helper text: "Customer owes **X** {size} empties" (from
       `useCustomerProductBalances`, via existing `ownedFor`).
   - An expanded line's header shows a compact summary — `×{qty} · {formatCurrency(lineTotal)}`
     — and a small **Remove** (×) affordance that collapses it back to a slim row and
     resets that line's qty/empties (price may reset to default).
   - Only expanded lines with `qty > 0` are included on submit (unchanged filter).

4. **Payment card** — unchanged behavior:
   - **On credit / Received now** segmented toggle (`received` state).
   - When received: **Cash / UPI** method toggle + optional **Note** input.

5. **Sticky action bar** — replaces today's inline total banner + separate save
   button. Pinned to the bottom of the viewport (fixed, within thumb reach), above
   the app's `BottomNav` area:
   - Left: `Sale total` label + `formatCurrency(saleTotal)`.
   - Right: **Save** button (`Save sale` / `Save changes`; `Saving…` while submitting;
     disabled when `saving`).
   - Inline error text renders just above the bar.
   - The form content gets bottom padding so the last field is never hidden behind
     the bar.

## Edit mode

Route `/customers/:id/sale/:txId/edit`. Exactly one product line, **pre-expanded**,
with no slim rows and no add/remove affordance — matching current single-product
edit behavior. Customer select disabled. `originalEmpties` handling for the
`ownedFor` cap is unchanged.

## New / changed local state

- Add an **expanded set** — which product ids are currently expanded, e.g.
  `expanded: Set<number>` (or reuse "has a qty/price been touched"). In edit mode it
  is seeded with the single `editProductId`.
- `qtyByProduct`, `priceByProduct`, `emptiesByProduct`, `received`, `method`, `note`,
  `date`, `error`, `saving` — all unchanged.
- Collapsing/removing a line clears that product's entries from the three maps.

## Validation (unchanged)

- At least one line with `qty > 0`, else "Enter a quantity for at least one product".
- Each line: `price > 0`, else "Enter a price for {name}".
- Each line: `empties ≤ ownedFor(productId) + qty`, else the existing cap message.

## Non-goals / YAGNI

- No auto-mirror of empties.
- No product search/filter (size list is short).
- No wizard, receipt, or keypad paradigm (considered and set aside).
- No changes to how the sale is persisted or to any hook/view.

## Trade-off (accepted)

Adding a product now costs one extra tap ("+ Add") versus today's always-expanded
rows. Accepted in exchange for a cleaner multi-size screen and the scroll-free
sticky Save bar.

## Testing / verification

- Manual verification via the dev-server preview: create a single-product sale, a
  multi-product sale, on-credit vs received-now (+ method/note), and the empties cap
  error. Confirm edit mode shows one pre-expanded line and updates correctly.
- Confirm the sticky Save bar stays reachable and doesn't overlap the last field or
  the bottom nav.
