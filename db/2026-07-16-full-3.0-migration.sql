-- ============================================================
-- Cylinder Tracker — FULL 3.0 MIGRATION  (base → 3.0-domestic)
--
-- Brings the ORIGINAL commercial-only database up to everything the
-- 3.0-domestic app needs, in ONE file:
--   • segments + product catalogue (kind/unit/active/sort_order)
--   • domestic sales (nullable customer_id), multi-item bills (bill_id)
--   • combos (bundle_components) + domestic seed
--   • GST + structured address on agency_settings
--   • outright cylinder sales
--   • uniform audit columns (created_at/by, updated_at/by) + one trigger
--   • segment-aware / purchases-aware views
--   • drops the two dead monthly reporting views
--
-- ADDITIVE & IDEMPOTENT. No table dropped, no row deleted. Verified
-- against the 2026-07-16 production backup (schema was the base commercial
-- schema; none of the 3.0 migrations had been applied).
--
-- ▶ Run in the Supabase SQL editor. Fully idempotent (all guarded with
--   if [not] exists / drop-if-exists) — safe to re-run.
-- ▶ Take the backup first (you already did: backup-2026-07-16.sql).
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. NEW COLUMNS
-- ============================================================

-- profiles: segment access + audit
alter table public.profiles add column if not exists segment_access text not null default 'both'
  check (segment_access in ('commercial', 'domestic', 'both'));
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists created_by uuid;
alter table public.profiles add column if not exists updated_at timestamptz;  -- null = never edited
alter table public.profiles add column if not exists updated_by uuid;

-- products: catalogue fields + audit
alter table public.products add column if not exists segment text not null default 'commercial'
  check (segment in ('commercial', 'domestic'));
alter table public.products add column if not exists kind text not null default 'cylinder'
  check (kind in ('cylinder', 'accessory', 'service'));
alter table public.products add column if not exists unit text not null default 'pc';
alter table public.products add column if not exists active boolean not null default true;
alter table public.products add column if not exists sort_order int not null default 0;
alter table public.products add column if not exists created_by uuid;
alter table public.products add column if not exists updated_at timestamptz;  -- null = never edited
alter table public.products add column if not exists updated_by uuid;

-- customers: audit
alter table public.customers add column if not exists created_by uuid;
alter table public.customers add column if not exists updated_at timestamptz;  -- null = never edited
alter table public.customers add column if not exists updated_by uuid;

-- transactions: bills, outright, audit; domestic sales need nullable customer
alter table public.transactions add column if not exists bill_id uuid;
alter table public.transactions add column if not exists outright boolean not null default false;
alter table public.transactions add column if not exists updated_at timestamptz;  -- null = never edited
alter table public.transactions add column if not exists updated_by uuid;
alter table public.transactions alter column customer_id drop not null;

-- purchases: bills + audit
alter table public.purchases add column if not exists bill_id uuid;
alter table public.purchases add column if not exists updated_at timestamptz;  -- null = never edited
alter table public.purchases add column if not exists updated_by uuid;

-- agency_settings: GST + structured address + audit
alter table public.agency_settings add column if not exists address_line1 text;
alter table public.agency_settings add column if not exists address_line2 text;
alter table public.agency_settings add column if not exists city text;
alter table public.agency_settings add column if not exists pincode text;
alter table public.agency_settings add column if not exists gst_number text;
alter table public.agency_settings add column if not exists created_at timestamptz not null default now();
alter table public.agency_settings add column if not exists created_by uuid;
alter table public.agency_settings add column if not exists updated_by uuid;

-- Backfill the new address line from the legacy single-line address.
update public.agency_settings
set address_line1 = business_address
where address_line1 is null and business_address is not null;

-- Note: existing rows keep updated_at = NULL ("never edited"); the audit
-- trigger fills it on any future insert/edit. No backfill, so this file is
-- fully re-runnable. No bill_id indexes (small dataset; add later if needed).

-- ============================================================
-- 2. COMBOS TABLE (bundle_components)
-- A bundle (e.g. New Connection) has no stock of its own; selling it
-- consumes its components' stock.
-- ============================================================
create table if not exists public.bundle_components (
  id                    bigserial   primary key,
  bundle_product_id     bigint      not null references public.products(id) on delete cascade,
  component_product_id  bigint      not null references public.products(id) on delete restrict,
  qty                   numeric     not null default 1 check (qty > 0),
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  unique (bundle_product_id, component_product_id)
);

alter table public.bundle_components enable row level security;
drop policy if exists "bundle_components_read"  on public.bundle_components;
create policy "bundle_components_read"  on public.bundle_components for select to authenticated using (true);
drop policy if exists "bundle_components_write" on public.bundle_components;
create policy "bundle_components_write" on public.bundle_components for all to authenticated using (true) with check (true);

-- Staff manage the product catalogue (create/edit/delete). The base DB
-- only had read + owner-update on products; add the write policies the
-- 3.0 catalogue/combos screens need.
drop policy if exists "products_insert_auth" on public.products;
create policy "products_insert_auth" on public.products for insert to authenticated with check (true);
drop policy if exists "products_update_auth" on public.products;
create policy "products_update_auth" on public.products for update to authenticated using (true) with check (true);
drop policy if exists "products_delete_auth" on public.products;
create policy "products_delete_auth" on public.products for delete to authenticated using (true);

-- Detail popups show "Created by / Last updated by <name>". Resolving a
-- record's created_by/updated_by (a user id) to a name means reading the
-- profiles table. The base "read own profile" policy only exposes a user's
-- OWN row, so staff-created records showed no name. Allow any logged-in user
-- to read profile rows — all app users are your own owners/staff, so their
-- names are not sensitive. (RLS is row-level: the `role` column is also
-- readable, which is fine for this small, trusted team.)
drop policy if exists "read all profile names" on public.profiles;
create policy "read all profile names" on public.profiles for select to authenticated using (true);

-- ============================================================
-- 3. AUDIT TRIGGER — one function, all 7 tables
-- INSERT: fill created_by/updated_by from auth.uid() if not supplied.
-- UPDATE: stamp updated_at/updated_by; never touch created_at (it doubles
--         as the editable business date of a sale/return).
-- ============================================================
create or replace function public.stamp_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    new.updated_at := now();
    if new.updated_by is null then new.updated_by := auth.uid(); end if;
  else  -- UPDATE
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

-- retire any earlier updated_at trigger if it exists (none in this DB; defensive)
drop trigger if exists trg_touch_transactions on public.transactions;
drop trigger if exists trg_touch_purchases    on public.purchases;

drop trigger if exists trg_stamp_profiles          on public.profiles;
drop trigger if exists trg_stamp_products          on public.products;
drop trigger if exists trg_stamp_customers         on public.customers;
drop trigger if exists trg_stamp_transactions      on public.transactions;
drop trigger if exists trg_stamp_purchases         on public.purchases;
drop trigger if exists trg_stamp_bundle_components on public.bundle_components;
drop trigger if exists trg_stamp_agency_settings   on public.agency_settings;

create trigger trg_stamp_profiles          before insert or update on public.profiles          for each row execute function public.stamp_audit();
create trigger trg_stamp_products          before insert or update on public.products          for each row execute function public.stamp_audit();
create trigger trg_stamp_customers         before insert or update on public.customers         for each row execute function public.stamp_audit();
create trigger trg_stamp_transactions      before insert or update on public.transactions      for each row execute function public.stamp_audit();
create trigger trg_stamp_purchases         before insert or update on public.purchases         for each row execute function public.stamp_audit();
create trigger trg_stamp_bundle_components before insert or update on public.bundle_components for each row execute function public.stamp_audit();
create trigger trg_stamp_agency_settings   before insert or update on public.agency_settings   for each row execute function public.stamp_audit();

-- ============================================================
-- 4. VIEWS
-- Drop in dependency order (monthly depend on daily), then recreate the
-- segment/purchases-aware versions. daily_money_summary and
-- customer_balances are unchanged from the base and left as-is.
-- monthly_* are dead (unused by the 3.0 app) and NOT recreated.
-- ============================================================
drop view if exists public.monthly_money_summary;    -- dead
drop view if exists public.monthly_product_summary;   -- dead
drop view if exists public.daily_product_summary;
drop view if exists public.daily_purchase_summary;
drop view if exists public.customer_product_balances;
drop view if exists public.activity_feed;
drop view if exists public.godown_stock;

-- Live godown stock (segment/kind/unit + combo consumption).
create view public.godown_stock as
select
  p.id as product_id, p.name as product_name, p.segment, p.kind, p.unit, p.godown_capacity,
  coalesce(sum(pu.qty), 0)
    - coalesce((select sum(t.qty) from transactions t where t.product_id = p.id and t.type = 'sale'), 0)
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

-- Daily sales rollup per product (segment exposed).
create view public.daily_product_summary as
select
  date_trunc('day', t.created_at) as day, t.product_id, p.name as product_name, p.segment,
  coalesce(sum(t.qty)    filter (where t.type = 'sale'), 0) as cylinders_sold,
  coalesce(sum(t.amount) filter (where t.type = 'sale'), 0) as revenue,
  coalesce(sum(t.amount) filter (where t.type = 'sale' and t.paid), 0) as collected_at_sale,
  coalesce(sum(t.empties) filter (where t.type = 'sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type = 'return'), 0) as empties_collected
from transactions t
join products p on p.id = t.product_id
where t.type in ('sale', 'return')
group by 1, 2, 3, 4;

-- Daily purchases rollup per product (segment exposed).
create view public.daily_purchase_summary as
select
  date_trunc('day', pu.created_at) as day, pu.product_id, p.segment,
  coalesce(sum(pu.qty), 0) as cylinders_purchased,
  coalesce(sum(pu.empties_given), 0) as empties_given_to_supplier,
  coalesce(sum(pu.amount), 0) as purchase_amount
from purchases pu
join products p on p.id = pu.product_id
group by 1, 2, 3;

-- Per-customer empties owed (outright sales/returns excluded; commercial only).
create view public.customer_product_balances as
select
  c.id as customer_id, p.id as product_id, p.name as product_name,
  coalesce(sum(t.qty) filter (where t.type = 'sale' and not t.outright), 0)
    + case when c.starting_empties_product_id = p.id then c.starting_empties_owed else 0 end as sold,
  coalesce(sum(t.empties) filter (where t.type = 'sale' and not t.outright), 0)
    + coalesce(sum(t.qty) filter (where t.type = 'return' and not t.outright), 0) as returned,
  coalesce(sum(t.qty) filter (where t.type = 'sale' and not t.outright), 0)
    + case when c.starting_empties_product_id = p.id then c.starting_empties_owed else 0 end
    - (coalesce(sum(t.empties) filter (where t.type = 'sale' and not t.outright), 0)
       + coalesce(sum(t.qty) filter (where t.type = 'return' and not t.outright), 0)) as empties_outstanding
from customers c
cross join products p
left join transactions t on t.customer_id = c.id and t.product_id = p.id
where p.segment = 'commercial' and p.active
group by c.id, p.id, p.name, c.starting_empties_product_id, c.starting_empties_owed;

-- Unified feed: customer transactions + supplier purchases, newest first.
create view public.activity_feed as
select
  t.id, t.customer_id, c.name as customer_name, t.type, t.qty, t.empties,
  t.amount, t.note, t.created_by, t.created_at, t.updated_at, t.updated_by,
  t.product_id, p.name as product_name, 'commercial' as segment
from transactions t
join customers c on c.id = t.customer_id
left join products p on p.id = t.product_id
union all
select
  pu.id, null as customer_id, pr.name as customer_name, 'purchase' as type,
  pu.qty, pu.empties_given as empties, pu.amount, pu.note, pu.created_by,
  pu.created_at, pu.updated_at, pu.updated_by, pu.product_id, pr.name as product_name, pr.segment
from purchases pu
join products pr on pr.id = pu.product_id
order by created_at desc;

-- ============================================================
-- 5. SEED — domestic catalogue + combos (idempotent)
-- ============================================================
insert into public.products (name, price, segment, kind, unit, sort_order)
select * from (values
  ('14.2 kg',                  925::numeric, 'domestic', 'cylinder',  'pc', 1),
  ('5 kg',                     345::numeric, 'domestic', 'cylinder',  'pc', 2),
  ('Big Gas Stove',           2200::numeric, 'domestic', 'accessory', 'pc', 3),
  ('Glass Stove',              750::numeric, 'domestic', 'accessory', 'pc', 4),
  ('Suraksha Gas Pipe',        380::numeric, 'domestic', 'accessory', 'pc', 5),
  ('Regulator',                500::numeric, 'domestic', 'accessory', 'pc', 6),
  ('Lighter',                   80::numeric, 'domestic', 'accessory', 'pc', 7),
  ('New Connection (Regular)',1200::numeric, 'domestic', 'service',   'pc', 8),
  ('New Connection (Deepam)',    0::numeric, 'domestic', 'service',   'pc', 9),
  ('RC (Refill)',              925::numeric, 'domestic', 'accessory', 'pc', 10),
  ('Pass Book',                  0::numeric, 'domestic', 'accessory', 'pc', 11)
) as v(name, price, segment, kind, unit, sort_order)
where not exists (select 1 from public.products where segment = 'domestic');

insert into public.bundle_components (bundle_product_id, component_product_id, qty)
select nc.id, comp.id, 1
from public.products nc
join public.products comp
  on comp.segment = 'domestic' and comp.name in ('14.2 kg', 'Regulator', 'Lighter', 'Pass Book')
where nc.segment = 'domestic'
  and nc.name like 'New Connection%'
  and not exists (select 1 from public.bundle_components b where b.bundle_product_id = nc.id);
