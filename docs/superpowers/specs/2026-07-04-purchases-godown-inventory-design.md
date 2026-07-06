# Purchases + Godown Inventory (Phase 2 of "2.0")

Date: 2026-07-04

## Purpose

This is Phase 2 of the app's "2.0" initiative (see `2026-07-04-multi-product-foundation-design.md` for the full five-area breakdown and phase rationale). Phase 2 covers three of those five areas, which turned out to be one cohesive subsystem: recording purchases from the supplier, showing godown stock derived from purchases vs. sales, and predicting when the godown will run out of storage space for empties.

This phase depends on Phase 1 being implemented first: it assumes the `products` table exists (seeded with `'19 kg'` and `'5 kg'`), that `transactions.product_id` is populated for every `sale`/`return` row, and that `customer_product_balances` exists and is correct. Nothing in this spec touches customer-facing screens or the `transactions` table's existing columns — it is purely additive (new table, new view, new screens).

Phase 3 (reporting/insights) is not covered here and has its own spec.

## Data model

**New migration file:** `supabase/migrations/007_purchases_and_godown.sql` (Phase 1's migration claims `006_products.sql`, so this phase's migration is `007`, per the numbering note in the Phase 1 spec).

**New `purchases` table.** A purchase from the supplier is structurally the same swap as a sale to a customer — the agency receives full cylinders and hands back empties, optionally settling payment immediately or on credit — so the table shape mirrors `transactions` directly rather than inventing new field names:

```sql
create table purchases (
  id             bigint generated always as identity primary key,
  product_id     bigint not null references products(id),
  qty            int not null default 0,
  empties_given  int not null default 0,
  amount         numeric(12,2) not null default 0,
  paid           boolean not null default false,
  method         text check (method in ('cash','upi')),
  note           text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index on purchases (product_id, created_at desc);
```

Column meanings, matching the sale-transaction analogues one-for-one:

- `qty` — full cylinders received from the supplier (analogous to a sale's `qty`).
- `empties_given` — empty cylinders handed back to the supplier in the same visit (analogous to a sale's `empties`).
- `amount` — total cost of the purchase (`qty × price each`, computed client-side same as New Sale).
- `paid` / `method` / `note` — identical semantics to the same columns already on `transactions`: whether the agency settled the bill on the spot, and if so how, plus a free-text note.

No `supplier_id` or `suppliers` table. The stakeholder asked for purchase records and godown visibility, not vendor management — adding a suppliers table would be speculative scope the requirements don't call for.

**New `products.godown_capacity` column**, nullable, in the same migration:

```sql
alter table products add column godown_capacity int;
```

`null` means "no capacity set" — the UI simply omits the capacity/prediction section for that product until an owner sets it via the Products screen. There is no default; forcing a number at seed time would fabricate data no one has entered.

**New `godown_stock` view**, one row per product:

```sql
create view godown_stock as
select
  p.id as product_id,
  p.name as product_name,
  p.godown_capacity,
  coalesce(sum(pu.qty), 0)
    - coalesce((select sum(t.qty) from transactions t where t.product_id = p.id and t.type = 'sale'), 0)
    as full_cylinders,
  (coalesce((select sum(t.empties) from transactions t where t.product_id = p.id and t.type = 'sale'), 0)
    + coalesce((select sum(t.qty) from transactions t where t.product_id = p.id and t.type = 'return'), 0))
    - coalesce(sum(pu.empties_given), 0)
    as empty_cylinders
from products p
left join purchases pu on pu.product_id = p.id
group by p.id, p.name, p.godown_capacity;
```

This matches the two required figures exactly:

- **Full cylinders in godown** = total purchased (all-time, all `purchases.qty` for the product) − total sold (all-time, all `transactions.qty` where `type = 'sale'` for the product).
- **Empty cylinders in godown** = (empties collected from customers via sales `transactions.empties` + returns `transactions.qty` where `type = 'return'`) − (empties handed back to the supplier via `purchases.empties_given`).

The `left join` (rather than requiring at least one purchase) guarantees every product has a row even before its first purchase is ever recorded, consistent with the `cross join` pattern `customer_product_balances` uses in Phase 1 to guarantee a row per (customer, product) pair — same "never show a missing card" principle applied here at the product level.

Both figures can go negative in pathological data states (e.g. sales backfilled without matching purchases, or a customer paying back more empties than were ever tracked as taken from the godown). The view does not clamp — it reports the arithmetic truth, and the UI decides how to present an unexpected negative (see Screen changes). Clamping at the SQL layer would hide a real data problem from whoever needs to investigate it.

**RLS.** Following the exact pattern already used for `transactions` in `schema.sql` (read is open to all authenticated users, insert is self-service but tied to the inserting user, update/delete are owner-only):

```sql
alter table purchases enable row level security;

create policy "read purchases" on purchases for select to authenticated using (true);
create policy "insert own purchases" on purchases for insert to authenticated
  with check (created_by = auth.uid());
create policy "owner update purchases" on purchases for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "owner delete purchases" on purchases for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
```

Any authenticated staff member can log a purchase (same trust level as logging a sale), but only an owner can correct or remove one after the fact — matching how sale/return/payment transactions are already governed.

**`products.godown_capacity` update permission.** The Products screen already restricts editing to owners implicitly via the existing `price` field's update path; no new RLS policy is needed on `products` beyond what Phase 1 already specifies, since `godown_capacity` is just another column on the same table covered by the same policy.

## Screen changes

**New "Purchases" screen** (`/purchases`), reachable from the bottom nav's Quick Add sheet (a fifth item, "Record purchase", alongside New sale / Log return / Record payment / Add customer) and from a new "Purchases" row in the Account menu (`/account` — same list-row style as "Business details" / "Cylinder pricing" / "Export ledger"). The screen itself shows a reverse-chronological list of all purchases across both products, newest first — no day-grouping or running-balance treatment like Customer Detail's history, since there's no single customer to anchor a balance to and the stakeholder didn't ask for that level of ceremony here. Each row mirrors the visual language of Customer Detail's history rows (colored icon chip on the left, bold title, muted subtitle, amount on the right) but without the View/Edit/Delete stack condensed to icons — instead:

- Title: `"{qty} × {product_name} purchased"` (e.g., "20 × 19 kg purchased").
- Subtitle: relative date (`formatRelativeDate`) · amount (`formatCurrency`) · `"{empties_given} empties given"` if nonzero · `"Paid ({method})"` or `"On credit"`.
- Note shown in italics below the subtitle if present, same as transaction history rows.
- Owners see Edit/Delete text-links at the trailing edge, same as Customer Detail's owner-only controls; staff see nothing extra (consistent with staff being unable to update/delete under RLS).

An empty state (`"No purchases yet."`) matches the empty-state text pattern already used on Customer Detail (`"No transactions yet."`).

**New "Record Purchase" form** (`/purchases/new`, plus `/purchases/:id/edit` for owner edits), structurally a direct mirror of `NewSale.tsx`:

- Product picker at the top (same `<select>` styling New Sale's spec calls for in Phase 1 — a dropdown over `products`, not a customer picker, since a purchase has no customer).
- Date field, using the same `todayInputValue` / `dateInputValue` / `combineDateWithNow` helpers from `src/utils/format.ts`, capped at today (`max={todayInputValue()}`) exactly like New Sale's date field.
- "{product.name} cylinders received" label over a `Stepper` (primary variant, `min={1}`) for `qty`.
- "Price each (₹)" numeric input (`step="0.01"`, decimal-friendly per the existing New Sale price-each convention) next to an "Empties given" `Stepper` (secondary variant, `min={0}`) for `empties_given`, laid out as the same two-column flex row New Sale uses for price-each / empties-taken.
- Paid/on-credit toggle: two-button segmented control identical in markup and styling to New Sale's "On credit" / "Received now" toggle, governing whether the method+note fields render below it.
- When paid, "Payment method" segmented control (Cash / UPI) and an optional "Note" text input, exact same markup as New Sale.
- A summary box before the submit button showing "Purchase total" (`qty × price`) — the dark accent-tinted box New Sale uses for "Sale total" / "New empties owed" is not fully applicable here (there's no "new empties owed to godown" concept symmetrical to a customer sale), so this box shows just the total cost, styled the same (`rounded-2xl border border-[#F3D9C6] bg-[#FBEDE4] p-4`).
- Submit button: `"Save purchase"` / `"Saving…"` / `"Save changes"` when editing, same accent button styling as New Sale's submit.

Editing an existing purchase follows the same `loadedEdit` / `originalEmpties`-style pattern New Sale uses to seed form state from the existing row and to correctly recompute the empties-given validation cap around the row's original value (see Validation below) rather than double-counting it.

**New "Godown" screen** (`/godown`), reachable from the Account menu (new row, "Godown inventory") and from a home-screen or Account entry point — one card per product, stacking vertically on narrow viewports (same responsive treatment Phase 1 specifies for Customer Detail's two per-product cards). Each card uses the same card shell Customer Detail's per-product balance cards use (`HeroCard`-style dark card, or the lighter bordered-white card style — reuse whichever Phase 1 lands on for Customer Detail's per-product cards, so the two "per-product card" surfaces in the app look like one family) and shows:

- Product name as the card header.
- Two figures side by side: "Full cylinders" and "Empty cylinders", pulled from `godown_stock.full_cylinders` / `godown_stock.empty_cylinders`, using the same large `font-display font-bold` number treatment as Customer Detail's Sold/Returned/Empties trio.
- If either figure is negative, render it in the same red (`text-red-600` / `#C23B22`) already used elsewhere in the app for error/negative states, rather than silently showing a misleading negative — a negative godown figure indicates a data problem (e.g., missing purchase records predating this feature) and should look like something worth investigating, not a normal reading.
- Below the two figures, if `godown_capacity` is set for the product, a capacity section (see Prediction below); if `godown_capacity` is null, this section is omitted entirely and nothing else is shown in its place — no "set a capacity" nag banner, since that's discoverable from the Products screen already.

**Products screen (introduced in Phase 1, per-product editable rows):** each product row gains a second input, "Godown capacity (empties)", next to the existing price field. Same greater-than-zero validation as price *if a value is entered*, but empty is valid and means "not set" (stored as `null`, not `0` — `0` would mean "the godown holds zero empties," which is a different, nonsensical claim). Saving an empty capacity field clears `godown_capacity` back to `null` (so an owner can unset a prediction they no longer trust, e.g. after moving to a bigger godown mid-measurement-window, without needing SQL access).

**Bottom nav / Quick Add sheet:** gains a fifth item, "Record purchase" (`/purchases/new`), styled like the existing four items (icon chip + label + one-line description, e.g. "Cylinders in from supplier"), using a plausible existing icon (e.g. `ReturnIcon` mirrored, or a new simple truck/box icon — implementation detail, not a design decision this spec needs to pin down further than "reuse the existing icon set's visual weight").

**Account screen:** gains two new rows in the settings list, "Purchases" (→ `/purchases`) and "Godown inventory" (→ `/godown`), inserted using the exact same row markup as the existing "Business details" / "Cylinder pricing" / "Export ledger" rows (border-bottom on all but the last, chevron on the right).

## Prediction: days until godown is full

Scope: this prediction concerns **empty-cylinder storage only** (per the stated requirement — "predicting when the godown will run out of storage space for empties"). Full-cylinder stock is shown for visibility but has no capacity/prediction attached in this phase, since the requirement is specifically about empties piling up faster than they're returned to the supplier.

**Trailing window: 14 days.** Chosen over 30 for two reasons specific to this business: (1) purchases (the only event that reduces empty stock) happen in irregular, relatively infrequent batches — a 30-day window risks being dominated by one unusually large or small supplier trip that no longer reflects current conditions, while 14 days is short enough to react to a recent change in sale volume or supplier visit frequency but long enough to smooth out day-to-day noise (a single big sale day, a day with no activity at all); (2) this mirrors the granularity owners already think in, given payments and restocking in this business tend to happen roughly every one to two weeks based on the existing credit/payment patterns visible in `transactions`. The window is a plain constant, not a user setting, in this phase — exposing it as a tunable is unnecessary complexity the stakeholder hasn't asked for.

**Net accumulation rate**, per product, over the trailing 14 days ending now:

```
empties_in(window)  = sum(transactions.empties where type='sale' and product_id=p and created_at >= now() - interval '14 days')
                     + sum(transactions.qty where type='return' and product_id=p and created_at >= now() - interval '14 days')

empties_out(window) = sum(purchases.empties_given where product_id=p and created_at >= now() - interval '14 days')

net_rate_per_day = (empties_in(window) - empties_out(window)) / 14.0
```

**Days until full**, given `godown_capacity` (nullable, section omitted if null) and the current `empty_cylinders` figure from `godown_stock`:

```
remaining_capacity = godown_capacity - empty_cylinders

if net_rate_per_day <= 0:
    display "Not approaching capacity"
elif remaining_capacity <= 0:
    display "Godown is already at or over capacity"
else:
    days_until_full = ceil(remaining_capacity / net_rate_per_day)
    display "~{days_until_full} days until full at current pace"
```

This covers all cases without a hand-wavy fallback:

- **Net rate zero or negative** (godown emptying out or holding steady — supplier pickups keeping pace with or outpacing customer accumulation): "Not approaching capacity" rather than a negative or infinite day count, exactly as required.
- **Already over capacity** (can happen if capacity is set retroactively below the current stock, or stock crept up before the setting existed): called out explicitly rather than showing a small or negative day count that would misleadingly suggest "still some room left."
- **Normal case**: a single rounded-up integer day count, since a fractional "3.2 days" is false precision for a manually-recorded ledger.

Displayed on the Godown screen's per-product card as a single line beneath the two figures, in the same muted/accent color pairing already used for secondary metrics elsewhere (e.g. the `#9A8F80` muted tone for the label, accent color for the number), with the exact wording specified above so it reads consistently regardless of which branch produced it.

**Recomputation:** this is a read-time calculation (a query run when the Godown screen loads), not a stored/cached value — no new column or job is introduced to persist it, consistent with the app's existing pattern of computing everything through views/hooks at read time (`customer_balances`, `customer_product_balances`, `activity_feed` are all views, not materialized or cron-refreshed).

## Validation

**Record Purchase form**, mirroring the exact validation shape already used in `NewSale.tsx` and `LogReturn.tsx`:

- `qty > 0` and `price > 0` (price-each), same combined check-and-message pattern as New Sale's `"Quantity and price must be greater than zero"`.
- `empties_given` capped by an analogous rule to New Sale's empties-taken cap. New Sale bounds empties-taken by `currentlyOwed + qty` — the customer's outstanding empties plus what this sale adds, because you can't collect more empties than the customer could plausibly be holding. The purchase-side analogue is the godown's own current empty stock plus what this purchase brings in: **you can't hand the supplier more empties than the godown will have on hand after this purchase completes.**

  ```
  currentEmptyStock = godown_stock.empty_cylinders for the selected product
                       (excluding this purchase's own prior empties_given, when editing —
                        same "originalEmpties" pattern New Sale uses to avoid double-counting
                        the row being edited)
  maxEmptiesGivable  = currentEmptyStock  (empties_given does not add to itself the way a sale's
                       qty adds to the takeable cap, because a purchase's own qty is full
                       cylinders coming in, not empties — there is no equivalent inflow to add)
  ```

  Validation message, matching New Sale's phrasing style: `"Can't give more than {maxEmptiesGivable} empties (current godown stock)."` If `maxEmptiesGivable` is negative (a pre-existing data problem — see Data model's note on negative `godown_stock` figures), treat the cap as `0` for validation purposes rather than allowing a negative bound to make the field impossible to fill in a way that produces a more confusing error than "you have none to give."

  This is a deliberate asymmetry from the sale-side cap, and worth being explicit about: a sale's cap grows with `qty` because *this transaction's own full cylinders sold* directly create the debt of empties the customer could owe back. A purchase's `qty` (full cylinders received from the supplier) has no equivalent relationship to `empties_given` — receiving 50 new full cylinders does not create 50 new empties to hand over. The only source of empties to give the supplier is what's already sitting in the godown.

- Date field: same `max={todayInputValue()}` cap as New Sale/Log Return — no future-dated purchases.
- Payment method required only when `paid` is true, exactly mirroring New Sale's `method: received ? method : null` pattern.

**Products screen capacity field:** if a value is entered it must be a positive integer (`> 0`); empty/blank is valid and clears to `null`. No upper bound — an owner can enter any capacity that reflects their actual godown size.

## Testing approach

Consistent with the rest of the app: manual verification against the live Supabase project (this app has no automated test suite).

- After running the migration, confirm `godown_stock` returns one row per product (both 19 kg and 5 kg) with `full_cylinders = 0`, `empty_cylinders` equal to the sum of all pre-Phase-2 sales' `empties` plus returns' `qty` for that product (since no purchases exist yet, `empties_given` contributes zero) — spot-check this against a manual sum from the transactions list for at least one product.
- Record a purchase of 20 × 19 kg at some price, with 5 empties given back, paid in cash. Confirm it appears at the top of the Purchases list with the correct title/subtitle, and that the 19 kg godown card's `full_cylinders` increases by 20 and `empty_cylinders` decreases by 5.
- Record a second purchase on credit (not paid) and confirm the Purchases list shows "On credit" and no payment method, matching how New Sale's on-credit sales render in Customer Detail's history.
- Attempt to submit a purchase with `empties_given` greater than the product's current `empty_cylinders` in `godown_stock`; confirm the form blocks submission with the capacity-based error message and does not insert a row.
- Edit an existing purchase's `empties_given` down to a smaller number; confirm the validation cap recomputes using the purchase's original value excluded (i.e., you can re-save the same value without tripping the cap on your own prior row).
- As a staff (non-owner) account, confirm Edit/Delete controls are absent on the Purchases list and that attempting an update/delete via a direct API call is rejected by RLS (mirroring the same staff-vs-owner check already verified for transactions).
- Set a `godown_capacity` for 19 kg via the Products screen, then verify: with recent sales outpacing recent purchases (positive net rate), the Godown screen shows a sensible "~N days until full" figure; after recording a large purchase that pushes `empty_cylinders` down and the trailing-14-day net rate to zero or negative, confirm the same card now shows "Not approaching capacity" instead of a stale or nonsensical number.
- Clear a previously-set `godown_capacity` back to blank on the Products screen; confirm the Godown screen's capacity/prediction section disappears for that product without affecting the full/empty cylinder counts.
- Manually construct (via direct insert, bypassing the form) a scenario where `empty_cylinders` goes negative for a product; confirm the Godown card renders that figure in the red/error color rather than looking like a normal reading.

## Out of scope

- Reporting/insights (daily/monthly summaries, revenue trends) — Phase 3.
- Supplier/vendor tracking (no `suppliers` table, no per-supplier purchase history or contact info) — not requested; purchases are recorded as agency-wide events only.
- Day-grouping and running-balance treatment on the Purchases list (unlike Customer Detail's history) — there's no customer to group by or balance to run against; a flat reverse-chronological list is sufficient for what was asked.
- Any UI for editing the trailing-window length (14 days) or otherwise tuning the prediction algorithm — it's a fixed constant in this phase.
- Predicting full-cylinder stock-outs or any capacity/prediction concept for full cylinders — the requirement was specifically about empty-cylinder godown space.
- Materializing or caching `godown_stock` or the prediction figures (e.g. via a scheduled job or materialized view) — both are computed at read time, consistent with how every other derived figure in this app already works.
- Bulk/CSV import of historical purchase records predating this feature — pre-existing godown stock will simply read as whatever the all-time sale/return/return-to-supplier arithmetic produces from the data that already exists; there is no backfill step, mirroring how Phase 1 didn't attempt to reconstruct pre-migration per-product history beyond the 19 kg backfill it already specifies.
- Any notification/alert (push, SMS, in-app banner) when a product is close to full — this phase only displays the figure on the Godown screen; proactive alerting is a reasonable future addition but was not requested.
