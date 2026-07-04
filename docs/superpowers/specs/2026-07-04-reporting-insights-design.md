# Reporting & Insights (Phase 3 of "2.0")

Date: 2026-07-04

## Purpose

This is Phase 3 of 3 in the app's "2.0" initiative (see the Phase 1 spec, `2026-07-04-multi-product-foundation-design.md`, for the full five-item breakdown and why it was decomposed this way). This phase covers item (1) from that list — "more reporting/insight: daily/monthly summaries, revenue trends" — layered on top of the data model Phases 1 and 2 establish.

This spec **depends on both prior phases being implemented**:

- **Phase 1** introduces `products` (seeded with `'19 kg'` and `'5 kg'`) and `transactions.product_id` (required for `sale`/`return`, `NULL` for `payment`). Reporting is broken down by product wherever that's meaningful, which is only possible because Phase 1 exists.
- **Phase 2** (not read directly — its exact spec file wasn't available at the time of writing, so its shape is assumed and stated explicitly wherever it matters) introduces a `purchases` table mirroring the shape of a sale transaction: `product_id`, `qty`, `empties_given`, `amount`, `paid`, `method`, `note`, `created_at` (plus presumably `id`, `supplier`-type fields, and `created_by`, not relied on here). Phase 2 also adds godown/inventory tracking. This spec only reads `purchases` for the qty/empties-given/amount figures it mirrors from sales — it does not depend on Phase 2's godown-stock or capacity-prediction logic, and doesn't reference any Phase-2-specific tables beyond `purchases` itself.

Because Phase 2's spec wasn't available to read in full, every place this document uses `purchases` is flagged inline as an assumption. If Phase 2 ships with a different column name or shape, the migration and hook described here will need a one-line adjustment, but the screen design and rollup logic should hold.

**Why no charting library.** This codebase has zero charting/visualization dependencies today (no recharts, chart.js, d3, victory, etc.) — it's a deliberately minimal Tailwind-plus-hand-rolled-components app (see `HeroCard`, `InitialsBadge`, the hand-drawn SVG icons in `src/components/icons`). Pulling in a charting library for one trend view would be a disproportionate dependency-weight increase for what is, at the data volumes a single gas agency produces (dozens of transactions a day, at most), a small number of bars. This spec instead designs the revenue trend as a row of plain `<div>` bars with inline `height`/background styles (a CSS "bar chart"), the same technique already implicitly used for things like the divider bars in `HeroCard`. This keeps bundle size, review surface, and dependency-update burden unchanged from today.

## Data model

**New `purchases`-and-`transactions` rollup views**, added in a new migration `supabase/migrations/008_reporting_views.sql`.

> **Migration numbering:** fixed across all three phase specs — Phase 1 claims `006_products.sql`, Phase 2 claims `007_purchases_and_godown.sql`, and this phase claims `008_reporting_views.sql`. All three specs now agree on this sequence.

**Design choice: SQL views, not client-side aggregation.** Every existing screen in this app that shows a rollup (`Home`, `CustomerDetail`, `ActivityFeed`) reads from a thin Supabase view (`customer_balances`, `activity_feed`) via a small hook that does a straight `select('*')` with no client-side math beyond a final `.reduce()` for a single grand total (see `Home.tsx`'s `totalDue`/`totalSold` reduces over `useCustomerBalances()` data). This spec follows the same pattern for the daily and monthly summaries and the per-product breakdown: push the `group by` and `filter (where ...)` aggregation into Postgres, keep the hook a thin `select`. The revenue trend (a multi-day series) is the one place a per-row client-side step is unavoidable — Postgres returns one row per day, and the component turns those rows into bar heights — but the aggregation itself (summing amounts per day) still happens in the view, not in JavaScript. This mirrors how `Home.tsx` already receives pre-aggregated rows and only does light reshaping in the component.

**`daily_summary` view** — one row per calendar day (server timezone, consistent with every other `created_at` comparison already in this codebase; no explicit timezone conversion is done anywhere else, so this spec doesn't introduce one either), broken down by product for the sale-side figures, plus a single payments/purchases row per day since those aren't product-specific in the same way:

```sql
create view daily_product_summary as
select
  date_trunc('day', t.created_at) as day,
  t.product_id,
  p.name as product_name,
  coalesce(sum(t.qty) filter (where t.type = 'sale'), 0) as cylinders_sold,
  coalesce(sum(t.amount) filter (where t.type = 'sale'), 0) as revenue,
  coalesce(sum(t.amount) filter (where t.type = 'sale' and t.paid), 0) as collected_at_sale,
  coalesce(sum(t.empties) filter (where t.type = 'sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type = 'return'), 0) as empties_collected
from transactions t
join products p on p.id = t.product_id
where t.type in ('sale', 'return')
group by 1, 2, 3;

create view daily_money_summary as
select
  date_trunc('day', created_at) as day,
  coalesce(sum(amount) filter (where type = 'payment'), 0) as payments_collected
from transactions
where type = 'payment'
group by 1;
```

Both views are unbounded (all history, grouped by day) rather than filtered to "today" — filtering to a specific day is a `where day = current_date` the hook adds at query time, the same way `useActivityFeed` adds `.limit(n)` at query time rather than baking a limit into the view. This keeps the views reusable for both the daily card and the trailing-window trend chart without needing two separate view definitions.

**Purchases-side figures (assumption flagged):** assuming Phase 2's `purchases` table has the shape `product_id, qty, empties_given, amount, paid, method, note, created_at`, the equivalent view is:

```sql
create view daily_purchase_summary as
select
  date_trunc('day', created_at) as day,
  product_id,
  coalesce(sum(qty), 0) as cylinders_purchased,
  coalesce(sum(empties_given), 0) as empties_given_to_supplier,
  coalesce(sum(amount), 0) as purchase_amount
from purchases
group by 1, 2;
```

If Phase 2's actual column names differ (e.g. `empties` instead of `empties_given`, or no `paid`/`method` columns), only this one view's column list needs to change — nothing downstream in this spec depends on the exact purchase column names beyond qty/empties/amount. If Phase 2 does not exist yet when this phase is implemented, the purchases-related figures (item 2 in the daily/monthly summary below) are simply omitted from the screen; everything else in this spec stands alone.

**Monthly rollup** reuses the same daily views with a coarser grouping key rather than a separate view — `date_trunc('month', ...)` instead of `date_trunc('day', ...)`. Rather than duplicating four view definitions, the daily views above are the single source of truth; the monthly summary and the "compare to previous month" figure (see Screen changes) are computed by the hook doing `date_trunc('month', day)` grouping over `daily_product_summary`/`daily_money_summary`/`daily_purchase_summary`, or (equivalently, and just as consistent with the thin-view convention) two more small views:

```sql
create view monthly_product_summary as
select
  date_trunc('month', day) as month,
  product_id,
  product_name,
  sum(cylinders_sold) as cylinders_sold,
  sum(revenue) as revenue,
  sum(collected_at_sale) as collected_at_sale,
  sum(empties_collected) as empties_collected
from daily_product_summary
group by 1, 2, 3;

create view monthly_money_summary as
select date_trunc('month', day) as month, sum(payments_collected) as payments_collected
from daily_money_summary
group by 1;
```

This spec picks the view-of-a-view approach (`monthly_*` built on `daily_*`) over ad hoc client grouping, since it's one extra small SQL block versus writing and maintaining month-bucketing logic in TypeScript, and it keeps the "aggregation lives in Postgres" rule with no exceptions.

**RLS:** all six views are read-only rollups over `transactions`/`purchases`, which already have `for select to authenticated using (true)` policies. Views inherit the querying user's row-level access to their underlying tables in this Supabase setup (same as `customer_balances` and `activity_feed` today, which carry no RLS policies of their own), so no new policies are needed.

**Revenue trend query.** The trend view (last 7 or last 30 days) is served by a `select * from daily_product_summary where day >= $start_date order by day` — no new view needed, since `daily_product_summary` is already ungrouped by date range. The hook fetches the trailing window and sums across products client-side only for the "combined revenue" line of the trend; per-product series (if shown — see Screen changes) read the per-product rows directly.

## Screen changes

**Navigation placement: a new "Reports" row under Account, not a sixth bottom-nav slot.**

The bottom nav has a fixed 5-slot layout — Home, Customers, a center FAB (quick-add sheet), Activity, Account — and there's no free slot to add a sixth primary destination without redesigning the nav bar itself, which is out of scope for a reporting feature. Account already works as a container for secondary, less-frequently-visited screens (`Business details`, `Cylinder pricing`/`Products`, `Export ledger`), each a simple row in the same list-of-links card (see `Account.tsx`). Reports fits that same profile: owners will check it periodically (maybe daily), not on every app open the way Home or Customers are. Following the existing `Account.tsx` pattern exactly, a new row is added to the links card:

```
Business details    ›
Cylinder pricing     ›   (renamed "Products" per Phase 1)
Reports              ›   ← new
Export ledger        ›
```

placed after "Products" and before "Export ledger" (grouping the two data-driven screens together, before the one-off export action). The route is `/account/reports`, matching the existing `/account/business`, `/account/pricing`, `/account/export` convention. No changes to `BottomNav.tsx` or the router's top-level tab structure — only one new `<Route>` entry alongside the other `/account/*` routes, and one new link row in `Account.tsx`.

*Alternative considered and rejected:* making Reports a tab on the Home screen (e.g. a "Today / This month" toggle inline on Home). Rejected because Home is deliberately a fast at-a-glance-and-act screen (hero card + two big action buttons + recent activity) — the Phase 1 spec didn't touch its density, and stacking two more rollup sections and a trend chart onto it would push the "New sale"/"Log return" buttons below the fold on small phones, which is a worse regression than adding one more Account row.

**New screen: `Reports` (`src/pages/Reports.tsx`), route `/account/reports`.**

Structure, top to bottom, matching this app's established page shell (`p-5 pb-[110px] pt-2`, `font-display text-2xl font-bold` page title, matching `Account.tsx`/`ActivityFeed.tsx`):

1. **Header:** `"Reports"` title, same treatment as `"All activity"` on Activity Feed and `"Account"` on Account.

2. **Period toggle:** a small two-segment control, `Today | This month`, styled as a pill-shaped segmented control (two buttons in a rounded container, active segment filled with `bg-accent`/white text, inactive plain text on cream — no new component needed, this is a simplified version of the existing filled/outlined button pairing already used for `New sale`/`Log return` on Home). Defaults to `Today`. This toggle controls sections 3 and 4 below; the trend chart (section 5) has its own independent window control.

3. **Summary hero card** (reuses the existing `HeroCard` component, same dark rounded card used on Home): shows the totals for whichever period is selected.
   - **Today:** "Revenue today" as the big number (`formatCurrency`, same 42px display-font treatment as `HeroCard`'s "Amount to collect"), sub-line "collected: {formatCurrency(collected)}" where `collected = collected_at_sale + payments_collected` (i.e., money that actually changed hands today — paid-at-sale amounts plus separate payments — mirroring how `amount_due` already treats `paid` sales as settled). Below that, the three-stat row (same visual slot as Home's Sold/Returned/Empties out row): **Sold** (sum of `cylinders_sold` across products), **Empties in** (sum of `empties_collected`), and, only if Phase 2 exists, **Purchased** (sum of `cylinders_purchased`, hedged — see below).
   - **This month:** identical layout, values from `monthly_product_summary`/`monthly_money_summary` for `date_trunc('month', now())`. Adds one optional line beneath the sub-line: `"{+/-X}% from last month"`, computed as `(thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue`. **This comparison line is flagged optional/nice-to-have** — it wasn't explicitly requested by the stakeholder (only "monthly summaries" was), and it has an edge case worth calling out: if `lastMonth.revenue` is `0` (e.g. the app just launched), the percentage is undefined and the line should be omitted rather than showing `Infinity%` or `NaN%`. If cut for time, the month view simply omits this line with no other layout change.

4. **Per-product breakdown card:** a plain white rounded card (`rounded-[20px] border border-[#EFE7D8] bg-white p-5`, matching the Account profile card's shell) below the hero card, titled "By product". One row per product (19 kg, 5 kg — or however many `products` rows exist, so this scales automatically if a third size is ever added despite Phase 1 not building UI for adding one): product name on the left, then three right-aligned figures — cylinders sold, revenue, empties in — for the selected period. This is the one section that directly satisfies "breakdown by product where it makes sense": revenue and volume are meaningfully different per size, whereas payments/collections are already combined-only in this app's model (a payment isn't tied to a product — see Phase 1's rationale for why `amount_due` stays customer-level) so the payments figure is not split here.
   - If Phase 2 exists, a second, visually distinct (muted background, e.g. `bg-cream` instead of white) mini-section below the sale-side rows shows purchases per product: cylinders purchased and empties given to supplier, for the same period. Labeled "Purchased from supplier" so it's not confused with sales. **This entire sub-section is omitted if Phase 2's `purchases` table isn't available** — the Reports screen should degrade gracefully (just don't render the section) rather than error, since this spec can't guarantee Phase 2's exact shape.

5. **Revenue trend section:** titled "Revenue trend", with its own small toggle — `7 days | 30 days` — defaulting to `7 days`. Below the toggle, a bar chart built from plain divs:
   - A flex row of N bars (N = 7 or 30), each bar a `<div>` with `height: {pct}%` where `pct = day.revenue / maxRevenueInWindow * 100` (minimum height ~4% so a zero-revenue day still renders a visible sliver, not literally invisible), `background-color: var(--accent)` (or the existing `bg-accent` Tailwind class), rounded top corners (`rounded-t-md`), sitting on a baseline. Container is a fixed-height box (e.g. `h-[120px]`) with the bars as flex children (`flex items-end gap-1`), so the tallest bar always reaches the top of the box regardless of absolute revenue values — this is the same "relative bar height" trick used for the empties/sold/returned stat row spacing conceptually, just applied to a taller box.
   - Below the bars, for the 7-day view only (30 daily labels would be illegible at phone width), a row of single-letter or short day labels (`Mon`, `Tue`, ... or day-of-month numbers) under each bar, `text-[10px] text-muted`. The 30-day view omits per-bar labels and instead shows a single `"{startDate} – {endDate}"` caption underneath (using `formatDate` from `utils/format.ts`), consistent with how this app already prefers a single readable caption over a dense axis (there are no axes anywhere else in the app).
   - Tapping/pressing a bar is **not** interactive in this phase (no tooltip-on-tap) — keeping the chart a static visual, consistent with "no new interaction patterns" scope discipline; a numeric readout isn't needed since the hero card above already gives the exact today/month figures.
   - Data source: `select day, sum(revenue) as revenue from daily_product_summary where day >= $windowStart group by day order by day` (grouped across products for this combined view — a per-product stacked or multi-series bar chart was considered and rejected as scope creep for a first version; see Out of scope).
   - A new hook, `useRevenueTrend(days: 7 | 30)`, in `src/hooks/useRevenueTrend.ts`, following the exact shape of `useActivityFeed`/`useCustomerBalances` (a `useState` + `useEffect`/`refresh` pair returning `{ data, loading, error, refresh }`), querying `daily_product_summary` with a computed `$windowStart` and doing the cross-product `sum` client-side per day (a `reduce` over the product rows for each `day`, the same style of reduce already used in `Home.tsx`).

6. **Empty/loading/error states:** identical convention to every other page in this app — `{loading && <p className="text-muted">Loading…</p>}`, `{error && <p className="text-red-600">{error}</p>}`, and for a brand-new agency with zero transactions today, the hero card simply shows ₹0 / 0 sold / 0 empties rather than a special empty-state message (matching how `Home.tsx` doesn't special-case an all-zero `customer_balances` result).

**New hooks required:**
- `useDailySummary()` — today's `daily_product_summary` + `daily_money_summary` rows (and `daily_purchase_summary` if present).
- `useMonthlySummary()` — current and previous month's `monthly_product_summary` + `monthly_money_summary` rows.
- `useRevenueTrend(days)` — as described above.

Each follows the existing hook file convention (one file per hook, plain `supabase.from(...).select('*')...`, no shared data-fetching abstraction beyond what already exists — this app doesn't have React Query or SWR, and this spec doesn't introduce one).

**No changes to Home, Customer Detail, Activity Feed, or any transaction-entry screen.** This phase is additive-only: a new Account sub-screen and its supporting views/hooks. Nothing about how sales, returns, payments, or (assuming Phase 2) purchases are recorded changes.

## Testing approach

Consistent with the rest of the app: manual verification against the live Supabase project, no automated test suite exists or is introduced here.

- After running the migration, spot-check `daily_product_summary` and `daily_money_summary` for today's date directly in the Supabase SQL editor against a manual count of today's transactions (at least one day with a mix of both products and at least one payment).
- Record a new 19 kg sale and a new 5 kg sale today; confirm the Reports "Today" hero card's Sold figure and the per-product breakdown both update after a refresh (pull-to-refresh or re-navigating to the tab — this app doesn't have live subscriptions elsewhere, so Reports shouldn't introduce one either).
- Confirm the "Collected" sub-line correctly adds a paid-at-sale amount and a separately recorded payment on the same day (i.e., doesn't double count or miss either).
- Switch to "This month" and confirm the totals equal the sum of that month's daily figures (spot-check by summing a few days manually).
- If the month-over-month comparison line is implemented: test it against a month with zero revenue in the prior month and confirm it's hidden rather than showing `Infinity%`/`NaN%`.
- Toggle the revenue trend between 7 and 30 days; confirm the tallest bar in each window reaches full height and a day with literally zero revenue still renders a thin visible sliver, not a missing bar.
- If Phase 2 is implemented at the time of testing: confirm the "Purchased from supplier" sub-section appears and its figures match a manual count of that day's/month's purchase rows. If Phase 2 is not yet implemented: confirm the Reports screen renders correctly with that sub-section simply absent, with no error thrown.
- Confirm the new `/account/reports` row appears in the Account list in the position specified (after Products, before Export ledger) and navigates correctly; confirm the bottom nav itself is visually and functionally unchanged.

## Out of scope

- Any new bottom-nav slot or restructuring of the 5-slot nav — Reports is reached via Account only.
- Exportable/printable/PDF reports (a "share this month's numbers" feature) — `Export ledger` already exists for raw CSV export of the full ledger; this phase doesn't add a reports-specific export.
- Year-over-year or multi-month historical comparison beyond the single "vs. last month" delta (which is itself optional in this phase).
- A per-product multi-series or stacked version of the revenue trend chart (only a single combined-revenue trend bar chart is in scope; the per-product breakdown is a separate, non-chart card for the selected period).
- Interactive charts (tap-for-tooltip, drag-to-zoom, custom date-range picker) — the trend view is a static 7-or-30-day toggle only.
- Any new charting dependency — deliberately excluded per the justification in Data model/Purpose; if a future phase needs materially richer visualization than divs and SVG can reasonably provide, that should be its own explicitly-scoped decision, not smuggled into this phase.
- Godown/inventory stock-level views and capacity prediction — that is Phase 2's scope, not this one's, even though this spec reads Phase 2's `purchases` table for two summary figures.
- Push notifications, scheduled/emailed daily digests, or any background job — Reports is a pull (visit-the-screen) experience only, consistent with the rest of the app having no background jobs today.
- Editing or drilling down from a Reports figure into the underlying transaction list (e.g. tapping "12 sold today" to see which 12) — Activity Feed already exists as the drill-down surface for raw transaction history; Reports is aggregate-only.
- Real-time/live-updating figures while the screen is open — refresh-on-navigation only, matching every other data screen in this app.
