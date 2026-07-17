-- Expose transactions.outright in the activity feed so the UI can mark
-- outright sales/returns (customer owns the cylinder) and avoid showing a
-- misleading empties movement (e.g. an outright return rendered as "-9").
-- Purchases are never outright. Recreating the view; column order must match
-- across the UNION.
drop view if exists public.activity_feed;
create view public.activity_feed as
select
  t.id, t.customer_id, c.name as customer_name, t.type, t.qty, t.empties,
  t.amount, t.note, t.created_by, t.created_at, t.updated_at, t.updated_by,
  t.product_id, p.name as product_name, t.outright, 'commercial' as segment
from transactions t
join customers c on c.id = t.customer_id
left join products p on p.id = t.product_id
union all
select
  pu.id, null as customer_id, pr.name as customer_name, 'purchase' as type,
  pu.qty, pu.empties_given as empties, pu.amount, pu.note, pu.created_by,
  pu.created_at, pu.updated_at, pu.updated_by, pu.product_id, pr.name as product_name,
  false as outright, pr.segment
from purchases pu
join products pr on pr.id = pu.product_id
order by created_at desc;
