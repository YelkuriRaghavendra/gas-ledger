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
