-- ============================================================
-- Cylinder Tracker 3.0 — Commercial + Domestic segments
--
-- One shared DB. Domestic rides on the existing tables:
--   - domestic sale  = transactions row with customer_id NULL
--   - domestic stock = same purchases/transactions arithmetic
--   - multi-item bill = rows sharing one bill_id
--
-- Production-safe: additive columns + one DROP NOT NULL.
-- Run once in the Supabase SQL editor.
-- ============================================================

-- ── 1. Who can access which segment ──────────────────────────
alter table public.profiles
  add column if not exists segment_access text not null default 'both'
  check (segment_access in ('commercial', 'domestic', 'both'));

-- ── 2. Products become a real two-segment catalogue ──────────
alter table public.products
  add column if not exists segment text not null default 'commercial'
  check (segment in ('commercial', 'domestic'));

alter table public.products
  add column if not exists unit text not null default 'pc';

-- kind drives UI behaviour:
--   cylinder  → stock + empties logic
--   accessory → stock only (stoves, regulators, pipes…)
--   service   → no stock (new connections, RC…)
alter table public.products
  add column if not exists kind text not null default 'cylinder'
  check (kind in ('cylinder', 'accessory', 'service'));

alter table public.products
  add column if not exists active boolean not null default true;

alter table public.products
  add column if not exists sort_order int not null default 0;

-- ── 3. Sales ledger works for both segments ──────────────────
-- Domestic sales have no customer.
alter table public.transactions
  alter column customer_id drop not null;

-- Lines sharing one bill_id form a single multi-item bill.
alter table public.transactions
  add column if not exists bill_id uuid;

alter table public.purchases
  add column if not exists bill_id uuid;

create index if not exists idx_transactions_bill on public.transactions (bill_id);
create index if not exists idx_purchases_bill on public.purchases (bill_id);

-- ── 3b. Combos (bundle items) ────────────────────────────────
-- A bundle (e.g. "New Connection") has no stock of its own; selling
-- it consumes its components' stock (e.g. 1 × 14.2 kg cylinder).
create table if not exists public.bundle_components (
  id                    bigserial primary key,
  bundle_product_id     bigint not null references public.products(id) on delete cascade,
  component_product_id  bigint not null references public.products(id) on delete restrict,
  qty                   numeric not null default 1 check (qty > 0),
  unique (bundle_product_id, component_product_id)
);

alter table public.bundle_components enable row level security;
drop policy if exists "bundle_components_read" on public.bundle_components;
create policy "bundle_components_read" on public.bundle_components
  for select to authenticated using (true);
drop policy if exists "bundle_components_write" on public.bundle_components;
create policy "bundle_components_write" on public.bundle_components
  for all to authenticated using (true) with check (true);

-- ── 4. Views become segment-aware ────────────────────────────
-- CREATE OR REPLACE can't add columns mid-view, so drop and
-- recreate (monthly first — it depends on daily).
drop view if exists public.monthly_product_summary;
drop view if exists public.daily_product_summary;
drop view if exists public.daily_purchase_summary;
drop view if exists public.godown_stock;

-- Live godown stock, now exposing segment/kind/unit so each mode
-- reads only its own rows.
create view public.godown_stock as
select
  p.id as product_id,
  p.name as product_name,
  p.segment,
  p.kind,
  p.unit,
  p.godown_capacity,
  coalesce(sum(pu.qty), 0)
    - coalesce((select sum(t.qty) from transactions t where t.product_id = p.id and t.type = 'sale'), 0)
    -- combos: selling a bundle consumes its components' stock
    - coalesce((select sum(t.qty * bc.qty)
                from transactions t
                join bundle_components bc on bc.bundle_product_id = t.product_id
                where bc.component_product_id = p.id and t.type = 'sale'), 0)
    as full_cylinders,
  (coalesce((select sum(t.empties) from transactions t where t.product_id = p.id and t.type = 'sale'), 0)
    + coalesce((select sum(t.qty) from transactions t where t.product_id = p.id and t.type = 'return'), 0))
    - coalesce(sum(pu.empties_given), 0)
    as empty_cylinders
from products p
left join purchases pu on pu.product_id = p.id
where p.active
group by p.id, p.name, p.segment, p.kind, p.unit, p.godown_capacity;

-- Daily sales rollup per product, segment exposed.
create view public.daily_product_summary as
select
  date_trunc('day', t.created_at) as day,
  t.product_id,
  p.name as product_name,
  p.segment,
  coalesce(sum(t.qty) filter (where t.type = 'sale'), 0) as cylinders_sold,
  coalesce(sum(t.amount) filter (where t.type = 'sale'), 0) as revenue,
  coalesce(sum(t.amount) filter (where t.type = 'sale' and t.paid), 0) as collected_at_sale,
  coalesce(sum(t.empties) filter (where t.type = 'sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type = 'return'), 0) as empties_collected
from transactions t
join products p on p.id = t.product_id
where t.type in ('sale', 'return')
group by 1, 2, 3, 4;

create view public.monthly_product_summary as
select
  date_trunc('month', day) as month,
  product_id,
  product_name,
  segment,
  sum(cylinders_sold) as cylinders_sold,
  sum(revenue) as revenue,
  sum(collected_at_sale) as collected_at_sale,
  sum(empties_collected) as empties_collected
from daily_product_summary
group by 1, 2, 3, 4;

-- Purchases rollup per product, segment exposed.
create view public.daily_purchase_summary as
select
  date_trunc('day', pu.created_at) as day,
  pu.product_id,
  p.segment,
  coalesce(sum(pu.qty), 0) as cylinders_purchased,
  coalesce(sum(pu.empties_given), 0) as empties_given_to_supplier,
  coalesce(sum(pu.amount), 0) as purchase_amount
from purchases pu
join products p on p.id = pu.product_id
group by 1, 2, 3;

-- Customers are commercial-only: keep domestic products out of the
-- per-customer product cards.
create or replace view public.customer_product_balances as
select
  c.id as customer_id,
  p.id as product_id,
  p.name as product_name,
  coalesce(sum(t.qty) filter (where t.type = 'sale'), 0)
    + case when c.starting_empties_product_id = p.id then c.starting_empties_owed else 0 end as sold,
  coalesce(sum(t.empties) filter (where t.type = 'sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type = 'return'), 0) as returned,
  coalesce(sum(t.qty) filter (where t.type = 'sale'), 0)
    + case when c.starting_empties_product_id = p.id then c.starting_empties_owed else 0 end
    - (coalesce(sum(t.empties) filter (where t.type = 'sale'), 0)
       + coalesce(sum(t.qty) filter (where t.type = 'return'), 0)) as empties_outstanding
from customers c
cross join products p
left join transactions t on t.customer_id = c.id and t.product_id = p.id
where p.segment = 'commercial' and p.active
group by c.id, p.id, p.name, c.starting_empties_product_id, c.starting_empties_owed;

-- ── 5. Seed the domestic catalogue ───────────────────────────
insert into public.products (name, price, segment, kind, unit, sort_order)
select * from (values
  ('14.2 kg',                 925::numeric, 'domestic', 'cylinder',  'pc', 1),
  ('5 kg',                    345::numeric, 'domestic', 'cylinder',  'pc', 2),
  ('Big Gas Stove',          2200::numeric, 'domestic', 'accessory', 'pc', 3),
  ('Glass Stove',             750::numeric, 'domestic', 'accessory', 'pc', 4),
  ('Suraksha Gas Pipe',       380::numeric, 'domestic', 'accessory', 'pc', 5),
  ('Regulator',               500::numeric, 'domestic', 'accessory', 'pc', 6),
  ('Lighter',                  80::numeric, 'domestic', 'accessory', 'pc', 7),
  ('New Connection (Regular)', 1200::numeric, 'domestic', 'service', 'pc', 8),
  ('New Connection (Deepam)',    0::numeric, 'domestic', 'service', 'pc', 9),
  ('RC (Refill)',             925::numeric, 'domestic', 'accessory', 'pc', 10),
  ('Pass Book',                 0::numeric, 'domestic', 'accessory', 'pc', 11)
) as v(name, price, segment, kind, unit, sort_order)
where not exists (select 1 from public.products where segment = 'domestic');

-- Fix kinds if an earlier run seeded these as services: RC and Pass
-- Book are ordinary stocked items, not combos.
update public.products
set kind = 'accessory'
where segment = 'domestic' and name in ('RC (Refill)', 'Pass Book') and kind = 'service';

-- Combos: each New Connection includes a cylinder + regulator +
-- lighter + pass book. Adjust anytime from Domestic → Stock → Combos.
insert into public.bundle_components (bundle_product_id, component_product_id, qty)
select nc.id, comp.id, 1
from public.products nc
join public.products comp
  on comp.segment = 'domestic' and comp.name in ('14.2 kg', 'Regulator', 'Lighter', 'Pass Book')
where nc.segment = 'domestic'
  and nc.name like 'New Connection%'
  and not exists (
    select 1 from public.bundle_components b where b.bundle_product_id = nc.id
  );

-- Existing commercial rows: mark cylinders explicitly (they already
-- default to kind='cylinder', segment='commercial' — nothing to do).
