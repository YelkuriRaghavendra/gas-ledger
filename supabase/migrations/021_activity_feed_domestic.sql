-- activity_feed covers the domestic side too, so one Activity page can serve
-- both segments.
--
-- Two problems with the old definition: the bills arm inner-joined customers,
-- which dropped every domestic bill (counter sales carry customer_id null),
-- and it labelled whatever survived as 'commercial' regardless. The join is now
-- a left join and the segment is derived from the customer link — a bill with
-- no customer is a domestic counter bill by construction. customer_name is
-- therefore null on the domestic side; the client titles those rows from the
-- bill number and product instead of inventing a counterparty. The purchases arm is
-- unchanged: it already reads its segment from the product.
--
-- nc_qty is new: New Connection cylinders on the bill. It is summed across all
-- lines here because the feed only exposes the first line's product_id, so the
-- client cannot work it out from the row it receives. Purchases report 0.

create or replace view public.activity_feed as
select
  b.id, b.customer_id,
  c.name as customer_name,
  b.type,
  coalesce((select sum(bl.qty) from bill_lines bl where bl.bill_id = b.id), 0) as qty,
  coalesce((select sum(bl.empties) from bill_lines bl where bl.bill_id = b.id), 0) as empties,
  b.total_amount as amount, b.note, b.created_by, b.created_at, b.updated_at, b.updated_by,
  (select bl.product_id from bill_lines bl where bl.bill_id = b.id limit 1) as product_id,
  (select p.name from bill_lines bl join products p on p.id = bl.product_id where bl.bill_id = b.id limit 1) as product_name,
  b.surrender as outright,
  case when b.customer_id is null then 'domestic' else 'commercial' end as segment,
  b.bill_number, b.method, b.paid,
  coalesce((
    select sum(bl.qty) from bill_lines bl join products p on p.id = bl.product_id
    where bl.bill_id = b.id and p.is_new_connection
  ), 0) as nc_qty
from bills b
left join customers c on c.id = b.customer_id
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
  po.po_number as bill_number, null::text as method, po.paid, 0::numeric as nc_qty
from purchase_orders po
where po.type = 'purchase'
order by created_at desc;
