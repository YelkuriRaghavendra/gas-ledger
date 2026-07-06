# Multi-Product Foundation (Phase 1 of "2.0")

Date: 2026-07-04

## Purpose

This is Phase 1 of the app's "2.0" initiative. The 2.0 goal, as requested, spans five areas that turned out to be interdependent rather than independent:

1. More reporting/insight — daily/monthly summaries, revenue trends
2. A purchase tab and complete inventory management with stock levels
3. Support for a second cylinder size (5 kg), alongside the existing 19 kg
4. Visibility into how many empties are in the godown vs. with customers
5. Predicting when the godown will run out of storage space for empties, based on purchase (refill) frequency

Decomposition: (3) is foundational — every other item needs to know "which product" a transaction is about. (2), (4), and (5) form one cohesive subsystem (you can't show godown stock or predict capacity without tracking purchases against sales). (1) is comparatively independent but benefits from the multi-product data model existing first. This produces three phases:

- **Phase 1 (this spec):** Multi-product foundation — introduce products, make every existing screen product-aware.
- **Phase 2:** Purchases + godown inventory + capacity prediction.
- **Phase 3:** Reporting/insights.

This spec covers Phase 1 only. Phases 2 and 3 have their own specs and depend on this one being implemented first.

## Data model

**Migration numbering across the three phases:** the latest migration on disk is `005_starting_empties.sql`. This spec's migration is `supabase/migrations/006_products.sql`. Phase 2's migration is `007_purchases_and_godown.sql` and Phase 3's is `008_reporting_views.sql` — both fixed numbers now that this phase claims `006`, so all three specs agree.

**New `products` table:**

```sql
create table products (
  id         bigint generated always as identity primary key,
  name       text not null,
  price      numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
```

Seeded with two rows: `'19 kg'` (price copied from the current `agency_settings.price_per_cylinder`) and `'5 kg'` (price `0`, to be set by the owner via the Products screen). No UI is built in this phase for adding further products — the two rows are seeded once, directly in the migration.

**`transactions.product_id`:** added, required for `type in ('sale', 'return')`, `NULL` for `type = 'payment'`. Enforced with a check constraint:

```sql
alter table transactions add column product_id bigint references products(id);
alter table transactions add constraint product_required_unless_payment
  check ((type = 'payment') = (product_id is null));
```

Money is fungible and isn't tied to a specific cylinder size, so payments stay product-agnostic. Physical cylinders are not interchangeable between sizes, so sales and returns must reference a product. Every existing `sale`/`return` row is backfilled to the `'19 kg'` product as part of the same migration — no manual cleanup, no data loss.

**`customers.starting_empties_product_id`:** added alongside the existing `starting_empties_owed` column, backfilled to the `'19 kg'` product id for every current customer. This makes the "empties already owed at onboarding" feature (already shipped) product-aware without altering its existing values for any customer.

**`amount_due` stays customer-level, not per-product.** Money doesn't have the "can't substitute a 5kg empty for a 19kg empty" problem that empties do, so there is no reason to split it. The existing `customer_balances` view keeps its `amount_due` calculation exactly as-is (`sum(sale.amount where not paid) - sum(payment.amount)`, unaffected by product). It drops `sold`, `returned`, and `empties_outstanding`, since a single number for those is now ambiguous across two products.

**New `customer_product_balances` view**, one row per (customer, product):

```sql
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
```

The `cross join` guarantees every customer has a row for every product (even all-zero rows), so the UI can always render both product cards without conditional logic for "customer has never bought this size."

**`agency_settings.price_per_cylinder` is deprecated** once its value is copied into the `'19 kg'` product row. It is not dropped in this migration (dropping a column read by not-yet-updated code would break the app mid-deploy) — Phase 1's code changes stop reading it, and a follow-up cleanup can drop the column later. This is noted explicitly so it isn't mistaken for an oversight.

## Screen changes

**New Sale:** gains a product picker (same visual style as the existing customer picker), placed above the quantity stepper. Price-each prefills from the selected product's `price` instead of `agency_settings.price_per_cylinder`. The "19 kg cylinders sold" label becomes `"{product.name} cylinders sold"`. The "Currently owed by customer" box and the empties-taken validation cap (`currentlyOwed + qty`, established in a prior round) now read `customer_product_balances` filtered to the selected product, not the old single `customer_balances.empties_outstanding`. Switching the product picker after entering values resets the empties field to 0 (since a "16 empties of 19kg" input is meaningless once switched to 5kg) and re-fetches the new product's price and owed-empties figures.

**Log Return:** identical treatment — product picker added, "Currently owed by customer" and the return-cap validation both scoped to the selected product.

**Record Payment:** unchanged. No product picker — payments reduce the single combined `amount_due`.

**Customer Detail:** the single Sold/Returned/Empties equation card becomes two cards, one per product, shown side by side (stacking vertically on narrow viewports) below the customer header. Each card shows that product's Sold, Returned, and Empties Outstanding using the same visual language as the current card. The "Amount due" figure stays as a single value below both cards, unchanged. History rows show which product each sale/return was for (e.g., "3 × 19 kg sold" instead of "3 cylinders sold"); payment rows are unaffected since they were never product-specific. The customer edit form's "Empties already owed" field gains a product picker next to it, defaulting to whatever `starting_empties_product_id` is currently set to (19 kg for all pre-existing customers).

**Add Customer:** the existing "Empties already owed" field gains the same product picker, defaulting to 19 kg.

**Customers list / Home dashboard:** the empties-outstanding figure shown in list badges and the dashboard summary becomes a sum across both products (e.g., 5 empties of 19kg + 2 empties of 5kg shows as "7 empties outstanding"). This keeps the list scannable; the per-product breakdown is only shown on Customer Detail. `amount_due` in these views is unaffected since it was never product-specific.

**Activity Feed:** each sale/return entry's title gains the product name, matching Customer Detail's history treatment. Payment entries are unaffected.

**Cylinder Pricing → "Products":** the screen is renamed and its single price field becomes a list of two rows (19 kg, 5 kg), each independently editable, each with the same greater-than-zero validation already in place. No add/remove-product controls in this phase.

## Testing approach

Consistent with the rest of the app: manual verification against the live Supabase project. Specific checks:

- After running the migration, every existing customer's 19 kg card shows Sold/Returned/Empties/Amount-Due figures identical to what the single-product view showed before migration (spot-check at least 3 customers against pre-migration screenshots or the `customer_balances` view's old output).
- Record a 5 kg sale for a customer with existing 19 kg history; confirm their 19 kg card is unaffected and the 5 kg card reflects only the new sale.
- Confirm Record Payment still reduces the single combined `amount_due`, regardless of which product's sales contributed to it.
- Confirm the empties-taken validation on a 5 kg sale is bounded by the customer's 5 kg empties outstanding, not their 19 kg figure (and vice versa).
- Confirm a brand-new customer with no starting-empties override shows all-zero rows for both products rather than an error or missing card.

## Out of scope

- Purchases, godown inventory, and capacity prediction — Phase 2.
- Reporting/insights — Phase 3.
- UI for adding, renaming, or removing product types beyond the two seeded in this migration.
- Dropping `agency_settings.price_per_cylinder` (deprecated, not removed, in this phase).
- Per-product starting-empties history for more than one product per customer at onboarding time (the picker exists, but there's no requirement to backfill anything beyond the existing 19 kg values).
