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
