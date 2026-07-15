-- ============================================================
-- UI redesign — additive schema changes. Run once in Supabase SQL editor.
-- ============================================================

-- 1. Business details: GST + structured address
alter table public.agency_settings add column if not exists address_line1 text;
alter table public.agency_settings add column if not exists address_line2 text;
alter table public.agency_settings add column if not exists city text;
alter table public.agency_settings add column if not exists pincode text;
alter table public.agency_settings add column if not exists gst_number text;

-- Backfill line1 from the old single-line address (kept, unused going forward)
update public.agency_settings
set address_line1 = business_address
where address_line1 is null and business_address is not null;

-- 2. Last-updated tracking on the ledgers
alter table public.transactions add column if not exists updated_at timestamptz not null default now();
alter table public.transactions add column if not exists updated_by uuid;
alter table public.purchases   add column if not exists updated_at timestamptz not null default now();
alter table public.purchases   add column if not exists updated_by uuid;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_touch_transactions on public.transactions;
create trigger trg_touch_transactions before update on public.transactions
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_purchases on public.purchases;
create trigger trg_touch_purchases before update on public.purchases
  for each row execute function public.touch_updated_at();

-- 3. activity_feed: customer transactions + supplier purchases, segment-aware
drop view if exists public.activity_feed;
create view public.activity_feed as
select
  t.id, t.customer_id, c.name as customer_name, t.type, t.qty, t.empties,
  t.amount, t.note, t.created_by, t.created_at, t.updated_at,
  t.product_id, p.name as product_name, 'commercial' as segment
from transactions t
join customers c on c.id = t.customer_id
left join products p on p.id = t.product_id
union all
select
  pu.id, null as customer_id, pr.name as customer_name, 'purchase' as type,
  pu.qty, pu.empties_given as empties, pu.amount, pu.note, pu.created_by,
  pu.created_at, pu.updated_at, pu.product_id, pr.name as product_name, pr.segment
from purchases pu
join products pr on pr.id = pu.product_id
order by created_at desc;

-- 4. Outright cylinder sales: customer buys/owns the cylinder (not part of empties-owed)
alter table public.transactions add column if not exists outright boolean not null default false;

-- customer_product_balances: outright sales/returns don't move the empties-owed
-- needle. godown_stock is unaffected by this change (kept as-is): a full
-- cylinder still leaves the godown on an outright sale, and an outright
-- return's qty still adds an empty back to the godown.
create or replace view public.customer_product_balances as
select
  c.id as customer_id,
  p.id as product_id,
  p.name as product_name,
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
