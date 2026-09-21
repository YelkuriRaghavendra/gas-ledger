# Commercial Profit & Loss Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner an ex-GST gross margin figure for the commercial segment — per month, per product, per customer, and per bill — with cost derived from the latest purchase price and profit realised as payments land.

**Architecture:** The database owns everything sensitive: cost resolution, GST stripping, and per-bill profit, exposed only through `security definer` functions that raise `42501` for non-owners. The client owns everything derivable from data staff can already read: payment settlement (oldest-first) and all rollups. That split keeps the owner gate meaningful while putting the testable logic in TypeScript, where this repo's vitest suite can reach it.

**Tech Stack:** Supabase (Postgres 15, PostgREST), React 18, React Router, TypeScript, Tailwind, vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-09-21-commercial-profit-loss-design.md`

## Global Constraints

- Segment is `commercial` only. Domestic rows must never appear in any figure.
- All money figures are **ex-GST** except fields explicitly named `gst_*` or suffixed `_incl`.
- GST is stripped by division: `base = amount / (1 + rate/100)`. Never `amount * rate/100`.
- Day bucketing is IST: `(created_at at time zone 'Asia/Kolkata')::date`. This matches every existing summary view in `db/schema.sql`.
- Only `bills.type = 'sale'` produces profit. `surrender = true` on a **sale** is a New Connection and **counts**. Returns and `opening` bills are excluded.
- Only `purchase_orders.type = 'purchase'` contributes cost. `opening` is stock seeding with no money behind it.
- A staff caller must receive an error, never an empty result set. An empty set reads as "no profit this month".
- Migrations are numbered SQL files in `supabase/migrations/`, and `db/schema.sql` is the canonical fresh-build schema. Both must be updated.
- Existing owner checks use `profile?.role === 'owner'` from `useAuth()`. Follow that pattern; it is presentation only, never the gate.
- Run `npm test` after every TypeScript task. Run `npx tsc -b` before any commit that touches `.tsx`.

---

### Task 1: Add `products.gst_rate`

**Files:**
- Create: `supabase/migrations/011_product_gst_rate.sql`
- Modify: `db/schema.sql:33-50` (products table), `db/schema.sql:437-450` (domestic seed)
- Modify: `src/types/db.ts:22-38` (Product interface)

**Interfaces:**
- Consumes: nothing.
- Produces: `products.gst_rate numeric not null default 18`, 5 for domestic rows. `Product.gst_rate: number` in TypeScript.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/011_product_gst_rate.sql`:

```sql
-- Profit must be computed on base amounts, not on the GST-inclusive figures the
-- app stores. bill_lines.amount is what the customer hands over and
-- purchase_lines.amount is what we pay the plant, both tax included.
--
-- Rate lives per product rather than in agency_settings because the two
-- segments sit at different slabs: commercial LPG at 18%, domestic at 5%.

alter table public.products
  add column if not exists gst_rate numeric not null default 18;

update public.products set gst_rate = 5 where segment = 'domestic';
```

- [ ] **Step 2: Apply it and verify**

Paste the file into the Supabase SQL editor and run it. Then run:

```sql
select segment, gst_rate, count(*) from products group by 1, 2 order by 1;
```

Expected: `commercial` rows at `18`, `domestic` rows at `5`. No other rates.

- [ ] **Step 3: Mirror it into the canonical schema**

In `db/schema.sql`, inside the `products` table definition, add after the `price` line:

```sql
  gst_rate           numeric     not null default 18,
```

In the domestic seed block at the bottom of the same file, the `values` rows insert `(name, price, segment, kind, unit, sort_order)`. Leave that list alone and add one statement directly after the seed insert:

```sql
update public.products set gst_rate = 5 where segment = 'domestic';
```

- [ ] **Step 4: Add the TypeScript field**

In `src/types/db.ts`, add to the `Product` interface after `price`:

```ts
  gst_rate: number
```

- [ ] **Step 5: Verify the build**

Run: `npx tsc -b`
Expected: exit 0. `Product` is constructed from `select *` everywhere, so no call site needs changing.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/011_product_gst_rate.sql db/schema.sql src/types/db.ts
git commit -m "feat(products): add gst_rate, 18 commercial and 5 domestic"
```

---

### Task 2: Cost resolution and per-line profit in SQL

**Files:**
- Create: `supabase/migrations/012_profit_views.sql`
- Modify: `db/schema.sql` (append to the VIEWS section)

**Interfaces:**
- Consumes: `products.gst_rate` from Task 1.
- Produces: view `public.product_unit_cost`, functions `public.resolve_unit_cost(bigint, date)` and `public.resolve_line_cost(bigint, date)`, views `public.bill_line_profit` and `public.bill_profit`. None are granted to clients — Task 3 wraps them.

`bill_profit` columns, relied on by Tasks 4 and 7: `bill_id bigint`, `bill_number text`, `customer_id bigint`, `created_at timestamptz`, `day date`, `paid boolean`, `qty numeric`, `revenue_incl numeric`, `revenue_ex numeric`, `cost_ex numeric`, `profit numeric`, `gst_out numeric`, `gst_in numeric`, `cost_known boolean`.

- [ ] **Step 1: Write the cost layer**

Create `supabase/migrations/012_profit_views.sql` with this first block:

```sql
-- Cost basis: the latest purchase rate on or before the sale date — replacement
-- cost, not a blended average. The OMC revises the commercial rate on the 1st of
-- every month, so two bills for the same product at the same sale price will
-- legitimately show different profit if a revision fell between them.

create or replace view public.product_unit_cost as
select
  pl.product_id,
  (po.created_at at time zone 'Asia/Kolkata')::date        as cost_date,
  (pl.amount / pl.qty) / (1 + p.gst_rate / 100.0)          as unit_cost_ex,
  po.po_number
from public.purchase_lines pl
join public.purchase_orders po on po.id = pl.purchase_order_id
join public.products p on p.id = pl.product_id
where po.type = 'purchase'
  and pl.qty > 0;

-- Prefers the nearest purchase on or before the sale date. Falls forward to the
-- earliest purchase after it when the product was first bought later than the
-- sale — otherwise a backdated bill would report infinite margin.
create or replace function public.resolve_unit_cost(p_product_id bigint, p_date date)
returns table (unit_cost_ex numeric, cost_source text)
language sql stable as $$
  select uc.unit_cost_ex, uc.po_number
  from public.product_unit_cost uc
  where uc.product_id = p_product_id
  order by
    (uc.cost_date <= p_date) desc,
    abs(uc.cost_date - p_date) asc
  limit 1
$$;

-- A bundle line (New Connection) has no purchase of its own; it costs as the sum
-- of its components. If any component's cost is unknown the sum is null, and the
-- line is flagged rather than silently costed at zero.
create or replace function public.resolve_line_cost(p_product_id bigint, p_date date)
returns table (unit_cost_ex numeric, cost_source text)
language sql stable as $$
  select direct.unit_cost_ex, direct.cost_source
  from public.resolve_unit_cost(p_product_id, p_date) direct
  union all
  select
    sum(bc.qty * comp.unit_cost_ex),
    'bundle'
  from public.bundle_components bc
  cross join lateral public.resolve_unit_cost(bc.component_product_id, p_date) comp
  where bc.bundle_product_id = p_product_id
    and not exists (select 1 from public.resolve_unit_cost(p_product_id, p_date))
  limit 1
$$;
```

- [ ] **Step 2: Write the profit views**

Append to the same file:

```sql
create or replace view public.bill_line_profit as
select
  bl.id                                                      as bill_line_id,
  b.id                                                       as bill_id,
  b.bill_number,
  b.customer_id,
  b.created_at,
  (b.created_at at time zone 'Asia/Kolkata')::date           as day,
  b.paid,
  bl.product_id,
  p.name                                                     as product_name,
  p.gst_rate,
  bl.qty,
  bl.amount                                                  as revenue_incl,
  round(bl.amount / (1 + p.gst_rate / 100.0), 2)             as revenue_ex,
  round(bl.amount - bl.amount / (1 + p.gst_rate / 100.0), 2) as gst_out,
  round(c.unit_cost_ex, 2)                                   as unit_cost_ex,
  round(bl.qty * c.unit_cost_ex, 2)                          as cost_ex,
  round(bl.qty * c.unit_cost_ex * p.gst_rate / 100.0, 2)     as gst_in,
  round(bl.amount / (1 + p.gst_rate / 100.0)
        - bl.qty * c.unit_cost_ex, 2)                        as profit,
  (c.unit_cost_ex is not null)                               as cost_known,
  c.cost_source
from public.bill_lines bl
join public.bills b on b.id = bl.bill_id
join public.products p on p.id = bl.product_id
left join lateral public.resolve_line_cost(
  bl.product_id, (b.created_at at time zone 'Asia/Kolkata')::date
) c on true
where b.type = 'sale'
  and p.segment = 'commercial';

create or replace view public.bill_profit as
select
  bill_id, bill_number, customer_id, created_at, day, paid,
  sum(qty)           as qty,
  sum(revenue_incl)  as revenue_incl,
  sum(revenue_ex)    as revenue_ex,
  sum(cost_ex)       as cost_ex,
  sum(profit)        as profit,
  sum(gst_out)       as gst_out,
  sum(gst_in)        as gst_in,
  bool_and(cost_known) as cost_known
from public.bill_line_profit
group by bill_id, bill_number, customer_id, created_at, day, paid;
```

- [ ] **Step 3: Apply and verify the GST arithmetic**

Run the file in the Supabase SQL editor, then run this against a real commercial sale:

```sql
select bill_number, qty, revenue_incl, revenue_ex, gst_out,
       unit_cost_ex, cost_ex, profit, cost_known, cost_source
from bill_line_profit
order by created_at desc
limit 5;
```

Expected for a 12 × 19 kg line sold at ₹2,900 each against a ₹2,750 purchase:
`revenue_incl 34800`, `revenue_ex 29491.53`, `gst_out 5308.47`, `unit_cost_ex 2330.51`, `cost_ex 27966.12`, `profit 1525.41`, `cost_known true`.

Sanity check the per-cylinder figure: `1525.41 / 12 = 127.12`. If you see `150.00` the division was skipped somewhere.

- [ ] **Step 4: Verify the exclusions**

```sql
select count(*) from bill_line_profit blp
join bills b on b.id = blp.bill_id
where b.type <> 'sale';
```
Expected: `0`.

```sql
select count(*) from bill_line_profit blp
join products p on p.id = blp.product_id
where p.segment <> 'commercial';
```
Expected: `0`.

```sql
select count(*) from bill_line_profit blp
join bills b on b.id = blp.bill_id
where b.surrender;
```
Expected: greater than zero if you have New Connection sales. These must be present — a surrender sale is real revenue.

- [ ] **Step 5: Check for unknown-cost lines**

```sql
select product_name, count(*) from bill_line_profit
where not cost_known group by 1 order by 2 desc;
```

Record the result. These are products never purchased through a recorded purchase order — typically accessories. They are excluded from profit totals by design, and Task 8 surfaces the count on screen. If a **cylinder** product appears here, stop and investigate: it means purchase orders are missing, not that the design is wrong.

- [ ] **Step 6: Mirror into the canonical schema**

Append the full contents of `012_profit_views.sql` to the VIEWS section of `db/schema.sql`, after the `daily_money_summary` view.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/012_profit_views.sql db/schema.sql
git commit -m "feat(reports): ex-GST per-line and per-bill profit views"
```

---

### Task 3: Owner gate and the public functions

**Files:**
- Create: `supabase/migrations/013_profit_access.sql`
- Modify: `db/schema.sql` (append after the Task 2 views)

**Interfaces:**
- Consumes: `public.bill_profit` and `public.bill_line_profit` from Task 2.
- Produces: `public.commercial_bill_profit(p_from date, p_to date)`, `public.commercial_bill_profit_for_customer(p_customer_id bigint)`, `public.commercial_bill_line_profit(p_bill_id bigint)`, `public.commercial_line_profit_range(p_from date, p_to date)`. Each returns the row shape of the underlying view and raises SQLSTATE `42501` for non-owners. Task 7 calls these via `supabase.rpc`.

- [ ] **Step 1: Write the guard and the functions**

Create `supabase/migrations/013_profit_access.sql`:

```sql
-- The app's existing profile?.role === 'owner' checks only hide UI. Every table
-- carries `for select to authenticated using (true)`, so a staff member with a
-- browser console can read cost data directly. Profit output is therefore gated
-- here, where the API itself refuses.
--
-- Staff keep the Purchases screen: raw purchase visibility is deliberately
-- unchanged. Only the derived profit figures are owner-only.

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  )
$$;

create or replace function public.require_owner()
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then
    -- 42501 = insufficient_privilege. Deliberately an error, not an empty set:
    -- an empty set renders as "no profit this month" and hides the refusal.
    raise exception 'owner role required' using errcode = '42501';
  end if;
end $$;

create or replace function public.commercial_bill_profit(p_from date, p_to date)
returns setof public.bill_profit
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  return query
    select * from public.bill_profit
    where day >= p_from and day < p_to
    order by created_at desc;
end $$;

create or replace function public.commercial_bill_profit_for_customer(p_customer_id bigint)
returns setof public.bill_profit
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  return query
    select * from public.bill_profit
    where customer_id = p_customer_id
    order by created_at desc;
end $$;

create or replace function public.commercial_bill_line_profit(p_bill_id bigint)
returns setof public.bill_line_profit
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  return query
    select * from public.bill_line_profit where bill_id = p_bill_id;
end $$;

-- Line-level rows for a period, so Reports can break profit down by product.
create or replace function public.commercial_line_profit_range(p_from date, p_to date)
returns setof public.bill_line_profit
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  return query
    select * from public.bill_line_profit
    where day >= p_from and day < p_to;
end $$;
```

- [ ] **Step 2: Lock the underlying objects**

Append to the same file:

```sql
revoke all on public.product_unit_cost from anon, authenticated;
revoke all on public.bill_line_profit  from anon, authenticated;
revoke all on public.bill_profit       from anon, authenticated;

revoke all on function public.resolve_unit_cost(bigint, date) from anon, authenticated;
revoke all on function public.resolve_line_cost(bigint, date) from anon, authenticated;

grant execute on function public.commercial_bill_profit(date, date)          to authenticated;
grant execute on function public.commercial_bill_profit_for_customer(bigint) to authenticated;
grant execute on function public.commercial_bill_line_profit(bigint)         to authenticated;
grant execute on function public.commercial_line_profit_range(date, date)    to authenticated;
```

- [ ] **Step 3: Apply and verify as owner**

Run the file. Then, signed in as the owner account in the app, open the browser console on any page and run:

```js
const { data, error } = await window.supabase.rpc('commercial_bill_profit', { p_from: '2026-09-01', p_to: '2026-10-01' })
console.log(error, data?.length, data?.[0])
```

Expected: `error` null, a row count, and a row carrying `profit` and `cost_known`.

If `window.supabase` is not exposed, add a temporary `window.supabase = supabase` line to `src/lib/supabase.ts`, verify, then remove it before committing.

- [ ] **Step 4: Verify the refusal as staff**

Sign in as a staff account. Run the same snippet.

Expected: `data` null, and `error.code === '42501'` with message `owner role required`. A result of `[]` is a **failure** — it means the grant or the guard is wrong, and the screen would render "no profit" instead of refusing.

- [ ] **Step 5: Verify the views are unreachable directly**

Still signed in as staff:

```js
const { error } = await window.supabase.from('bill_profit').select('*').limit(1)
console.log(error)
```

Expected: a permission-denied error. If rows come back, the `revoke` did not take — check whether Supabase default privileges re-granted the view.

- [ ] **Step 6: Mirror into the canonical schema and commit**

Append the contents of `013_profit_access.sql` to `db/schema.sql`, after the Task 2 views.

```bash
git add supabase/migrations/013_profit_access.sql db/schema.sql
git commit -m "feat(reports): owner-only access to profit functions"
```

---

### Task 4: Profit types

**Files:**
- Modify: `src/types/db.ts` (append at end)

**Interfaces:**
- Consumes: the `bill_profit` and `bill_line_profit` column lists from Task 2.
- Produces: `BillProfit`, `BillLineProfit`, `PaymentBill` — imported by Tasks 5, 6, 7, 8, 9, 10.

- [ ] **Step 1: Add the interfaces**

Append to `src/types/db.ts`:

```ts
// One row per commercial sale bill, from commercial_bill_profit(). Every money
// field is ex-GST except revenue_incl and the gst_* pair.
export interface BillProfit {
  bill_id: number
  bill_number: string
  customer_id: number | null
  created_at: string
  day: string
  paid: boolean
  qty: number
  revenue_incl: number
  revenue_ex: number
  cost_ex: number
  profit: number
  gst_out: number
  gst_in: number
  cost_known: boolean
}

export interface BillLineProfit {
  bill_line_id: number
  bill_id: number
  bill_number: string
  customer_id: number | null
  created_at: string
  day: string
  paid: boolean
  product_id: number
  product_name: string
  gst_rate: number
  qty: number
  revenue_incl: number
  revenue_ex: number
  gst_out: number
  unit_cost_ex: number | null
  cost_ex: number | null
  gst_in: number | null
  profit: number | null
  cost_known: boolean
  cost_source: string | null
}

// Payment bills carry no lines, so they are read from `bills` directly rather
// than through the gated profit functions.
export interface PaymentBill {
  customer_id: number
  created_at: string
  total_amount: number
}
```

- [ ] **Step 2: Verify the build**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/types/db.ts
git commit -m "feat(reports): profit row types"
```

---

### Task 5: Oldest-first settlement

**Files:**
- Create: `src/utils/profit.ts`
- Test: `src/utils/profit.test.ts`

**Interfaces:**
- Consumes: `BillProfit`, `PaymentBill` from Task 4.
- Produces: `settleOldestFirst(bills: BillProfit[], payments: PaymentBill[]): SettledBill[]`, and the exported `SettledBill` interface extending `BillProfit` with `realisedFraction: number`, `realisedProfit: number`, `pendingProfit: number`. Tasks 6, 8, 9 consume it.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/profit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { settleOldestFirst } from './profit'
import type { BillProfit, PaymentBill } from '../types/db'

function bill(id: number, day: string, revenueIncl: number, profit: number, paid = false): BillProfit {
  return {
    bill_id: id,
    bill_number: `B-${id}`,
    customer_id: 1,
    created_at: `${day}T10:00:00+05:30`,
    day,
    paid,
    qty: 1,
    revenue_incl: revenueIncl,
    revenue_ex: revenueIncl / 1.18,
    cost_ex: 0,
    profit,
    gst_out: revenueIncl - revenueIncl / 1.18,
    gst_in: 0,
    cost_known: true,
  }
}

function payment(day: string, amount: number): PaymentBill {
  return { customer_id: 1, created_at: `${day}T10:00:00+05:30`, total_amount: amount }
}

describe('settleOldestFirst', () => {
  it('treats a counter-paid sale as fully realised without consuming payments', () => {
    const [settled] = settleOldestFirst([bill(1, '2026-09-03', 29000, 3000, true)], [])
    expect(settled.realisedFraction).toBe(1)
    expect(settled.realisedProfit).toBe(3000)
    expect(settled.pendingProfit).toBe(0)
  })

  it('clears the oldest credit bill first', () => {
    const bills = [
      bill(3, '2026-09-18', 34800, 1800),
      bill(2, '2026-09-12', 23200, 1200),
      bill(1, '2026-09-03', 29000, 3000),
    ]
    const result = settleOldestFirst(bills, [payment('2026-09-05', 29000)])
    const byId = new Map(result.map((r) => [r.bill_id, r]))
    expect(byId.get(1)!.realisedProfit).toBe(3000)
    expect(byId.get(2)!.realisedProfit).toBe(0)
    expect(byId.get(3)!.realisedProfit).toBe(0)
  })

  it('splits a partly covered bill pro-rata', () => {
    const result = settleOldestFirst([bill(1, '2026-09-03', 29000, 3000)], [payment('2026-09-05', 14500)])
    expect(result[0].realisedFraction).toBe(0.5)
    expect(result[0].realisedProfit).toBe(1500)
    expect(result[0].pendingProfit).toBe(1500)
  })

  it('spans several bills with one payment', () => {
    const bills = [bill(1, '2026-09-03', 29000, 3000), bill(2, '2026-09-12', 23200, 1200)]
    const result = settleOldestFirst(bills, [payment('2026-09-20', 40600)])
    const byId = new Map(result.map((r) => [r.bill_id, r]))
    expect(byId.get(1)!.realisedFraction).toBe(1)
    expect(byId.get(2)!.realisedFraction).toBe(0.5)
    expect(byId.get(2)!.realisedProfit).toBe(600)
  })

  it('caps an overpayment at the bills that exist', () => {
    const result = settleOldestFirst([bill(1, '2026-09-03', 29000, 3000)], [payment('2026-09-05', 50000)])
    expect(result[0].realisedFraction).toBe(1)
    expect(result[0].pendingProfit).toBe(0)
  })

  it('realises nothing when there are no payments', () => {
    const result = settleOldestFirst([bill(1, '2026-09-03', 29000, 3000)], [])
    expect(result[0].realisedProfit).toBe(0)
    expect(result[0].pendingProfit).toBe(3000)
  })

  it('settles each customer from its own payment pool', () => {
    const bills = [bill(1, '2026-09-03', 29000, 3000), { ...bill(2, '2026-09-04', 29000, 3000), customer_id: 2 }]
    const result = settleOldestFirst(bills, [payment('2026-09-05', 29000)])
    const byId = new Map(result.map((r) => [r.bill_id, r]))
    expect(byId.get(1)!.realisedFraction).toBe(1)
    expect(byId.get(2)!.realisedFraction).toBe(0)
  })

  it('treats a zero-value bill as settled', () => {
    const result = settleOldestFirst([bill(1, '2026-09-03', 0, 0)], [])
    expect(result[0].realisedFraction).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/utils/profit.test.ts`
Expected: FAIL — `Failed to resolve import "./profit"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/profit.ts`:

```ts
import type { BillProfit, PaymentBill } from '../types/db'

export interface SettledBill extends BillProfit {
  realisedFraction: number
  realisedProfit: number
  pendingProfit: number
}

// Payments are recorded as standalone bills with no lines (RecordPayment.tsx),
// so they never flip the originating sale's `paid` flag — that flag means only
// "settled at the counter". Realisation is therefore derived: money received
// pays off the oldest outstanding bills first, the way the trade actually works.
//
// Counter-paid sales are fully realised on their own date and stay out of the
// credit queue, because their money never appeared as a payment bill.
export function settleOldestFirst(bills: BillProfit[], payments: PaymentBill[]): SettledBill[] {
  const pool = new Map<number, number>()
  for (const p of payments) {
    if (p.customer_id == null) continue
    pool.set(p.customer_id, (pool.get(p.customer_id) ?? 0) + p.total_amount)
  }

  const credit = bills
    .filter((b) => !b.paid)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const fractions = new Map<number, number>()
  for (const b of credit) {
    if (b.revenue_incl <= 0) {
      fractions.set(b.bill_id, 1)
      continue
    }
    const key = b.customer_id ?? -1
    const available = pool.get(key) ?? 0
    const covered = Math.min(b.revenue_incl, Math.max(0, available))
    pool.set(key, available - covered)
    fractions.set(b.bill_id, covered / b.revenue_incl)
  }

  return bills.map((b) => {
    const fraction = b.paid ? 1 : (fractions.get(b.bill_id) ?? 0)
    const realisedProfit = b.profit * fraction
    return {
      ...b,
      realisedFraction: fraction,
      realisedProfit,
      pendingProfit: b.profit - realisedProfit,
    }
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/utils/profit.test.ts`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/utils/profit.ts src/utils/profit.test.ts
git commit -m "feat(reports): oldest-first payment settlement"
```

---

### Task 6: Rollups

**Files:**
- Modify: `src/utils/profit.ts` (append)
- Modify: `src/utils/profit.test.ts` (append)

**Interfaces:**
- Consumes: `SettledBill` from Task 5, `BillLineProfit` from Task 4.
- Produces: `summariseProfit(bills: SettledBill[]): ProfitSummary`, `profitByCustomer(bills: SettledBill[], names: Map<number, string>): CustomerProfit[]`, `profitByProduct(lines: BillLineProfit[]): ProductProfit[]`. `ProfitSummary` carries `revenue`, `cost`, `profit`, `marginPct`, `realised`, `pending`, `qty`, `gstOut`, `gstIn`, `gstPayable`, `unknownCostBills`. `CustomerProfit` carries `customerId`, `name`, `qty`, `profit`, `realised`, `pending`. `ProductProfit` carries `productId`, `name`, `qty`, `revenue`, `cost`, `profit`. Tasks 8 and 9 render these.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/profit.test.ts`:

```ts
import { summariseProfit, profitByCustomer, profitByProduct } from './profit'
import type { SettledBill as Settled } from './profit'
import type { BillLineProfit } from '../types/db'

function settled(over: Partial<Settled>): Settled {
  return {
    bill_id: 1, bill_number: 'B-1', customer_id: 1,
    created_at: '2026-09-03T10:00:00+05:30', day: '2026-09-03', paid: false,
    qty: 10, revenue_incl: 29000, revenue_ex: 24576.27, cost_ex: 23305.08,
    profit: 1271.19, gst_out: 4423.73, gst_in: 4194.91, cost_known: true,
    realisedFraction: 1, realisedProfit: 1271.19, pendingProfit: 0,
    ...over,
  }
}

function line(over: Partial<BillLineProfit>): BillLineProfit {
  return {
    bill_line_id: 1, bill_id: 1, bill_number: 'B-1', customer_id: 1,
    created_at: '2026-09-03T10:00:00+05:30', day: '2026-09-03', paid: false,
    product_id: 1, product_name: '19 kg', gst_rate: 18, qty: 10,
    revenue_incl: 29000, revenue_ex: 24576.27, gst_out: 4423.73,
    unit_cost_ex: 2330.51, cost_ex: 23305.08, gst_in: 4194.91,
    profit: 1271.19, cost_known: true, cost_source: 'PO-1',
    ...over,
  }
}

describe('summariseProfit', () => {
  it('totals revenue, cost, profit and margin ex-GST', () => {
    const s = summariseProfit([settled({}), settled({ bill_id: 2 })])
    expect(s.revenue).toBeCloseTo(49152.54, 2)
    expect(s.profit).toBeCloseTo(2542.38, 2)
    expect(s.marginPct).toBeCloseTo(5.17, 2)
    expect(s.qty).toBe(20)
  })

  it('splits realised from pending', () => {
    const s = summariseProfit([
      settled({ realisedFraction: 1, realisedProfit: 1271.19, pendingProfit: 0 }),
      settled({ bill_id: 2, realisedFraction: 0, realisedProfit: 0, pendingProfit: 1271.19 }),
    ])
    expect(s.realised).toBeCloseTo(1271.19, 2)
    expect(s.pending).toBeCloseTo(1271.19, 2)
  })

  it('reports GST payable as output minus input credit', () => {
    const s = summariseProfit([settled({})])
    expect(s.gstPayable).toBeCloseTo(228.82, 2)
  })

  it('counts unknown-cost bills and keeps them out of profit', () => {
    const s = summariseProfit([settled({}), settled({ bill_id: 2, cost_known: false, profit: 0, cost_ex: 0 })])
    expect(s.unknownCostBills).toBe(1)
    expect(s.profit).toBeCloseTo(1271.19, 2)
  })

  it('returns a zero margin rather than NaN on empty input', () => {
    const s = summariseProfit([])
    expect(s.profit).toBe(0)
    expect(s.marginPct).toBe(0)
  })
})

describe('profitByCustomer', () => {
  it('groups by customer and sorts by profit descending', () => {
    const rows = profitByCustomer(
      [
        settled({ bill_id: 1, customer_id: 1, profit: 1000, realisedProfit: 1000, pendingProfit: 0 }),
        settled({ bill_id: 2, customer_id: 2, profit: 4000, realisedProfit: 0, pendingProfit: 4000 }),
        settled({ bill_id: 3, customer_id: 1, profit: 500, realisedProfit: 500, pendingProfit: 0 }),
      ],
      new Map([[1, 'Hotel Anand'], [2, 'Balaji Mess']]),
    )
    expect(rows.map((r) => r.name)).toEqual(['Balaji Mess', 'Hotel Anand'])
    expect(rows[1].profit).toBe(1500)
    expect(rows[1].realised).toBe(1500)
  })

  it('falls back to a placeholder when the name is unknown', () => {
    const rows = profitByCustomer([settled({ customer_id: 9 })], new Map())
    expect(rows[0].name).toBe('Customer 9')
  })
})

describe('profitByProduct', () => {
  it('groups lines by product and sorts by profit descending', () => {
    const rows = profitByProduct([
      line({ bill_line_id: 1, product_id: 1, product_name: '19 kg', profit: 1000, qty: 10 }),
      line({ bill_line_id: 2, product_id: 2, product_name: '47.5 kg', profit: 3000, qty: 4 }),
      line({ bill_line_id: 3, product_id: 1, product_name: '19 kg', profit: 500, qty: 5 }),
    ])
    expect(rows.map((r) => r.name)).toEqual(['47.5 kg', '19 kg'])
    expect(rows[1].qty).toBe(15)
    expect(rows[1].profit).toBe(1500)
  })

  it('skips unknown-cost lines', () => {
    const rows = profitByProduct([
      line({ bill_line_id: 1, product_id: 1, profit: 1000 }),
      line({ bill_line_id: 2, product_id: 1, cost_known: false, profit: null, cost_ex: null }),
    ])
    expect(rows[0].profit).toBe(1000)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/utils/profit.test.ts`
Expected: FAIL — `summariseProfit is not a function` (or an import error).

- [ ] **Step 3: Write the implementation**

Append to `src/utils/profit.ts`:

```ts
import type { BillLineProfit } from '../types/db'

export interface ProfitSummary {
  revenue: number
  cost: number
  profit: number
  marginPct: number
  realised: number
  pending: number
  qty: number
  gstOut: number
  gstIn: number
  gstPayable: number
  unknownCostBills: number
}

export interface CustomerProfit {
  customerId: number
  name: string
  qty: number
  profit: number
  realised: number
  pending: number
}

export interface ProductProfit {
  productId: number
  name: string
  qty: number
  revenue: number
  cost: number
  profit: number
}

// Bills whose cost could not be resolved contribute revenue context but never
// profit — costing them at zero would report infinite margin. The count is
// surfaced on screen so a missing purchase order is visible rather than silent.
export function summariseProfit(bills: SettledBill[]): ProfitSummary {
  let revenue = 0, cost = 0, profit = 0, realised = 0, pending = 0
  let qty = 0, gstOut = 0, gstIn = 0, unknownCostBills = 0

  for (const b of bills) {
    revenue += b.revenue_ex
    gstOut += b.gst_out
    qty += b.qty
    if (!b.cost_known) {
      unknownCostBills += 1
      continue
    }
    cost += b.cost_ex
    gstIn += b.gst_in
    profit += b.profit
    realised += b.realisedProfit
    pending += b.pendingProfit
  }

  return {
    revenue, cost, profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    realised, pending, qty, gstOut, gstIn,
    gstPayable: gstOut - gstIn,
    unknownCostBills,
  }
}

export function profitByCustomer(bills: SettledBill[], names: Map<number, string>): CustomerProfit[] {
  const acc = new Map<number, CustomerProfit>()
  for (const b of bills) {
    if (b.customer_id == null || !b.cost_known) continue
    const row = acc.get(b.customer_id) ?? {
      customerId: b.customer_id,
      name: names.get(b.customer_id) ?? `Customer ${b.customer_id}`,
      qty: 0, profit: 0, realised: 0, pending: 0,
    }
    row.qty += b.qty
    row.profit += b.profit
    row.realised += b.realisedProfit
    row.pending += b.pendingProfit
    acc.set(b.customer_id, row)
  }
  return [...acc.values()].sort((a, b) => b.profit - a.profit)
}

export function profitByProduct(lines: BillLineProfit[]): ProductProfit[] {
  const acc = new Map<number, ProductProfit>()
  for (const l of lines) {
    if (!l.cost_known || l.profit == null || l.cost_ex == null) continue
    const row = acc.get(l.product_id) ?? {
      productId: l.product_id, name: l.product_name,
      qty: 0, revenue: 0, cost: 0, profit: 0,
    }
    row.qty += l.qty
    row.revenue += l.revenue_ex
    row.cost += l.cost_ex
    row.profit += l.profit
    acc.set(l.product_id, row)
  }
  return [...acc.values()].sort((a, b) => b.profit - a.profit)
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: every existing test still passing, plus the new ones.

- [ ] **Step 5: Commit**

```bash
git add src/utils/profit.ts src/utils/profit.test.ts
git commit -m "feat(reports): profit rollups by customer, product and period"
```

---

### Task 7: `useCommercialProfit` hook

**Files:**
- Create: `src/hooks/useCommercialProfit.ts`

**Interfaces:**
- Consumes: the RPC functions from Task 3, `settleOldestFirst` from Task 5, `BillProfit` / `PaymentBill` from Task 4.
- Produces: `useCommercialProfit(year: number, month: number)` returning `{ bills: SettledBill[], lines: BillLineProfit[], loading: boolean, error: string | null, forbidden: boolean, refresh: () => Promise<void> }`. Tasks 8 and 10 consume it. `useCustomerProfit(customerId: number)` returning the same shape minus `lines`; Task 9 consumes it.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useCommercialProfit.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { settleOldestFirst, type SettledBill } from '../utils/profit'
import type { BillLineProfit, BillProfit, PaymentBill } from '../types/db'

// Half-open [start, end) bounds on the view's IST `day` column, matching
// useMonthSummary so both screens bucket a month identically.
function monthBounds(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return { start: `${year}-${pad(month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` }
}

// Realisation is settled against the customer's whole payment history, not just
// the month on screen: a September bill can be cleared by an October payment,
// and a payment made before the window still covers bills inside it.
async function loadPayments(): Promise<PaymentBill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select('customer_id, created_at, total_amount')
    .eq('type', 'payment')
  if (error) throw error
  return (data ?? []).filter((p) => p.customer_id != null) as PaymentBill[]
}

function isForbidden(error: { code?: string } | null) {
  return error?.code === '42501'
}

export function useCommercialProfit(year: number, month: number) {
  const [bills, setBills] = useState<SettledBill[]>([])
  const [lines, setLines] = useState<BillLineProfit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setForbidden(false)
    const { start, end } = monthBounds(year, month)

    const [billRes, lineRes] = await Promise.all([
      supabase.rpc('commercial_bill_profit', { p_from: start, p_to: end }),
      supabase.rpc('commercial_line_profit_range', { p_from: start, p_to: end }),
    ])

    const rpcError = billRes.error ?? lineRes.error
    if (rpcError) {
      setForbidden(isForbidden(rpcError))
      setError(isForbidden(rpcError) ? null : rpcError.message)
      setBills([])
      setLines([])
      setLoading(false)
      return
    }

    try {
      const payments = await loadPayments()
      setBills(settleOldestFirst((billRes.data ?? []) as BillProfit[], payments))
      setLines((lineRes.data ?? []) as BillLineProfit[])
      setError(null)
    } catch (e: any) {
      setError(e.message)
      setBills([])
      setLines([])
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { bills, lines, loading, error, forbidden, refresh }
}

export function useCustomerProfit(customerId: number) {
  const [bills, setBills] = useState<SettledBill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setForbidden(false)

    const { data, error: rpcError } = await supabase.rpc('commercial_bill_profit_for_customer', {
      p_customer_id: customerId,
    })

    if (rpcError) {
      setForbidden(isForbidden(rpcError))
      setError(isForbidden(rpcError) ? null : rpcError.message)
      setBills([])
      setLoading(false)
      return
    }

    const { data: payments, error: payError } = await supabase
      .from('bills')
      .select('customer_id, created_at, total_amount')
      .eq('type', 'payment')
      .eq('customer_id', customerId)

    if (payError) {
      setError(payError.message)
      setBills([])
      setLoading(false)
      return
    }

    setBills(settleOldestFirst((data ?? []) as BillProfit[], (payments ?? []) as PaymentBill[]))
    setError(null)
    setLoading(false)
  }, [customerId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { bills, loading, error, forbidden, refresh }
}
```

- [ ] **Step 2: Verify the build**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCommercialProfit.ts
git commit -m "feat(reports): useCommercialProfit and useCustomerProfit hooks"
```

---

### Task 8: Reports screen

**Files:**
- Create: `src/pages/Reports.tsx`
- Modify: `src/App.tsx:63` (add the route beside the other commercial routes)
- Modify: `src/components/AccountMenu.tsx:25` (add the entry, owner only)

**Interfaces:**
- Consumes: `useCommercialProfit` from Task 7, `summariseProfit` / `profitByCustomer` from Task 6, `useCustomerBalances` (existing) for the due column, `useProfiles`-free `useAuth()` for the owner check.
- Produces: route `/commercial/reports`.

- [ ] **Step 1: Write the page**

Create `src/pages/Reports.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { ChevronLeftIcon } from '../components/icons'
import { useAuth } from '../auth/AuthContext'
import { useCommercialProfit } from '../hooks/useCommercialProfit'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { currentMonthInIST } from '../hooks/useMonthSummary'
import { profitByCustomer, profitByProduct, summariseProfit } from '../utils/profit'
import { formatCurrency } from '../utils/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function Reports() {
  const { profile } = useAuth()
  const now = currentMonthInIST()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [accountOpen, setAccountOpen] = useState(false)

  const { bills, lines, loading, error, forbidden } = useCommercialProfit(year, month)
  const { data: balances } = useCustomerBalances()

  const summary = useMemo(() => summariseProfit(bills), [bills])
  const names = useMemo(() => new Map(balances.map((c) => [c.id, c.name])), [balances])
  const dues = useMemo(() => new Map(balances.map((c) => [c.id, c.amount_due])), [balances])
  const customers = useMemo(() => profitByCustomer(bills, names), [bills, names])
  const products = useMemo(() => profitByProduct(lines), [lines])

  const atCurrentMonth = year === now.year && month === now.month
  const denied = forbidden || (profile != null && profile.role !== 'owner')

  function shiftMonth(delta: number) {
    const next = month + delta
    if (next < 1) { setMonth(12); setYear(year - 1) }
    else if (next > 12) { setMonth(1); setYear(year + 1) }
    else setMonth(next)
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <AppHeader view="commercial" onOpenAccount={() => setAccountOpen(true)} title="Reports" />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="px-4">
        {loading && !denied && <p className="text-muted">Loading…</p>}
        {denied && <p className="text-muted">Only the owner can view reports.</p>}
        {error && !denied && <p className="text-red-600">{error}</p>}

        {!loading && !denied && !error && (
          <>
            <div className="rounded-[26px] bg-gradient-to-br from-inkSoft to-ink p-6 text-white shadow-float">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#C9BBA8]">Gross profit</p>
                <div className="-mr-[5px] flex items-center gap-[2px]">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="grid h-[22px] w-[22px] place-items-center rounded-[7px] text-white/55 active:scale-90 active:bg-white/10"
                  >
                    <ChevronLeftIcon size={15} />
                  </button>
                  <span className="min-w-[62px] text-center font-display text-[12.5px] font-bold">
                    {MONTHS[month - 1]} {year}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    disabled={atCurrentMonth}
                    aria-label="Next month"
                    className="grid h-[22px] w-[22px] place-items-center rounded-[7px] text-white/55 active:scale-90 active:bg-white/10 disabled:opacity-20"
                  >
                    <span className="rotate-180"><ChevronLeftIcon size={15} /></span>
                  </button>
                </div>
              </div>

              <p className="mt-1 font-display text-[38px] font-bold leading-none tracking-[-1px]">
                {formatCurrency(summary.profit)}
              </p>
              <p className="mt-[9px] text-[12.5px] font-semibold text-mutedOnDark">
                {summary.marginPct.toFixed(1)}% margin · {summary.qty} cylinders · excludes GST
              </p>

              <div className="mt-[15px] flex items-center gap-5 border-t border-white/[.14] pt-[12px]">
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">Realised</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-[#5FCF97]">
                    {formatCurrency(summary.realised)}
                  </p>
                </div>
                <div className="h-[26px] w-px bg-white/[.14]" />
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">Pending</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-[#EF9F27]">
                    {formatCurrency(summary.pending)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Tile label="Revenue" value={formatCurrency(summary.revenue)} />
              <Tile label="Cost" value={formatCurrency(summary.cost)} />
              <Tile label="GST payable" value={formatCurrency(summary.gstPayable)} />
            </div>

            {summary.unknownCostBills > 0 && (
              <p className="mt-3 rounded-[12px] bg-[#FAEEDA] px-3 py-2 text-[12px] font-semibold text-[#854F0B]">
                {summary.unknownCostBills} bill{summary.unknownCostBills === 1 ? '' : 's'} excluded — no purchase
                recorded for those products, so cost is unknown.
              </p>
            )}

            <div className="mt-3 rounded-[16px] bg-surface p-3 shadow-card">
              <p className="mb-[9px] text-[10px] font-bold uppercase tracking-[0.5px] text-muted">By product</p>
              {products.length === 0 && <p className="text-[13px] text-muted">No sales this month.</p>}
              {products.map((p, i) => (
                <div
                  key={p.productId}
                  className={`flex items-baseline justify-between py-[7px] ${
                    i < products.length - 1 ? 'border-b border-borderMuted' : ''
                  }`}
                >
                  <span className="text-[13px] font-bold text-ink">
                    {p.name} <span className="font-semibold text-subtle">· {p.qty}</span>
                  </span>
                  <span className="text-[13px] font-bold text-ink">{formatCurrency(p.profit)}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-[16px] bg-surface p-3 shadow-card">
              <div className="mb-[10px] flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">By customer</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-subtle">Profit / due</p>
              </div>

              {customers.length === 0 && <p className="text-[13px] text-muted">No sales this month.</p>}

              {customers.map((c, i) => {
                const due = dues.get(c.customerId) ?? 0
                return (
                  <Link
                    key={c.customerId}
                    to={`/commercial/customers/${c.customerId}`}
                    className={`flex items-center justify-between py-[9px] ${
                      i < customers.length - 1 ? 'border-b border-borderMuted' : ''
                    }`}
                  >
                    <div>
                      <p className="text-[13px] font-bold text-ink">{c.name}</p>
                      <p className="mt-[1px] text-[11px] font-semibold text-subtle">{c.qty} cylinders</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-ink">{formatCurrency(c.profit)}</p>
                      <p className={`mt-[1px] text-[11px] font-semibold ${due > 0 ? 'text-[#A32D2D]' : 'text-[#1D9E75]'}`}>
                        {due > 0 ? `${formatCurrency(due)} due` : 'settled'}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-surface px-3 py-[11px] shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.4px] text-muted">{label}</p>
      <p className="mt-[2px] font-display text-[15px] font-bold text-ink">{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Wire the route**

In `src/App.tsx`, add beside the other commercial routes:

```tsx
<Route path="/commercial/reports" element={<Reports />} />
```

and the matching import at the top:

```tsx
import { Reports } from './pages/Reports'
```

`App.tsx` uses named imports throughout — `import { Reports } from './pages/Reports'` matches.

- [ ] **Step 3: Add the account-menu entry**

In `src/components/AccountMenu.tsx`, directly above the Business details row, add:

```tsx
{profile?.role === 'owner' && (
  <Link to="/commercial/reports" onClick={onClose} className={rowCls}>
    Reports <span className="text-[#C0B4A2]">›</span>
  </Link>
)}
```

The existing Business details row carries `border-b-0`; move that class off it and onto whichever row now renders last, so the divider stack stays correct.

- [ ] **Step 4: Verify the build**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Verify in the browser**

Start the dev server, sign in as the owner, open the account menu, tap Reports.

Check: the month stepper moves back and forward, the next-month button is disabled on the current month, profit and margin render, the realised and pending pair sums to the profit figure, and customers are ranked by profit with dues beside them.

Then sign in as staff and navigate directly to `/commercial/reports`. Expected: "Only the owner can view reports." — no numbers, no blank zeroes.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Reports.tsx src/App.tsx src/components/AccountMenu.tsx
git commit -m "feat(reports): owner-only commercial reports screen"
```

---

### Task 9: Customer detail — per-bill profit

**Files:**
- Modify: `src/pages/CustomerDetail.tsx` (header block near line 128, history rows near line 423, detail modal near line 484)

**Interfaces:**
- Consumes: `useCustomerProfit` from Task 7, `summariseProfit` from Task 6, `supabase.rpc('commercial_bill_line_profit')` from Task 3.
- Produces: no new exports.

- [ ] **Step 1: Load the profit rows**

Near the existing `const isOwner = profile?.role === 'owner'` in `CustomerDetail.tsx`, add:

```tsx
const { bills: profitBills } = useCustomerProfit(Number(id))
const profitByBill = useMemo(
  () => new Map(profitBills.map((b) => [b.bill_id, b])),
  [profitBills],
)
const profitSummary = useMemo(() => summariseProfit(profitBills), [profitBills])
```

with the imports:

```tsx
import { useCustomerProfit } from '../hooks/useCommercialProfit'
import { summariseProfit } from '../utils/profit'
import type { BillLineProfit } from '../types/db'
```

`useCustomerProfit` lives in `useCommercialProfit.ts` beside its sibling — it does not have a file of its own.

- [ ] **Step 2: Add the header triple**

Inside the customer header card, guarded by `isOwner`:

```tsx
{isOwner && profitBills.length > 0 && (
  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-borderMuted pt-3">
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.4px] text-muted">Profit</p>
      <p className="mt-[2px] font-display text-[15px] font-bold text-ink">{formatCurrency(profitSummary.profit)}</p>
    </div>
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.4px] text-muted">Realised</p>
      <p className="mt-[2px] font-display text-[15px] font-bold text-[#1D9E75]">{formatCurrency(profitSummary.realised)}</p>
    </div>
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.4px] text-muted">Margin</p>
      <p className="mt-[2px] font-display text-[15px] font-bold text-ink">{profitSummary.marginPct.toFixed(1)}%</p>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add the per-bill figure to sale rows**

Inside the history row renderer, where each entry's amount is displayed, append below it:

```tsx
{isOwner && t.type === 'sale' && profitByBill.has(t.id) && (
  <p className={`mt-[2px] text-[11px] font-semibold ${
    profitByBill.get(t.id)!.realisedFraction >= 1 ? 'text-[#1D9E75]' : 'text-[#EF9F27]'
  }`}>
    {profitByBill.get(t.id)!.cost_known
      ? `+${formatCurrency(profitByBill.get(t.id)!.profit)} ${
          profitByBill.get(t.id)!.realisedFraction >= 1 ? 'realised' : 'pending'
        }`
      : 'cost unknown'}
  </p>
)}
```

Confirm the history entry's identifier really is `t.id` and that it equals `bills.id`; the `HistoryEntry` mapping near line 42 builds entries from bills, so it should. If it does not, key the map on whatever field carries the bill id.

- [ ] **Step 4: Add the margin block to the detail sheet**

When a sale bill is opened in the detail modal, fetch its lines and render the breakdown. Add near the modal state:

```tsx
const [billLines, setBillLines] = useState<BillLineProfit[]>([])

useEffect(() => {
  if (!isOwner || !viewingTx || viewingTx.type !== 'sale') {
    setBillLines([])
    return
  }
  supabase
    .rpc('commercial_bill_line_profit', { p_bill_id: viewingTx.id })
    .then(({ data }) => setBillLines((data ?? []) as BillLineProfit[]))
}, [isOwner, viewingTx])
```

and render inside the modal body:

```tsx
{billLines.length > 0 && (
  <div className="mt-3 border-t border-borderMuted pt-3">
    <p className="mb-[9px] text-[10px] font-bold uppercase tracking-[0.4px] text-muted">Margin</p>
    {billLines.map((l) => (
      <div key={l.bill_line_id} className="mb-[6px] flex justify-between text-[12px]">
        <span className="text-muted">
          {l.product_name} · cost {l.cost_source ?? 'unknown'}
        </span>
        <span className="font-bold text-ink">
          {l.cost_known ? formatCurrency(l.profit ?? 0) : '—'}
        </span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 5: Verify the build**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Verify in the browser**

As owner, open a commercial customer with both credit and counter-paid sales.

Check: each sale row shows a profit figure; a bill covered by payments reads "realised" in green, an uncovered one reads "pending" in amber; the header profit equals the sum of the row figures; tapping a sale opens the sheet with the per-line margin and the source PO number.

As staff, open the same customer. Expected: no profit figures anywhere, and no console errors — the RPC refusal is swallowed by the hook's `forbidden` branch.

- [ ] **Step 7: Commit**

```bash
git add src/pages/CustomerDetail.tsx
git commit -m "feat(reports): per-bill profit on the customer screen"
```

---

### Task 10: Home strip

**Files:**
- Modify: `src/pages/Home.tsx` (below the hero card, near line 191)

**Interfaces:**
- Consumes: `useCommercialProfit` from Task 7, `summariseProfit` from Task 6.
- Produces: nothing.

- [ ] **Step 1: Add the strip**

In `Home.tsx`, alongside the existing `currentMonthInIST()` usage, add:

```tsx
const { bills: profitBills, forbidden: profitForbidden } = useCommercialProfit(monthYear, monthNumber)
const profitSummary = useMemo(() => summariseProfit(profitBills), [profitBills])
```

using whatever variables that file already holds for the displayed month — the strip must follow the hero card's month stepper, not the calendar month, or the two cards will disagree.

Render directly below the hero card:

```tsx
{isOwner && !profitForbidden && (
  <Link to="/commercial/reports" className="mt-3 flex items-center justify-between rounded-[16px] bg-surface px-[13px] py-3 shadow-card">
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.4px] text-muted">Profit this month</p>
      <p className="mt-[2px] font-display text-[21px] font-bold text-ink">{formatCurrency(profitSummary.profit)}</p>
      <p className="mt-[2px] text-[11px] font-semibold text-subtle">
        {formatCurrency(profitSummary.realised)} realised · {profitSummary.marginPct.toFixed(1)}%
      </p>
    </div>
    <span className="text-[12px] font-bold text-accent">Reports ›</span>
  </Link>
)}
```

- [ ] **Step 2: Verify the build**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Verify in the browser**

As owner: the strip shows, its figure matches the Reports screen for the same month, and stepping the hero card's month moves the strip with it. Tapping it opens Reports.

As staff: no strip, no console errors.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(reports): profit strip on the commercial home screen"
```

---

## Verification checklist

Run before opening the PR.

- [ ] `npm test` — all passing
- [ ] `npx tsc -b` — exit 0
- [ ] `npm run build` — succeeds
- [ ] A staff account receives `42501` from all three RPC functions, and a direct `select` on `bill_profit` is refused
- [ ] A 2900/2750 commercial cylinder reports 127.12 profit, not 150
- [ ] Reports, customer detail and Home agree on the same month's profit figure
- [ ] Unknown-cost bills are counted on screen rather than silently dropped
- [ ] Returns, `opening` bills and domestic products contribute nothing
- [ ] A New Connection sale (`surrender = true`) does contribute
