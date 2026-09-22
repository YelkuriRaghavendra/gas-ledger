# Commercial profit & loss — design

Date: 2026-09-21
Status: approved, ready for implementation plan
Segment: commercial only (domestic out of scope for this change)

## Problem

The app records what we charge (`bill_lines.amount`) and what we pay the plant
(`purchase_lines.amount`), but never brings the two together. There is no way to
answer "did we make money this month", "which customers are worth serving", or
"what did that bill actually earn".

LPG makes this sharper than in most trades. The OMC revises the commercial
cylinder rate on the 1st of every month, so stock bought in August and stock
bought in September carry different costs while sitting in the same godown. A
naive revenue-minus-purchases figure swings with the purchasing cycle rather than
with the business.

## Decisions

Four decisions were settled with the owner before this spec. They are recorded
here because each one has a defensible alternative, and a future reader will
otherwise assume the alternative was overlooked.

### 1. Cost basis: latest purchase price on or before the sale date

Each sale line is costed at the unit rate of the most recent `purchase_order` of
`type = 'purchase'` dated on or before that bill's date.

Rejected alternatives:

- **Weighted average across all purchases.** Closer to what a CA books, but it
  blends cheap old stock into today's margin and overstates repeatable profit.
- **Moving weighted average at sale date.** Textbook-correct, materially heavier
  query, and answers a question the owner is not asking.
- **Manual `cost_price` column.** Goes stale the first month nobody updates it.

Latest-purchase reflects replacement cost: what it costs to put that cylinder
back in the godown today. That is the number that tells the owner whether current
pricing works.

Consequence to surface in the UI: two bills for the same product at the same sale
price will show different profit if a price revision fell between them. This is
correct behaviour and must be explained inline, or it will be reported as a bug.

### 2. Profit timing: cash basis, settled oldest-first

Profit counts when money arrives, not when the cylinder leaves.

This cannot be read directly off the schema. `RecordPayment` inserts a separate
bill of `type = 'payment'` with zero `bill_lines`; it never flips the originating
sale bill's `paid` flag. So `bills.paid = true` means only "settled at the
counter at the moment of sale". A credit customer who pays in full every month
would show `paid = false` on every bill forever.

Settlement is therefore derived:

- Sale bills with `paid = true` are fully realised on their own date. They never
  enter the credit queue — that money never appeared as a payment bill.
- Sale bills with `paid = false` form a queue per customer, ordered by
  `created_at`.
- The customer's total payment-bill amount is applied to that queue oldest-first.
- A bill covered in full is fully realised. A partially covered bill realises its
  profit pro-rata: cover half the bill, realise half the profit.
- Payments exceeding total credit sales are an advance; the excess realises
  nothing further.

Rejected alternative: accrual (profit counts at billing). Standard accounting and
the recommendation at the time, but the owner wants the figure to track money in
hand. Accrual remains available later as a second view over the same data — the
realised/pending split already computes both halves.

### 3. Bill-wise profit on the customer screen

Profit is shown at three altitudes from one underlying view: per line, per bill,
per customer. The customer screen shows a per-bill figure on each sale row in the
existing history list, and a line-level cost breakdown in the existing detail
sheet.

### 4. Owner-only, enforced in the database

`profile?.role === 'owner'` checks already exist in seven screens, but they only
hide UI. Every table carries `for select to authenticated using (true)`, so any
signed-in staff member can read cost data through the API directly. Hiding a
button changes nothing.

Profit output is therefore gated server-side. Staff keep the Purchases screen and
current purchase visibility is unchanged — the gate applies to the derived profit
figures, not to the raw purchase records.

### 5. Profit is computed ex-GST

Confirmed with the owner: stored amounts on both `bill_lines` and
`purchase_lines` are GST-inclusive — what the customer hands over and what we pay
the plant. The agency is registered and claims input credit.

Profit must therefore be computed on base amounts, not on the stored figures. One
cylinder, commercial:

| | Stored (incl.) | Base | GST |
| --- | --- | --- | --- |
| Sold | 2900.00 | 2457.63 | 442.37 collected |
| Cost | 2750.00 | 2330.51 | 419.49 input credit |
| Difference | 150.00 | **127.12** | 22.88 payable |

The operation is a division, not a subtraction. `base = amount / (1 + rate)`, and
the tax slice of an inclusive amount is `amount * rate / (1 + rate)` — 15.25% of
the total at an 18% rate, not 18%. Writing `amount * 0.18` would take 18% of a
figure that already contains the tax and overstate GST by ~18%.

Because both legs carry the same rate, inclusive-basis profit is exactly
`ex-GST profit * 1.18`. Reporting on stored amounts would therefore read 18% high
on every commercial figure, and 5% high on domestic. Customer and product
rankings would be unaffected — the inflation is uniform — but absolute rupee
totals would be wrong by a material margin.

This adds the one schema change in this design: `products.gst_rate numeric not
null default 18`, backfilled to 5 for `segment = 'domestic'`. Per-product rather
than a single setting, because the two segments sit at different slabs and
accessories may differ again.

Reports gains a **GST payable** figure for the period: output GST collected minus
input credit claimed. Both halves already exist in the data once rates are known,
and the owner needs the number for filing regardless.

## Data model

One schema change: `products.gst_rate` (see decision 5). Everything else below is
a view or a function, reversible with `drop`.

### Costing rules

- Only `purchase_orders.type = 'purchase'` contributes cost. `type = 'opening'`
  rows are stock seeding with no real money behind them.
- Unit cost is `purchase_lines.amount / purchase_lines.qty`, guarded against
  `qty = 0` (TVS-style empties-only lines), then divided by
  `1 + products.gst_rate / 100` to reach the base rate. Revenue is stripped the
  same way. Both sides must be ex-GST or the margin is meaningless.
- If no purchase exists on or before the sale date, fall forward to the earliest
  purchase ever recorded for that product.
- If the product was never purchased at all — accessories sourced outside the OMC
  channel — cost is unknown. The line is flagged, excluded from profit totals,
  and the count of excluded lines is surfaced on the Reports screen. Silently
  costing these at zero would report infinite margin.
- A line whose product is a bundle (`bundle_components.bundle_product_id`) costs
  as the sum of its components' unit costs times their component quantities.

### Inclusion rules

- Only `bills.type = 'sale'` produces revenue and profit.
- `surrender = true` on a **sale** is a New Connection: the customer keeps the
  cylinder and returns no empty. It is a real sale and **counts**.
- `surrender = true` on a **return** is a customer exit. Returns carry no
  revenue and are excluded entirely.
- `type = 'opening'` bills are balance seeding and are excluded.
- Only products with `segment = 'commercial'`.

### Views

Internal, not granted to `authenticated`:

- `product_unit_cost` — one row per purchase line: product, IST date, unit cost.
- `bill_line_profit` — per sale line: revenue, resolved unit cost, cost, gross
  profit, `cost_known` flag.
- `bill_settlement` — per sale bill: realised fraction under the oldest-first
  rule above.

### Functions

Public API, `security definer`, each beginning with an owner check that raises
`insufficient_privilege` for anyone else:

- `commercial_profit_summary(from_date, to_date)` — revenue, COGS, gross profit,
  margin %, realised, pending, cylinders sold, unknown-cost line count, GST
  collected, input credit, GST payable. All money figures ex-GST except the three
  GST figures themselves.
- `commercial_profit_by_product(from_date, to_date)`
- `commercial_profit_by_customer(from_date, to_date)` — adds `amount_due` and
  `empties_outstanding` per customer.
- `commercial_profit_by_bill(customer_id)` — per-bill profit and realised state.
- `commercial_profit_for_bill(bill_id)` — line-level breakdown for the detail
  sheet, including which purchase order supplied the cost.

The owner check itself lives in one `stable security definer` helper so the rule
is stated once.

## UI

### Reports screen — new, `/commercial/reports`

Entry point is the account menu, not the bottom nav. [BottomNav.tsx](../../../src/components/BottomNav.tsx)
already carries four tabs plus quick-add; Reports is a monthly check and does not
warrant shrinking a daily-use tab.

Layout, following the existing Home hero pattern:

- Dark hero card: gross profit as the headline figure, margin % and cylinder
  count beneath, realised/pending split below a divider. Month stepper in the
  header, matching the Home month card.
- Two metric cards: revenue, cost.
- By-product breakdown.
- By-customer ranking, each row pairing profit against amount due.

Gross profit leads, not revenue. Revenue is the vanity number in this trade.
Pairing profit against dues in the same row is the screen's main purpose: a
customer can rank high on profit and be the worst account on the books.

### Customer detail — extended

The history list at [CustomerDetail.tsx:416](../../../src/pages/CustomerDetail.tsx)
gains a per-bill profit figure on each sale row, tagged realised or pending. The
header gains a profit / realised / due triple. The existing detail sheet gains a
margin block: sale rate, cost rate with its source PO number, profit, and per-
cylinder margin.

All of it owner-only.

### Home — one strip

A single card under the existing hero: profit this month, realised figure, margin
%, linking through to Reports. Owner-only.

## Phasing

1. **Cost layer** — `product_unit_cost` plus resolution rules. SQL only.
2. **Profit layer** — `bill_line_profit`, `bill_settlement`, the five functions
   and the owner guard. SQL only.
3. **Reports screen** — route, month stepper, three sections.
4. **Inline surfacing** — customer detail rows and sheet, Home strip.

Phases 1 and 2 are independently testable against known fixtures. Phases 3 and 4
need nothing further from the database.

## Testing

- Unit cost resolution: sale before any purchase, sale between two purchases,
  sale on the same day as a purchase, product never purchased, `qty = 0` line.
- Settlement: counter-paid sale, exact-cover payment, partial payment, payment
  spanning several bills, overpayment, payment before any sale.
- Inclusion: surrender sale counts, surrender return excluded, opening bills
  excluded, domestic products excluded.
- Bundles: bundle line costs as the sum of its components.
- GST: a 2900/2750 commercial pair yields profit 127.12 and GST payable 22.88,
  not 150 and 522. A product at a different `gst_rate` strips at its own rate.
  Guard against a future `gst_rate = 0` product dividing correctly by 1.
- Access: a `staff` profile calling each function receives
  `insufficient_privilege`, not an empty result set. An empty set would read as
  "no profit this month" and hide the failure.

## Out of scope

- Operating expenses (wages, transport, godown rent). This delivers gross margin,
  ex-GST. A full P&L needs an expenses table and is a separate change.
- GST returns. Reports shows GST payable for a period as a working figure; it is
  not a filing-grade computation and does not handle reverse charge, credit
  notes, or ineligible credit.
- Domestic segment reporting.
- Accrual-basis view.
- Payment-to-invoice allocation stored in the schema. Settlement is derived;
  making it explicit would need a new table and new UI.
