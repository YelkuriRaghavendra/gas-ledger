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
