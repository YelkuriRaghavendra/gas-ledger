# New Connection Sold Counter — Design

**Date:** 2026-07-17
**Segment:** Domestic only
**Status:** Approved for planning

## Problem

Selling a New Connection (NC) records one `transactions` row against the NC
product — a `service` **combo** whose `bundle_components` consume a cylinder,
regulator, lighter and pass book. Reporting today does not surface how many New
Connections were sold:

- `DomesticHome`'s `cylindersSoldToday` counts only lines whose product
  `kind === 'cylinder'`, so the cylinder inside an NC is never counted there.
- No screen shows an "NC sold" figure at all.

The owner wants a **separate New Connections sold counter** in the domestic
sales summaries, without changing the existing per-cylinder counts or stock
math.

## Scope decisions (locked)

1. **Domestic only.** Combos are edited on the domestic Combos screen
   (`DomesticCombos` loads `useProducts('domestic')`), so only domestic products
   can be flagged. A commercial NC counter would have no data source and is
   explicitly out of scope. No commercial screens change.
2. **Which combos count is owner-controlled** via a per-combo flag set in the
   Combos editor — not hard-coded to a name pattern.
3. **Separate counter.** The bundled cylinder is NOT added to
   `cylindersSoldToday`, and existing per-product cylinder rows are untouched.
   Rationale: a New-Connection cylinder is a fresh connection, semantically
   distinct from a refill; keeping them separate is clearer for the owner.
   Physical inventory stays correct regardless — `godown_stock` is already
   bundle-aware and drops full stock for the bundled cylinder.
4. **No new SQL view.** The count is derived client-side from data the screens
   already load, matching the app's existing client-compute pattern.

## Data model change

Add one column to `public.products`:

```sql
alter table public.products
  add column if not exists is_new_connection boolean not null default false;
```

- Delivered as a new migration file `db/2026-07-17-new-connection-flag.sql`.
- Mirrored into the canonical `db/schema.sql` products table (reference build).
- Only combos (products of `kind = 'service'` that have `bundle_components`)
  will ever have this set true, but the column is not constrained to that — the
  UI is the only place that sets it.

Add to the `Product` interface in `src/types/db.ts`:

```ts
is_new_connection: boolean
```

`useProducts` selects `*`, so no query change is needed; verify it does before
relying on this.

## Combos editor change — `src/pages/domestic/DomesticCombos.tsx`

In the combo editor (the panel opened by `openEditor`), add a checkbox toggle:

> **Count as New Connection**
> *Bills of this combo are counted in the "New Connections sold" figures.*

- Initial checked state = `editing.is_new_connection`.
- On save, include `is_new_connection` in the `products` update alongside the
  existing bundle-component write. Follow the file's existing save/refresh
  pattern; call `refreshProducts()` after so the flag reflects immediately.
- Style: reuse the outright-sale checkbox styling from `NewSale.tsx`
  (`h-[16px] w-[16px] accent-[#E4571B]`, label `text-[12px] font-semibold`),
  adapting the accent to the domestic green where appropriate.

## Counter logic (client-side)

Shared derivation, computed on each screen from already-loaded data:

```ts
const ncProductIds = new Set(
  products.filter((p) => p.is_new_connection).map((p) => p.id),
)
// sum of qty across sale lines whose product is a flagged combo
const ncSold = bills.reduce(
  (sum, b) =>
    sum +
    b.lines.reduce(
      (s, l) => s + (l.product_id !== null && ncProductIds.has(l.product_id) ? l.qty : 0),
      0,
    ),
  0,
)
```

Counting `qty` (not lines) so a bill selling 2 New Connections counts as 2.

## Rendering

### `src/pages/domestic/DomesticHome.tsx`
Extend the hero today-summary line. Current:

> `{bills.length} bills · {cylindersSoldToday} cylinders sold`

Append the NC clause **only when `ncSold > 0`**:

> `… · {ncSold} New Connection{ncSold === 1 ? '' : 's'}`

`products` is already loaded here; compute `ncProductIds`/`ncSold` from `bills`.

### `src/pages/domestic/DomesticHistory.tsx`
Per-day group header currently shows:

> `{formatCurrency(g.revenue)} · {g.bills.length} bills`

Compute per-day `ncSold` from `g.bills` and append when `> 0`:

> `… · {ncSold} NC`

`products` is already loaded here.

### No other screens change
`DomesticStock` is inventory (godown full/empty), not a sales metric — no NC
tile there. `cylindersSoldToday` unchanged. `godown_stock` unchanged. No
commercial screens change.

## Out of scope

- Commercial `CustomerDetail` BY PRODUCT tile (no flaggable commercial combos).
- Expanding NC into component cylinder counts anywhere.
- Historical backfill — `is_new_connection` defaults false; the owner flags
  combos going forward, and past bills of a now-flagged combo count
  retroactively since the flag lives on the product, not the bill.

## Testing

- Unit: a small pure helper `countNewConnections(bills, ncProductIds)` covering:
  zero flagged combos, a bill with qty>1 of a flagged combo, mixed bills with
  cylinder + NC lines (cylinder count unaffected), and a flagged combo with a
  null `product_id` line.
- Manual verify in domestic mode: flag "New Connection (Regular)" in Combos,
  bill one, confirm DomesticHome shows "1 New Connection" and cylinders-sold is
  unchanged; confirm DomesticHistory day header shows "1 NC".

## Verification gate

`npx tsc -b --noEmit` = 0 errors AND `npm run build` succeeds.
```
