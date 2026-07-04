-- ============================================================================
-- Cylinder Tracker — FRESH DATABASE SETUP (full 2.0 schema)
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor of a NEW project and run
-- it once. It builds the complete current schema (base + migrations 002–008)
-- from scratch, so a brand-new project ends up with every 2.0 table, view,
-- and policy. Order matters — do not reorder sections.
--
-- This is for a fresh/empty project only. Do NOT run this against a database
-- that already has data; for that, run the individual migration files in
-- numeric order instead.
--
-- After running this, sign up a user in the app, then promote it to owner:
--   update profiles set role = 'owner'
--   where id = (select id from auth.users where email = 'YOUR_EMAIL');
-- ============================================================================



-- ==== schema.sql ====

create table customers (
  id         bigint generated always as identity primary key,
  name       text not null,
  phone      text,
  address    text,
  created_at timestamptz not null default now()
);

create table transactions (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  type        text not null check (type in ('sale','return','payment')),
  qty         int not null default 0,
  empties     int not null default 0,
  amount      numeric(12,2) not null default 0,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index on transactions (customer_id, created_at desc);

create table profiles (
  id   uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  role text not null default 'staff' check (role in ('owner','staff'))
);

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'staff');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create view customer_balances as
select
  c.id, c.name, c.phone, c.address,
  coalesce(sum(t.qty)     filter (where t.type='sale'), 0)                                as sold,
  coalesce(sum(t.empties) filter (where t.type='sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type='return'), 0)                             as returned,
  coalesce(sum(t.qty)     filter (where t.type='sale'), 0)
    - (coalesce(sum(t.empties) filter (where t.type='sale'), 0)
       + coalesce(sum(t.qty)  filter (where t.type='return'), 0))                        as empties_outstanding,
  coalesce(sum(t.amount)  filter (where t.type='sale'), 0)
    - coalesce(sum(t.amount) filter (where t.type='payment'), 0)                         as amount_due
from customers c
left join transactions t on t.customer_id = c.id
group by c.id;

create view activity_feed as
select
  t.id, t.customer_id, c.name as customer_name, t.type, t.qty, t.empties,
  t.amount, t.note, t.created_by, t.created_at
from transactions t
join customers c on c.id = t.customer_id
order by t.created_at desc;

alter table customers enable row level security;
alter table transactions enable row level security;
alter table profiles enable row level security;

create policy "read customers" on customers for select to authenticated using (true);
create policy "insert customers" on customers for insert to authenticated with check (true);
create policy "owner update customers" on customers for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "owner delete customers" on customers for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create policy "read transactions" on transactions for select to authenticated using (true);
create policy "insert own transactions" on transactions for insert to authenticated
  with check (created_by = auth.uid());
create policy "owner update transactions" on transactions for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "owner delete transactions" on transactions for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create policy "read own profile" on profiles for select to authenticated using (id = auth.uid());


-- ==== migrations/002_agency_settings.sql ====

create table agency_settings (
  id boolean primary key default true check (id),
  business_name text not null default '',
  business_phone text,
  business_address text,
  price_per_cylinder numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into agency_settings (id) values (true);

alter table agency_settings enable row level security;

create policy "public read agency settings" on agency_settings
  for select to anon, authenticated using (true);

create policy "owner update agency settings" on agency_settings
  for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));


-- ==== migrations/003_sale_paid_flag.sql ====

alter table transactions add column paid boolean not null default false;

create or replace view customer_balances as
select
  c.id, c.name, c.phone, c.address,
  coalesce(sum(t.qty)     filter (where t.type='sale'), 0)                                as sold,
  coalesce(sum(t.empties) filter (where t.type='sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type='return'), 0)                             as returned,
  coalesce(sum(t.qty)     filter (where t.type='sale'), 0)
    - (coalesce(sum(t.empties) filter (where t.type='sale'), 0)
       + coalesce(sum(t.qty)  filter (where t.type='return'), 0))                        as empties_outstanding,
  coalesce(sum(t.amount)  filter (where t.type='sale' and not t.paid), 0)
    - coalesce(sum(t.amount) filter (where t.type='payment'), 0)                         as amount_due
from customers c
left join transactions t on t.customer_id = c.id
group by c.id;


-- ==== migrations/004_payment_method.sql ====

alter table transactions add column method text check (method in ('cash','upi'));


-- ==== migrations/005_starting_empties.sql ====

alter table customers add column starting_empties_owed int not null default 0;

-- Reshaping the view (inserting a column) requires DROP + CREATE; Postgres
-- CREATE OR REPLACE VIEW can only append columns at the end, not reorder them.
drop view if exists customer_balances;
create view customer_balances as
select
  c.id, c.name, c.phone, c.address, c.starting_empties_owed,
  c.starting_empties_owed + coalesce(sum(t.qty) filter (where t.type='sale'), 0)          as sold,
  coalesce(sum(t.empties) filter (where t.type='sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type='return'), 0)                             as returned,
  c.starting_empties_owed + coalesce(sum(t.qty) filter (where t.type='sale'), 0)
    - (coalesce(sum(t.empties) filter (where t.type='sale'), 0)
       + coalesce(sum(t.qty)  filter (where t.type='return'), 0))                        as empties_outstanding,
  coalesce(sum(t.amount)  filter (where t.type='sale' and not t.paid), 0)
    - coalesce(sum(t.amount) filter (where t.type='payment'), 0)                         as amount_due
from customers c
left join transactions t on t.customer_id = c.id
group by c.id;


-- ==== migrations/006_products.sql ====

-- Phase 1 of "2.0": multi-product foundation.
-- Introduces a products table (19 kg, 5 kg), makes transactions and
-- customers' starting-empties balance product-aware, and replaces
-- customer_balances with a slimmer view plus a new per-product view.

create table products (
  id         bigint generated always as identity primary key,
  name       text not null,
  price      numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

insert into products (name, price)
select '19 kg', coalesce((select price_per_cylinder from agency_settings where id = true), 0);

insert into products (name, price) values ('5 kg', 0);

-- transactions.product_id: required for sale/return, null for payment.
alter table transactions add column product_id bigint references products(id);

update transactions
set product_id = (select id from products where name = '19 kg')
where type in ('sale', 'return');

alter table transactions add constraint product_required_unless_payment
  check ((type = 'payment') = (product_id is null));

-- customers.starting_empties_product_id: which product the onboarding
-- starting_empties_owed balance applies to. Backfilled to 19 kg so existing
-- customers' figures are unchanged.
alter table customers add column starting_empties_product_id bigint references products(id);

update customers
set starting_empties_product_id = (select id from products where name = '19 kg');

alter table customers alter column starting_empties_product_id set not null;

-- customer_balances keeps amount_due (product-agnostic) and drops the
-- per-product sold/returned/empties columns, which are now ambiguous
-- across two products. DROP + CREATE (not CREATE OR REPLACE) because we are
-- removing columns, which CREATE OR REPLACE VIEW cannot do.
drop view if exists customer_balances;
create view customer_balances as
select
  c.id, c.name, c.phone, c.address, c.starting_empties_owed,
  coalesce(sum(t.amount) filter (where t.type = 'sale' and not t.paid), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'payment'), 0) as amount_due
from customers c
left join transactions t on t.customer_id = c.id
group by c.id;

-- One row per (customer, product), always present via the cross join so the
-- UI can render both product cards without conditional "never bought this
-- size" logic.
create view customer_product_balances as
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
group by c.id, p.id, p.name, c.starting_empties_product_id, c.starting_empties_owed;

-- activity_feed gains product info so history/activity titles can show the
-- product name for sale/return entries (null for payments).
create or replace view activity_feed as
select
  t.id, t.customer_id, c.name as customer_name, t.type, t.qty, t.empties,
  t.amount, t.note, t.created_by, t.created_at,
  t.product_id, p.name as product_name
from transactions t
join customers c on c.id = t.customer_id
left join products p on p.id = t.product_id
order by t.created_at desc;

alter table products enable row level security;

create policy "read products" on products for select to authenticated using (true);
create policy "owner update products" on products for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));


-- ==== migrations/007_purchases_and_godown.sql ====

-- Phase 2 of "2.0": purchases + godown inventory.
-- Introduces a purchases table (agency-wide, no supplier tracking), a
-- godown_capacity column on products, and a godown_stock view that derives
-- full/empty cylinder counts from purchases vs. sales/returns.

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

alter table products add column godown_capacity int;

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

alter table purchases enable row level security;

create policy "read purchases" on purchases for select to authenticated using (true);
create policy "insert own purchases" on purchases for insert to authenticated
  with check (created_by = auth.uid());
create policy "owner update purchases" on purchases for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "owner delete purchases" on purchases for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));


-- ==== migrations/008_reporting_views.sql ====

-- Phase 3 of "2.0": reporting & insights.
-- Adds daily/monthly rollup views for the new Reports screen. Sale/return
-- figures are broken down by product (possible now that Phase 1 exists);
-- payments stay combined since they aren't product-specific.
--
-- Purchases-derived views (daily_purchase_summary) read Phase 2's
-- `purchases` table. Per the Phase 3 spec, this migration is numbered after
-- Phase 2's (007_purchases_and_godown.sql), so by the time migrations run
-- against a live Supabase project in the normal order, `purchases` will
-- already exist. This migration does NOT special-case a missing `purchases`
-- table — it assumes 007 has already run. If this migration is ever run
-- against a database where 007 has not run, `daily_purchase_summary` will
-- fail to create; run migrations in numeric order to avoid this.
--
-- The React/TypeScript side of this phase does not hard-depend on this view
-- existing at runtime: useDailySummary/useMonthlySummary query it
-- defensively and simply omit the "Purchased from supplier" section if the
-- query errors (e.g. relation does not exist), so the app still degrades
-- gracefully in an environment where Phase 2 hasn't shipped yet.

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

-- Assumption (flagged, see Phase 3 spec): purchases has shape
-- product_id, qty, empties_given, amount, paid, method, note, created_at.
-- Only this view needs to change if Phase 2 ships a different shape.
create view daily_purchase_summary as
select
  date_trunc('day', created_at) as day,
  product_id,
  coalesce(sum(qty), 0) as cylinders_purchased,
  coalesce(sum(empties_given), 0) as empties_given_to_supplier,
  coalesce(sum(amount), 0) as purchase_amount
from purchases
group by 1, 2;

-- Monthly rollups are views-of-views over the daily rollups above, per spec,
-- rather than duplicating the transaction-level aggregation.
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

-- RLS: all views are read-only rollups over transactions/purchases, which
-- already carry `for select to authenticated using (true)` policies. Views
-- inherit the querying user's access to their underlying tables in this
-- Supabase setup (same as customer_balances/activity_feed), so no new
-- policies are needed here.

