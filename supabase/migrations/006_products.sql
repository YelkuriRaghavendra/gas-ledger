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
