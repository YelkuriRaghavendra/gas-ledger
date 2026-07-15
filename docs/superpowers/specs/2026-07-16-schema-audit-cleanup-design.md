# Schema Audit Cleanup — Design

**Date:** 2026-07-16
**Status:** Approved (pending user review of this doc)

## Goal

Give the Cylinder Tracker database a clean, uniform, well-documented structure — without
re-architecting anything that works. Three concrete outcomes:

1. **One canonical schema file** — a single `db/schema.sql` that describes the entire
   desired schema (tables, trigger, views, RLS, seed) and can build a fresh database.
   The single source of truth to read when you want to understand the system.
2. **Uniform audit columns** on every table — `id`, `created_at`, `created_by`,
   `updated_at`, `updated_by` — auto-stamped by one shared trigger.
3. **Drop what's dead** — the one unused view and the one orphaned hook.

Explicitly **out of scope** (decided during brainstorming):

- No table merges, no id-type changes, no destructive rebuild.
- No bills/lines or purchases/lines normalization. The flat `transactions` + `bill_id`
  ledger stays. Rationale and the deferred idea live in
  `future-bills-normalization.md`.
- No screen/behavior change. The app looks and works identically afterward.

## Context: current schema

**7 tables:** `profiles`, `products`, `customers`, `transactions`, `purchases`,
`bundle_components`, `agency_settings`.

**8 views:** `godown_stock`, `customer_product_balances`, `customer_balances`,
`activity_feed`, `daily_product_summary`, `daily_purchase_summary`,
`daily_money_summary`, `monthly_product_summary`.

The two existing migration files (`v3-segments-migration.sql`, `2026-07-ui-redesign.sql`)
are additive layers on a pre-existing base schema. Some views are defined twice across
them. The canonical `schema.sql` collapses all of that into one final-state file.

## Design

### 1. Uniform audit columns

Target: every table has `id`, `created_at`, `created_by`, `updated_at`, `updated_by`.

Current gaps to close:

| Table | Has | Add |
|---|---|---|
| `transactions` | id, created_at, created_by, updated_at, updated_by | — (complete) |
| `purchases` | id, created_at, created_by, updated_at, updated_by | — (complete) |
| `products` | id, created_at | created_by, updated_at, updated_by |
| `customers` | id, created_at | created_by, updated_at, updated_by |
| `profiles` | id (uuid = auth user) | created_at, created_by, updated_at, updated_by |
| `bundle_components` | id | created_at, created_by, updated_at, updated_by |
| `agency_settings` | id (boolean single-row guard), updated_at | created_at, created_by, updated_by |

Column conventions:
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid` (nullable — historical rows and SQL-editor writes have no user)
- `updated_by uuid` (nullable)

Existing rows backfill automatically: `created_at`/`updated_at` default to `now()` at the
moment the column is added; `created_by`/`updated_by` stay `NULL` (we cannot know who
created historical rows).

### 2. `id` columns — unchanged

- `bigserial` PKs: `products`, `customers`, `transactions`, `purchases`, `bundle_components`
- `uuid` PK: `profiles` (equals the Supabase auth user id)
- `agency_settings`: boolean single-row guard (`id boolean primary key default true`,
  unique) — a deliberate "only one settings row" pattern. **Kept as-is**; documented in
  `schema.sql` with a comment explaining why.

No primary-key type changes anywhere (zero FK-migration risk on live data).

### 3. One shared audit trigger

Replaces the current `touch_updated_at` trigger/function (which only touched
`transactions` and `purchases`, and only set `updated_at`).

```sql
create or replace function public.stamp_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    new.updated_at := now();
    if new.updated_by is null then new.updated_by := auth.uid(); end if;
  else  -- UPDATE
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;
```

Attached `before insert or update` to all 7 tables.

**Critical nuance — `created_at` is never overwritten on UPDATE.** The app deliberately
uses `created_at` as the user-editable *business date* of a sale/return (Log Return lets
you backdate). The trigger only ever sets `updated_at`/`updated_by` on update, leaving
`created_at` under app control. It also only fills `created_by`/`updated_by` when the app
did not already supply them, so existing insert/update payloads keep working unchanged.

### 4. Views — drop one, keep the rest

Verified against actual code usage:

| View | Read by | Verdict |
|---|---|---|
| `godown_stock` | every stock/home screen | keep |
| `customer_product_balances` | customer detail, returns | keep |
| `customer_balances` | customer list (money owed) | keep |
| `activity_feed` | activity feed | keep |
| `daily_product_summary` | commercial Home | keep |
| `daily_purchase_summary` | commercial Home | keep |
| `daily_money_summary` | commercial Home | keep |
| `monthly_product_summary` | **nothing** | **DROP** |

The three `daily_*` views have different grains (money-per-day vs product-per-day) and
each powers the commercial Home dashboard; merging them would make queries uglier, not
cleaner. They stay separate. Adding audit columns to base tables does **not** affect any
view (views select explicit columns), so no view needs recreating except the dropped one.

### 5. App cleanup

- Delete `src/hooks/useDomesticDailySummary.ts` — defined but imported by nothing.
- Update `src/types/db.ts` so `Product`, `Customer`, `Profile`, and (if modeled)
  `bundle_components`/`AgencySettings` reflect the new audit columns. Low priority /
  cosmetic — the app does not currently read these fields — but keeps types honest.

## Deliverables

### `db/schema.sql` — canonical, fresh-build

The whole final schema in one file, safe to run on an empty database:

1. All 7 tables (`create table if not exists`), each with the full audit column set,
   real FKs/constraints, and the `agency_settings` single-row comment.
2. `stamp_audit()` function + triggers on all 7 tables.
3. RLS policies (products, bundle_components, and any others currently enforced).
4. All 7 live views (everything above except `monthly_product_summary`).
5. Domestic catalogue + combo seed (idempotent — guarded by `where not exists`).

**Ground-truth requirement:** the base-table column lists in this repo are reconstructed
from `src/types/db.ts` + the two migration files, which may omit exact
constraints/defaults/RLS present in the live DB. Before treating `schema.sql` as
authoritative, verify it against a real schema export (Supabase Dashboard → Database, or
`pg_dump --schema-only`). The canonical file must match the live schema exactly.

### `db/2026-07-clean-audit.sql` — additive migration for the live DB

Purely additive, no data loss, run once in the Supabase SQL editor:

1. `add column if not exists` the missing audit columns on `profiles`, `products`,
   `customers`, `bundle_components`, `agency_settings`.
2. `create or replace function public.stamp_audit()`.
3. Drop the old `touch_updated_at` triggers on `transactions`/`purchases` and the
   `touch_updated_at()` function; create `stamp_audit` triggers on all 7 tables.
4. `drop view if exists public.monthly_product_summary;`.

No table dropped, no row touched, no view recreated (beyond the drop).

## Testing / verification

- `npm run build` and `npm run test` stay green (app cleanup only removes a dead file and
  optionally widens types).
- Migration is verified by applying it to a throwaway/staging Supabase project (or by
  reading the generated SQL and confirming every statement is `if exists`/`if not exists`
  guarded and additive) before the user runs it on production.
- Post-migration spot check: insert a row via the app on each table and confirm
  `created_by`/`updated_at`/`updated_by` populate; edit a transaction's date and confirm
  `created_at` is preserved while `updated_at`/`updated_by` advance.

## Risks

- **Schema drift in `schema.sql`.** Mitigated by the ground-truth verification step above.
- **`auth.uid()` in triggers.** Returns the JWT user for authenticated app calls, `NULL`
  for SQL-editor/service-role writes — acceptable and expected.
- **User runs the migration, not the assistant.** The assistant cannot touch the
  production DB; the migration file is handed over for the user to run.
