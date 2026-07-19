-- ============================================================
-- Cylinder Tracker — CANONICAL SCHEMA (single source of truth)
--
-- The complete final schema for the 3.0-domestic branch, consolidating
-- every table/column/view added across:
--   • v3-segments-migration.sql   (commercial + domestic segments)
--   • 2026-07-ui-redesign.sql      (GST/address, activity_feed, outright)
--   • 2026-07-clean-audit.sql      (uniform audit columns + one trigger)
--
-- ⚠️  REFERENCE / FRESH-BUILD ONLY. Safe to run on an EMPTY database.
--     DO NOT run this against your live production DB — it recreates the
--     views, and your production DB is already correct via the migration
--     files above. Keep using the migrations for the live DB.
--
-- Two spots are reconstructed from app logic (their original DDL was never
-- in this repo) and are marked «VERIFY». For a 100% faithful fresh deploy,
-- confirm them (and all RLS policies) against a Supabase schema export
-- (Dashboard → Database, or `pg_dump --schema-only`).
-- ============================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ============================================================
-- TABLES
-- ============================================================

-- ── profiles: app users (id = Supabase auth user) ────────────
create table if not exists public.profiles (
  id              uuid        primary key references auth.users(id) on delete cascade,
  name            text        not null,
  role            text        not null default 'staff' check (role in ('owner', 'staff')),
  segment_access  text        not null default 'both'  check (segment_access in ('commercial', 'domestic', 'both')),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

-- ── products: two-segment catalogue ──────────────────────────
-- kind: cylinder → stock + empties | accessory → stock only | service → no stock
create table if not exists public.products (
  id               bigserial   primary key,
  name             text        not null,
  price            numeric     not null default 0,
  godown_capacity  numeric,
  segment          text        not null default 'commercial' check (segment in ('commercial', 'domestic')),
  kind             text        not null default 'cylinder'   check (kind in ('cylinder', 'accessory', 'service')),
  unit             text        not null default 'pc',
  active             boolean     not null default true,
  is_new_connection  boolean     not null default false,
  price_options      jsonb       not null default '[]'::jsonb,
  sort_order         int         not null default 0,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);

-- ── customers: commercial customers only ─────────────────────
create table if not exists public.customers (
  id                           bigserial   primary key,
  name                         text        not null,
  phone                        text,
  address                      text,
  starting_empties_owed        numeric     not null default 0,
  starting_empties_product_id  bigint      references public.products(id),
  created_at                   timestamptz not null default now(),
  created_by                   uuid,
  updated_at                   timestamptz not null default now(),
  updated_by                   uuid
);

-- ── transactions: the core ledger (sale / return / payment) ──
-- customer_id NULL = domestic sale. Rows sharing bill_id = one multi-item bill.
-- created_at doubles as the editable business date (backdating).
create table if not exists public.transactions (
  id            bigserial   primary key,
  customer_id   bigint      references public.customers(id) on delete cascade,
  type          text        not null check (type in ('sale', 'return', 'payment')),
  product_id    bigint      references public.products(id),
  qty           numeric     not null default 0,
  empties       numeric     not null default 0,
  amount        numeric     not null default 0,
  paid          boolean     not null default false,
  method        text        check (method in ('cash', 'upi', 'vitran')),
  note          text,
  bill_id       uuid,
  outright      boolean     not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index if not exists idx_transactions_bill on public.transactions (bill_id);

-- ── purchases: supplier "stock in" ───────────────────────────
create table if not exists public.purchases (
  id             bigserial   primary key,
  product_id     bigint      not null references public.products(id),
  qty            numeric     not null default 0,
  empties_given  numeric     not null default 0,
  amount         numeric     not null default 0,
  paid           boolean     not null default false,
  method         text        check (method in ('cash', 'upi')),
  note           text,
  bill_id        uuid,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);
create index if not exists idx_purchases_bill on public.purchases (bill_id);

-- ── bundle_components: combo definitions ─────────────────────
-- Selling a bundle consumes its components' stock.
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

-- ── agency_settings: single-row business config ──────────────
-- id is a boolean PK fixed to true — a deliberate "only one row" guard.
create table if not exists public.agency_settings (
  id                 boolean     primary key default true check (id),
  business_name      text        not null default '',
  business_phone     text,
  business_address   text,        -- legacy single-line (kept, unused going forward)
  address_line1      text,
  address_line2      text,
  city               text,
  pincode            text,
  gst_number         text,
  price_per_cylinder numeric     not null default 0,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

-- ============================================================
-- AUDIT TRIGGER — one function, all tables
-- INSERT: fill created_by/updated_by from auth.uid() if not supplied.
-- UPDATE: stamp updated_at/updated_by; never touch created_at.
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
-- ROW-LEVEL SECURITY
-- Known policies below. «VERIFY» the full set (profiles, customers,
-- transactions, purchases, agency_settings) against a live export —
-- the base tables' original policies were not in this repo.
-- ============================================================
alter table public.products          enable row level security;
alter table public.bundle_components enable row level security;

drop policy if exists "products_read"        on public.products;
create policy "products_read"        on public.products for select to authenticated using (true);
drop policy if exists "products_insert_auth" on public.products;
create policy "products_insert_auth" on public.products for insert to authenticated with check (true);
drop policy if exists "products_update_auth" on public.products;
create policy "products_update_auth" on public.products for update to authenticated using (true) with check (true);
drop policy if exists "products_delete_auth" on public.products;
create policy "products_delete_auth" on public.products for delete to authenticated using (true);

drop policy if exists "bundle_components_read"  on public.bundle_components;
create policy "bundle_components_read"  on public.bundle_components for select to authenticated using (true);
drop policy if exists "bundle_components_write" on public.bundle_components;
create policy "bundle_components_write" on public.bundle_components for all to authenticated using (true) with check (true);

-- ============================================================
-- VIEWS  (drop in reverse dependency order, then recreate)
-- ============================================================
drop view if exists public.monthly_product_summary;  -- retired (dead)
drop view if exists public.daily_product_summary;
drop view if exists public.daily_purchase_summary;
drop view if exists public.daily_money_summary;
drop view if exists public.customer_product_balances;
drop view if exists public.customer_balances;
drop view if exists public.activity_feed;
drop view if exists public.godown_stock;

-- Live godown stock (segment/kind/unit exposed so each mode reads its own).
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

-- Per-customer empties owed (outright sales/returns excluded).
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

-- «VERIFY» Per-customer money owed. Reconstructed from app running-balance
-- logic: unpaid sales add, payments subtract.
create view public.customer_balances as
select
  c.id, c.name, c.phone, c.address, c.starting_empties_owed,
  coalesce(sum(t.amount) filter (where t.type = 'sale' and not t.paid), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'payment'), 0) as amount_due
from customers c
left join transactions t on t.customer_id = c.id
group by c.id, c.name, c.phone, c.address, c.starting_empties_owed;

-- Unified feed: customer transactions + supplier purchases, newest first.
create view public.activity_feed as
select
  t.id, t.customer_id, c.name as customer_name, t.type, t.qty, t.empties,
  t.amount, t.note, t.created_by, t.created_at, t.updated_at, t.updated_by,
  t.product_id, p.name as product_name, t.outright, 'commercial' as segment
from transactions t
join customers c on c.id = t.customer_id
left join products p on p.id = t.product_id
union all
select
  pu.id, null as customer_id, pr.name as customer_name, 'purchase' as type,
  pu.qty, pu.empties_given as empties, pu.amount, pu.note, pu.created_by,
  pu.created_at, pu.updated_at, pu.updated_by, pu.product_id, pr.name as product_name, false as outright, pr.segment
from purchases pu
join products pr on pr.id = pu.product_id
order by created_at desc;

-- Daily sales rollup per product.
create view public.daily_product_summary as
select
  (t.created_at at time zone 'Asia/Kolkata')::date as day, t.product_id, p.name as product_name, p.segment,
  coalesce(sum(t.qty)    filter (where t.type = 'sale'), 0) as cylinders_sold,
  coalesce(sum(t.amount) filter (where t.type = 'sale'), 0) as revenue,
  coalesce(sum(t.amount) filter (where t.type = 'sale' and t.paid), 0) as collected_at_sale,
  coalesce(sum(t.empties) filter (where t.type = 'sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type = 'return'), 0) as empties_collected
from transactions t
join products p on p.id = t.product_id
where t.type in ('sale', 'return')
group by 1, 2, 3, 4;

-- Daily purchases rollup per product.
create view public.daily_purchase_summary as
select
  (pu.created_at at time zone 'Asia/Kolkata')::date as day, pu.product_id, p.segment,
  coalesce(sum(pu.qty), 0) as cylinders_purchased,
  coalesce(sum(pu.empties_given), 0) as empties_given_to_supplier,
  coalesce(sum(pu.amount), 0) as purchase_amount
from purchases pu
join products p on p.id = pu.product_id
group by 1, 2, 3;

-- «VERIFY» Daily money collected (separate payment events only).
create view public.daily_money_summary as
select
  (created_at at time zone 'Asia/Kolkata')::date as day,
  coalesce(sum(amount) filter (where type = 'payment'), 0) as payments_collected
from transactions
group by 1;

-- ============================================================
-- SEED — domestic catalogue + combos (idempotent)
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

insert into public.agency_settings (id) values (true)
on conflict (id) do nothing;
