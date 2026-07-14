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
  t.product_id, p.name as product_name, p.segment
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
