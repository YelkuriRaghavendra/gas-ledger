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
  gst_rate           numeric     not null default 18,
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
-- whatsapp_enabled defaults to false: nothing is sent until a customer is
-- explicitly opted in.
create table if not exists public.customers (
  id                bigserial   primary key,
  name              text        not null,
  phone             text,
  address           text,
  whatsapp_enabled  boolean     not null default false,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid
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

-- ── whatsapp_sends: WhatsApp bill notification send log ──────
-- One row per send ATTEMPT, not per bill. A retry appends a row so the
-- history of what failed and why is preserved. A row is claimed as
-- 'pending' before the Meta call and updated in place once it resolves, so
-- the unique index below can guarantee at most one live send per bill.
create table if not exists public.whatsapp_sends (
  id          bigserial   primary key,
  bill_id     bigint      not null references public.bills(id) on delete cascade,
  status      text        not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  reason      text,
  message_id  text,
  template    text        not null,
  -- What the delivery webhook reported afterwards. `status` above records what
  -- happened when we called Meta; these record whether it actually arrived.
  delivery_status     text check (delivery_status in ('sent', 'delivered', 'read', 'failed')),
  delivery_updated_at timestamptz,
  error_code          int,
  error_detail        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_whatsapp_sends_bill on public.whatsapp_sends (bill_id);
-- The delivery webhook arrives with only a wamid, so this is its lookup path.
-- Partial, because rows that never reached Meta have no message_id.
create index if not exists idx_whatsapp_sends_message_id
  on public.whatsapp_sends (message_id)
  where message_id is not null;
-- At most one row that is in-flight or already succeeded per bill. Any
-- number of 'failed'/'skipped' rows is fine — retries append, as designed.
create unique index if not exists whatsapp_sends_one_live_per_bill
  on public.whatsapp_sends (bill_id)
  where status in ('pending', 'sent');

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
    -- Mirror created_at rather than stamping now(): created_at is user-supplied
    -- for backdated entries, so now() would leave a brand-new row looking as
    -- though it had been edited (created 3 Sep, "updated" 4 Sep). Callers read
    -- updated_at = created_at as "never edited".
    new.updated_at := new.created_at;
    -- Prefer the real actor over anything the client sent, so a spoofed
    -- created_by cannot propagate into updated_by. Falls back to the supplied
    -- value only when there is no auth context (service-role data import).
    new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
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
-- OWNER-ONLY GUARD: customers.whatsapp_enabled
-- ============================================================
-- Enforced here rather than via RLS: a restrictive `with check
-- (whatsapp_enabled = false or <is owner>)` on customers_write would also
-- block a staff member from editing the phone number of an already-enabled
-- customer, since the post-update row still has the flag set. A trigger can
-- compare old vs new and restrict only a change to the flag itself, leaving
-- every other column staff-editable as before.
create or replace function public.enforce_whatsapp_enabled_owner_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.whatsapp_enabled and not exists (
      select 1 from public.profiles where id = auth.uid() and role = 'owner'
    ) then
      raise exception 'only an owner can enable WhatsApp for a customer';
    end if;
  elsif new.whatsapp_enabled is distinct from old.whatsapp_enabled and not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  ) then
    raise exception 'only an owner can change whatsapp_enabled';
  end if;
  return new;
end $$;

drop trigger if exists trg_whatsapp_enabled_owner_only on public.customers;
create trigger trg_whatsapp_enabled_owner_only
  before insert or update on public.customers
  for each row execute function public.enforce_whatsapp_enabled_owner_only();

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.products          enable row level security;
alter table public.customers         enable row level security;
alter table public.bundle_components enable row level security;
alter table public.bills             enable row level security;
alter table public.bill_lines        enable row level security;
alter table public.whatsapp_sends    enable row level security;
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

-- whatsapp_sends: read-only for the app. There is deliberately NO insert
-- policy for authenticated — rows are written solely by the Edge Function
-- using the service role key, which bypasses RLS. A client able to insert
-- here could fake a 'sent' status for a bill that was never delivered.
create policy "whatsapp_sends_read" on public.whatsapp_sends for select to authenticated using (true);

-- purchase_orders
create policy "purchase_orders_read"  on public.purchase_orders for select to authenticated using (true);
create policy "purchase_orders_write" on public.purchase_orders for all to authenticated using (true) with check (true);

-- purchase_lines
create policy "purchase_lines_read"  on public.purchase_lines for select to authenticated using (true);
create policy "purchase_lines_write" on public.purchase_lines for all to authenticated using (true) with check (true);

-- customers
-- Any authenticated user can write any column here — EXCEPT
-- whatsapp_enabled, which trg_whatsapp_enabled_owner_only (see the OWNER-ONLY
-- GUARD section above) restricts to owners regardless of this policy.
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

-- ── product_unit_cost ────────────────────────────────────────
-- Cost basis: the latest purchase rate on or before the sale date — replacement
-- cost, not a blended average. The OMC revises the commercial rate on the 1st of
-- every month, so two bills for the same product at the same sale price will
-- legitimately show different profit if a revision fell between them.

create or replace view public.product_unit_cost as
select
  pl.product_id,
  (po.created_at at time zone 'Asia/Kolkata')::date        as cost_date,
  (pl.amount / pl.qty) / (1 + p.gst_rate / 100.0)          as unit_cost_ex,
  po.po_number,
  po.created_at
from public.purchase_lines pl
join public.purchase_orders po on po.id = pl.purchase_order_id
join public.products p on p.id = pl.product_id
where po.type = 'purchase'
  and pl.qty > 0;

revoke all on public.product_unit_cost from public, anon, authenticated;

-- Prefers the nearest purchase on or before the sale date. Falls forward to the
-- earliest purchase after it when the product was first bought later than the
-- sale — otherwise a backdated bill would report infinite margin.
--
-- The created_at / po_number keys make the order TOTAL. Without them two
-- purchase lines for one product sharing a cost_date rank equally and Postgres
-- returns either — the 1st-of-month revision case exactly, where an old-rate PO
-- and a new-rate PO land on the same day, and the same bill can then report two
-- different margins on two queries. On a tie the most recently recorded
-- purchase wins, which is the one that reflects replacement cost.
create or replace function public.resolve_unit_cost(p_product_id bigint, p_date date)
returns table (unit_cost_ex numeric, cost_source text)
language sql stable as $$
  select uc.unit_cost_ex, uc.po_number
  from public.product_unit_cost uc
  where uc.product_id = p_product_id
  order by
    (uc.cost_date <= p_date) desc,
    abs(uc.cost_date - p_date) asc,
    uc.created_at desc,
    uc.po_number desc
  limit 1
$$;

-- `from public`, not just `from anon, authenticated`: Postgres grants EXECUTE on
-- every new function to PUBLIC by default, and revoking from two named roles
-- leaves that grant standing — the function stays callable by anyone through
-- POST /rest/v1/rpc/.
revoke all on function public.resolve_unit_cost(bigint, date) from public, anon, authenticated;

-- A bundle line (New Connection) has no purchase of its own; it costs as the sum
-- of its components. If any component's cost is unknown the sum is null, and the
-- line is flagged rather than silently costed at zero.
-- Scalar subqueries, not UNION ALL + LIMIT 1: a union's row order is not
-- guaranteed without ORDER BY, and the bundle branch is a bare aggregate that
-- returns a NULL row even for products that are not bundles. This form always
-- returns exactly one row and always prefers the direct cost.
--
-- bool_and forces the bundle cost to NULL when ANY component cost is unknown.
-- Without it, sum() would quietly skip the unknown component and report a
-- partial cost as if it were the whole thing.
create or replace function public.resolve_line_cost(p_product_id bigint, p_date date)
returns table (unit_cost_ex numeric, cost_source text)
language sql stable as $$
  select
    coalesce(
      (select d.unit_cost_ex from public.resolve_unit_cost(p_product_id, p_date) d),
      bundle.cost
    ),
    case
      when exists (select 1 from public.resolve_unit_cost(p_product_id, p_date))
        then (select d.cost_source from public.resolve_unit_cost(p_product_id, p_date) d)
      when bundle.cost is not null then 'bundle'
      else null
    end
  from (
    select case
             when bool_and(comp.unit_cost_ex is not null)
               then sum(bc.qty * comp.unit_cost_ex)
           end as cost
    from public.bundle_components bc
    left join lateral public.resolve_unit_cost(bc.component_product_id, p_date) comp on true
    where bc.bundle_product_id = p_product_id
  ) bundle
$$;

revoke all on function public.resolve_line_cost(bigint, date) from public, anon, authenticated;

-- ── bill_line_profit ─────────────────────────────────────────
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

revoke all on public.bill_line_profit from anon, authenticated;

-- ── bill_profit ──────────────────────────────────────────────
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

revoke all on public.bill_profit from anon, authenticated;

-- ── profit access: owner gate ────────────────────────────────
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

-- These four are `security definer` and call require_owner() first, so the owner
-- gate holds regardless — but the default PUBLIC EXECUTE grant is revoked so the
-- privilege matches the intent rather than resting on the guard alone.
revoke all on function public.commercial_bill_profit(date, date)          from public;
revoke all on function public.commercial_bill_profit_for_customer(bigint) from public;
revoke all on function public.commercial_bill_line_profit(bigint)         from public;
revoke all on function public.commercial_line_profit_range(date, date)    from public;

grant execute on function public.commercial_bill_profit(date, date)          to authenticated;
grant execute on function public.commercial_bill_profit_for_customer(bigint) to authenticated;
grant execute on function public.commercial_bill_line_profit(bigint)         to authenticated;
grant execute on function public.commercial_line_profit_range(date, date)    to authenticated;

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

update public.products set gst_rate = 5 where segment = 'domestic';

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
