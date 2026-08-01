-- ============================================================
-- Cylinder Tracker — CANONICAL SCHEMA v4.0
--
-- Normalized bill/purchase design:
--   bills + bill_lines       (replaces transactions)
--   purchase_orders + purchase_lines  (replaces purchases)
--
-- FRESH-BUILD ONLY. Run on an EMPTY Supabase database.
-- Data import handled separately after schema is in place.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
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

-- ── products ─────────────────────────────────────────────────
-- kind: cylinder → stock + empties | accessory → stock only | service → no stock
create table if not exists public.products (
  id                 bigserial   primary key,
  name               text        not null,
  price              numeric     not null default 0,
  segment            text        not null default 'commercial' check (segment in ('commercial', 'domestic')),
  kind               text        not null default 'cylinder'   check (kind in ('cylinder', 'accessory', 'service')),
  unit               text        not null default 'pc',
  active             boolean     not null default true,
  is_new_connection  boolean     not null default false,
  pending_delivery   boolean     not null default false,
  price_options      jsonb       not null default '[]'::jsonb,
  sort_order         int         not null default 0,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

-- ── customers (commercial only) ──────────────────────────────
create table if not exists public.customers (
  id          bigserial   primary key,
  name        text        not null,
  phone       text,
  address     text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ── bills: header for sale / return / payment / opening ──────
-- customer_id NULL = domestic walk-in sale.
-- type=payment: header only, no bill_lines.
-- type=opening: customer starting empties balance.
-- created_at doubles as the editable business date (backdating).
create table if not exists public.bills (
  id            bigserial   primary key,
  bill_number   text        not null unique,
  customer_id   bigint      references public.customers(id) on delete cascade,
  type          text        not null check (type in ('sale', 'return', 'payment', 'opening')),
  total_amount  numeric     not null default 0,
  paid          boolean     not null default false,
  method        text        check (method in ('cash', 'upi', 'vitran')),
  note          text,
  surrender     boolean     not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

-- ── bill_lines: line items per bill ──────────────────────────
-- delivered is per-line for partial delivery splitting.
create table if not exists public.bill_lines (
  id          bigserial   primary key,
  bill_id     bigint      not null references public.bills(id) on delete cascade,
  product_id  bigint      not null references public.products(id),
  qty         numeric     not null default 0,
  empties     numeric     not null default 0,
  amount      numeric     not null default 0,
  delivered   boolean     not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists idx_bill_lines_bill on public.bill_lines (bill_id);

-- ── purchase_orders: header for purchase / opening ───────────
-- type=opening: godown opening stock adjustment.
create table if not exists public.purchase_orders (
  id            bigserial   primary key,
  po_number     text        not null unique,
  type          text        not null default 'purchase' check (type in ('purchase', 'opening')),
  total_amount  numeric     not null default 0,
  paid          boolean     not null default false,
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

-- ── purchase_lines: line items per purchase order ────────────
create table if not exists public.purchase_lines (
  id                 bigserial   primary key,
  purchase_order_id  bigint      not null references public.purchase_orders(id) on delete cascade,
  product_id         bigint      not null references public.products(id),
  qty                numeric     not null default 0,
  empties_given      numeric     not null default 0,
  amount             numeric     not null default 0,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);
create index if not exists idx_purchase_lines_order on public.purchase_lines (purchase_order_id);

-- ── bundle_components: combo definitions ─────────────────────
create table if not exists public.bundle_components (
  id                    bigserial   primary key,
  bundle_product_id     bigint      not null references public.products(id) on delete cascade,
  component_product_id  bigint      not null references public.products(id) on delete restrict,
  qty                   numeric     not null default 1 check (qty >= 0),
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  unique (bundle_product_id, component_product_id)
);

-- ── agency_settings: single-row business config ──────────────
create table if not exists public.agency_settings (
  id                 boolean     primary key default true check (id),
  business_name      text        not null default '',
  business_phone     text,
  business_address   text,
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
-- AUDIT TRIGGER
-- ============================================================
create or replace function public.stamp_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    new.updated_at := now();
    if new.updated_by is null then new.updated_by := auth.uid(); end if;
  else
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_profiles          on public.profiles;
drop trigger if exists trg_stamp_products          on public.products;
drop trigger if exists trg_stamp_customers         on public.customers;
drop trigger if exists trg_stamp_bills             on public.bills;
drop trigger if exists trg_stamp_bill_lines        on public.bill_lines;
drop trigger if exists trg_stamp_purchase_orders   on public.purchase_orders;
drop trigger if exists trg_stamp_purchase_lines    on public.purchase_lines;
drop trigger if exists trg_stamp_bundle_components on public.bundle_components;
drop trigger if exists trg_stamp_agency_settings   on public.agency_settings;

create trigger trg_stamp_profiles          before insert or update on public.profiles          for each row execute function public.stamp_audit();
create trigger trg_stamp_products          before insert or update on public.products          for each row execute function public.stamp_audit();
create trigger trg_stamp_customers         before insert or update on public.customers         for each row execute function public.stamp_audit();
create trigger trg_stamp_bills             before insert or update on public.bills             for each row execute function public.stamp_audit();
create trigger trg_stamp_bill_lines        before insert or update on public.bill_lines        for each row execute function public.stamp_audit();
create trigger trg_stamp_purchase_orders   before insert or update on public.purchase_orders   for each row execute function public.stamp_audit();
create trigger trg_stamp_purchase_lines    before insert or update on public.purchase_lines    for each row execute function public.stamp_audit();
create trigger trg_stamp_bundle_components before insert or update on public.bundle_components for each row execute function public.stamp_audit();
create trigger trg_stamp_agency_settings   before insert or update on public.agency_settings   for each row execute function public.stamp_audit();

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.products          enable row level security;
alter table public.customers         enable row level security;
alter table public.bundle_components enable row level security;
alter table public.bills             enable row level security;
alter table public.bill_lines        enable row level security;
alter table public.purchase_orders   enable row level security;
alter table public.purchase_lines    enable row level security;
alter table public.agency_settings   enable row level security;

-- profiles
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid());

-- products
drop policy if exists "products_read"        on public.products;
create policy "products_read"        on public.products for select to authenticated using (true);
drop policy if exists "products_insert_auth" on public.products;
create policy "products_insert_auth" on public.products for insert to authenticated with check (true);
drop policy if exists "products_update_auth" on public.products;
create policy "products_update_auth" on public.products for update to authenticated using (true) with check (true);
drop policy if exists "products_delete_auth" on public.products;
create policy "products_delete_auth" on public.products for delete to authenticated using (true);

-- bundle_components
drop policy if exists "bundle_components_read"  on public.bundle_components;
create policy "bundle_components_read"  on public.bundle_components for select to authenticated using (true);
drop policy if exists "bundle_components_write" on public.bundle_components;
create policy "bundle_components_write" on public.bundle_components for all to authenticated using (true) with check (true);

-- bills
create policy "bills_read"  on public.bills for select to authenticated using (true);
create policy "bills_write" on public.bills for all to authenticated using (true) with check (true);

-- bill_lines
create policy "bill_lines_read"  on public.bill_lines for select to authenticated using (true);
create policy "bill_lines_write" on public.bill_lines for all to authenticated using (true) with check (true);

-- purchase_orders
create policy "purchase_orders_read"  on public.purchase_orders for select to authenticated using (true);
create policy "purchase_orders_write" on public.purchase_orders for all to authenticated using (true) with check (true);

-- purchase_lines
create policy "purchase_lines_read"  on public.purchase_lines for select to authenticated using (true);
create policy "purchase_lines_write" on public.purchase_lines for all to authenticated using (true) with check (true);

-- customers
drop policy if exists "customers_read" on public.customers;
create policy "customers_read" on public.customers for select to authenticated using (true);
drop policy if exists "customers_write" on public.customers;
create policy "customers_write" on public.customers for all to authenticated using (true) with check (true);

-- agency_settings
drop policy if exists "agency_settings_read" on public.agency_settings;
create policy "agency_settings_read" on public.agency_settings for select to authenticated using (true);
drop policy if exists "agency_settings_write" on public.agency_settings;
create policy "agency_settings_write" on public.agency_settings for all to authenticated using (true) with check (true);

-- ============================================================
-- VIEWS
-- ============================================================

-- ── godown_stock ─────────────────────────────────────────────
create view public.godown_stock as
select
  p.id as product_id, p.name as product_name, p.segment, p.kind, p.unit,
  coalesce(sum(pl.qty), 0)
    - coalesce((
        select sum(bl.qty)
        from bill_lines bl
        join bills b on b.id = bl.bill_id
        where bl.product_id = p.id and b.type = 'sale'
      ), 0)
    - coalesce((
        select sum(bl.qty * bc.qty)
        from bill_lines bl
        join bills b on b.id = bl.bill_id
        join bundle_components bc on bc.bundle_product_id = bl.product_id
        where bc.component_product_id = p.id and b.type = 'sale' and bl.delivered
      ), 0)
    + coalesce((
        select sum(bl.qty)
        from bill_lines bl
        join bills b on b.id = bl.bill_id
        join products pr on pr.id = bl.product_id
        where bl.product_id = p.id and b.type = 'return' and pr.kind != 'cylinder'
      ), 0)
    as full_cylinders,
  (coalesce((
      select sum(bl.empties)
      from bill_lines bl
      join bills b on b.id = bl.bill_id
      where bl.product_id = p.id and b.type = 'sale'
        and not exists (
          select 1 from bundle_components bc2
          where bc2.bundle_product_id = p.id and bc2.qty = 0
        )
    ), 0)
    + coalesce((
        select sum(bl.empties)
        from bill_lines bl
        join bills b on b.id = bl.bill_id
        join bundle_components bc on bc.bundle_product_id = bl.product_id and bc.qty = 0
        where bc.component_product_id = p.id and b.type = 'sale'
      ), 0)
    + coalesce((
        select sum(bl.qty)
        from bill_lines bl
        join bills b on b.id = bl.bill_id
        join products pr on pr.id = bl.product_id
        where bl.product_id = p.id and b.type = 'return' and pr.kind = 'cylinder'
      ), 0))
    + coalesce(sum(pl.empties_given) filter (where po.type = 'opening'), 0)
    - coalesce(sum(pl.empties_given) filter (where po.type != 'opening'), 0)
    as empty_cylinders
from products p
left join purchase_lines pl on pl.product_id = p.id
left join purchase_orders po on po.id = pl.purchase_order_id
where p.active
group by p.id, p.name, p.segment, p.kind, p.unit;

-- ── customer_product_balances (surrender replaces outright) ──
create view public.customer_product_balances as
select
  c.id as customer_id, p.id as product_id, p.name as product_name,
  coalesce(sum(bl.qty) filter (where b.type = 'sale' and not b.surrender), 0)
    + coalesce(sum(bl.qty) filter (where b.type = 'opening'), 0) as sold,
  coalesce(sum(bl.empties) filter (where b.type = 'sale' and not b.surrender), 0)
    + coalesce(sum(bl.qty) filter (where b.type = 'return' and not b.surrender), 0) as returned,
  coalesce(sum(bl.qty) filter (where b.type = 'sale' and not b.surrender), 0)
    + coalesce(sum(bl.qty) filter (where b.type = 'opening'), 0)
    - (coalesce(sum(bl.empties) filter (where b.type = 'sale' and not b.surrender), 0)
       + coalesce(sum(bl.qty) filter (where b.type = 'return' and not b.surrender), 0)) as empties_outstanding
from customers c
cross join products p
left join bills b on b.customer_id = c.id
left join bill_lines bl on bl.bill_id = b.id and bl.product_id = p.id
where p.segment = 'commercial' and p.active
group by c.id, p.id, p.name;

-- ── customer_balances ────────────────────────────────────────
create view public.customer_balances as
select
  c.id, c.name, c.phone, c.address,
  coalesce(sum(b.total_amount) filter (where b.type = 'sale' and not b.paid), 0)
    - coalesce(sum(b.total_amount) filter (where b.type = 'payment'), 0) as amount_due
from customers c
left join bills b on b.customer_id = c.id
group by c.id, c.name, c.phone, c.address;

-- ── activity_feed ────────────────────────────────────────────
create view public.activity_feed as
select
  b.id, b.customer_id, c.name as customer_name, b.type,
  coalesce((select sum(bl.qty) from bill_lines bl where bl.bill_id = b.id), 0) as qty,
  coalesce((select sum(bl.empties) from bill_lines bl where bl.bill_id = b.id), 0) as empties,
  b.total_amount as amount, b.note, b.created_by, b.created_at, b.updated_at, b.updated_by,
  (select bl.product_id from bill_lines bl where bl.bill_id = b.id limit 1) as product_id,
  (select p.name from bill_lines bl join products p on p.id = bl.product_id where bl.bill_id = b.id limit 1) as product_name,
  b.surrender as outright, 'commercial' as segment,
  b.bill_number, b.method, b.paid
from bills b
join customers c on c.id = b.customer_id
where b.type in ('sale', 'return', 'payment')
union all
select
  po.id, null as customer_id,
  (select p.name from purchase_lines pl join products p on p.id = pl.product_id where pl.purchase_order_id = po.id limit 1) as customer_name,
  'purchase' as type,
  coalesce((select sum(pl.qty) from purchase_lines pl where pl.purchase_order_id = po.id), 0) as qty,
  coalesce((select sum(pl.empties_given) from purchase_lines pl where pl.purchase_order_id = po.id), 0) as empties,
  po.total_amount as amount, po.note, po.created_by, po.created_at, po.updated_at, po.updated_by,
  (select pl.product_id from purchase_lines pl where pl.purchase_order_id = po.id limit 1) as product_id,
  (select p.name from purchase_lines pl join products p on p.id = pl.product_id where pl.purchase_order_id = po.id limit 1) as product_name,
  false as outright,
  (select p.segment from purchase_lines pl join products p on p.id = pl.product_id where pl.purchase_order_id = po.id limit 1) as segment,
  po.po_number as bill_number, null::text as method, po.paid
from purchase_orders po
where po.type = 'purchase'
order by created_at desc;

-- ── daily_product_summary ────────────────────────────────────
create view public.daily_product_summary as
select
  (b.created_at at time zone 'Asia/Kolkata')::date as day,
  bl.product_id, p.name as product_name, p.segment,
  coalesce(sum(bl.qty) filter (where b.type = 'sale'), 0) as cylinders_sold,
  coalesce(sum(bl.amount) filter (where b.type = 'sale'), 0) as revenue,
  coalesce(sum(bl.amount) filter (where b.type = 'sale' and b.paid), 0) as collected_at_sale,
  coalesce(sum(bl.empties) filter (where b.type = 'sale'), 0)
    + coalesce(sum(bl.qty) filter (where b.type = 'return'), 0) as empties_collected
from bill_lines bl
join bills b on b.id = bl.bill_id
join products p on p.id = bl.product_id
where b.type in ('sale', 'return')
group by 1, 2, 3, 4;

-- ── daily_purchase_summary ───────────────────────────────────
create view public.daily_purchase_summary as
select
  (po.created_at at time zone 'Asia/Kolkata')::date as day,
  pl.product_id, p.segment,
  coalesce(sum(pl.qty), 0) as cylinders_purchased,
  coalesce(sum(pl.empties_given), 0) as empties_given_to_supplier,
  coalesce(sum(pl.amount), 0) as purchase_amount
from purchase_lines pl
join purchase_orders po on po.id = pl.purchase_order_id
join products p on p.id = pl.product_id
where po.type = 'purchase'
group by 1, 2, 3;

-- ── daily_money_summary ──────────────────────────────────────
create view public.daily_money_summary as
select
  (created_at at time zone 'Asia/Kolkata')::date as day,
  coalesce(sum(total_amount) filter (where type = 'payment'), 0) as payments_collected
from bills
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
