-- ============================================================
-- Daily summary views: bucket the day in IST, not UTC
--
-- Run this ONLY if you already applied 2026-07-16-full-3.0-migration.sql
-- (which created these three views bucketing by UTC). A fresh run of that
-- migration already contains this fix — this file is the incremental patch
-- for a DB that was migrated before the fix.
--
-- Bug: day = date_trunc('day', created_at) bucketed in UTC, but the app
-- asks for "today" in IST. For IST (+5:30) the keys never matched, so
-- "Sold today" (and today's collections/purchases) always read 0.
-- Fix: bucket by (created_at at time zone 'Asia/Kolkata')::date.
--
-- The `day` column type changes (timestamp -> date), so these must be
-- DROP + CREATE, not CREATE OR REPLACE. Nothing depends on them (the
-- monthly_* views are gone), so the drops are safe. Idempotent / re-runnable.
-- ============================================================

drop view if exists public.daily_product_summary;
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

drop view if exists public.daily_purchase_summary;
create view public.daily_purchase_summary as
select
  (pu.created_at at time zone 'Asia/Kolkata')::date as day, pu.product_id, p.segment,
  coalesce(sum(pu.qty), 0) as cylinders_purchased,
  coalesce(sum(pu.empties_given), 0) as empties_given_to_supplier,
  coalesce(sum(pu.amount), 0) as purchase_amount
from purchases pu
join products p on p.id = pu.product_id
group by 1, 2, 3;

drop view if exists public.daily_money_summary;
create view public.daily_money_summary as
select
  (created_at at time zone 'Asia/Kolkata')::date as day,
  coalesce(sum(amount) filter (where type = 'payment'), 0) as payments_collected
from transactions
group by 1;
