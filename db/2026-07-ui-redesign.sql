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
