# Cylinder Tracker — Design Spec

Date: 2026-07-03

## Purpose

Rebuild the "Cylinder Tracker" HTML prototype (`~/Downloads/Cylinder Tracker.html`) as a real, deployed app for a single gas-cylinder agency. The prototype is a static, in-memory mockup (login, home dashboard, customer list/detail, new sale, log return, record payment, activity feed) with no persistence or real backend. This spec defines the production build: same feature set, backed by a real database, deployed for free.

## Constraints

- Single tenant: one agency only. No multi-tenant/account logic needed.
- Must run on free hosting tiers that permit commercial use (this is a revenue-generating business tool).
- Team is small: an owner and one or more staff, sharing one or a few phones.
- Always-online assumption — no offline-first requirement.
- Money ledger — correctness of balances and protection against unauthorized edits/deletes matters more than feature breadth.

## Architecture

- **Frontend**: React + TypeScript, built with Vite as a static bundle.
- **Hosting**: Cloudflare Pages, deployed from a git repo (GitHub) with auto-deploy on push. Free tier permits commercial use; app also ships as an installable PWA (`vite-plugin-pwa`) so it behaves like a home-screen app on the shop phone(s).
- **Backend**: none — Supabase (Postgres + Auth) is the backend. The browser talks directly to Supabase via `@supabase/supabase-js`; Postgres Row Level Security (RLS) is the authorization layer, not an API tier.
- **Connectivity**: always-online. No local write queue. A lost-connection state shows a banner and disables write actions until the client is back online.

## Data model

```sql
customers (
  id, name, phone, address, created_at
)

transactions (
  id, customer_id, type ('sale' | 'return' | 'payment'),
  qty, empties, amount, note, created_by, created_at
)

profiles (
  id references auth.users, name, role ('owner' | 'staff')
)

view customer_balances (
  -- per customer: sold, returned, empties_outstanding, amount_due
  -- derived from transactions, as designed in the schema discussion
)
```

`transactions.created_by` records which logged-in user made each entry.

## Auth & roles

- Supabase Auth, email + password. One account per person (owner + each staff member).
- Accounts are created manually via the Supabase dashboard — there is no public signup screen in the app.
- Every user has a row in `profiles` carrying their `role`.
- RLS policies:
  - `SELECT` and `INSERT` on `customers` and `transactions`: any authenticated user.
  - `UPDATE` and `DELETE` on `customers` and `transactions`: only permitted when the requesting user's `profiles.role = 'owner'`.
- This is enforced in Postgres, not just hidden in the UI — a staff account cannot edit/delete even by calling the Supabase API directly.

## Screens (full parity with the prototype)

1. Login
2. Home (dashboard: totals, quick actions)
3. Customers (list, search)
4. Customer Detail (balance summary, transaction history)
5. New Sale (form)
6. Log Return (form)
7. Record Payment (form)
8. Activity Feed

Edit/delete controls render only for the owner role in the UI, backstopped by the RLS policies above regardless of what the client sends.

## Error handling

- Every data-fetching screen has loading / empty / error states.
- Failed writes (e.g. connection drops mid-submit) surface a retry prompt rather than silently discarding the entry.
- Client-side form validation before insert (e.g. quantity > 0, required fields).

## Testing approach

Given the app's size, manual verification against a real (dev) Supabase project is the primary testing method, not an automated suite. Before go-live, explicitly verify:

- A staff account cannot edit or delete a customer or transaction (via UI and by attempting the API call directly).
- An owner account can edit and delete.
- Balance math (`customer_balances` view) is correct across mixed sequences of sales, returns, and payments.

## Deployment

- Cloudflare Pages project connected to a GitHub repo; push to main auto-deploys.
- Supabase URL and anon key stored as Cloudflare Pages environment variables.
- Daily backup: a scheduled GitHub Action running `pg_dump` against the Supabase database, storing the dump in object storage (Supabase free tier has no automatic backups, and this is financial data).

## Out of scope for this build

- Offline support / write queueing.
- Multi-agency / multi-tenant support.
- SMS/phone-based auth (requires a paid SMS provider on Supabase).
- Automated test suite (may be revisited later if the app grows).
