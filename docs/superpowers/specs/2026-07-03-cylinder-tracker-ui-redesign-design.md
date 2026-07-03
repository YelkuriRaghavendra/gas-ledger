# Cylinder Tracker — UI/UX Redesign Spec

Date: 2026-07-03

## Purpose

The initial build (see [2026-07-03-cylinder-tracker-design.md](2026-07-03-cylinder-tracker-design.md)) implemented the prototype's *functional* scope but not its actual visual design — the original prototype HTML (`~/Downloads/Cylinder Tracker.html`) was never rendered before that build started, so the shipped UI diverged significantly from what the prototype actually looks like. This spec closes that gap: rebuild the presentation layer to match the prototype's real design and interaction patterns, on top of the existing (already working, already reviewed) Supabase backend.

This is a UI/UX rework, not a backend rework. `customers`, `transactions`, `profiles`, RLS policies, and the auth *mechanism* (Supabase email/password) all stay as they are.

## Decisions from stakeholder review

- **Auth stays email/password** — the prototype uses phone+PIN, but that requires either misusing Supabase's password auth (phone number as a fake email) or building custom auth. Not worth it; keep email/password, which is simpler and already working.
- **Add "Remember me"** to login, since it wasn't in the original build.
- **Branding is generic/configurable** — the prototype hardcodes "Balaji Gas Agency" / "Suresh Reddy" as demo data. The rebuilt app must not hardcode these; agency name and owner name come from real data (`agency_settings.business_name`, `profiles.name`), defaulting to something generic until configured.
- **All 3 Account sub-features ship now**: Business details, Cylinder pricing, Export ledger — not deferred.
- **Single cylinder type/price only** — matching the prototype's single "19 kg cylinders" product line. No multi-size/multi-price support.

## New data: `agency_settings`

A singleton settings table (the boolean-primary-key-with-check pattern guarantees exactly one row):

```sql
create table agency_settings (
  id boolean primary key default true check (id),
  business_name text not null default '',
  business_phone text,
  business_address text,
  price_per_cylinder numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into agency_settings (id) values (true);

alter table agency_settings enable row level security;

create policy "read agency settings" on agency_settings
  for select to authenticated using (true);

create policy "owner update agency settings" on agency_settings
  for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
```

Read access for all authenticated users because staff need `price_per_cylinder` to prefill the Sale form. Update restricted to owner, same pattern as `customers`/`transactions`.

## New UI primitives

Shared components used across the redesigned screens, so styling lives in one place per pattern rather than being copy-pasted per screen:

- **`Avatar`** — a rounded-square badge showing a customer's (or user's) initials, background color chosen deterministically from the name (hash the string to pick from a small fixed palette) so the same name always gets the same color.
- **`StatusPill`** — a small rounded badge: orange/red for "N owed" (empties outstanding > 0), green for "Settled" (0 outstanding).
- **`Stepper`** — a `− [value] +` control replacing raw `<input type="number">` in the Sale/Return/Payment forms, matching the prototype exactly.
- **`HeroCard`** — the dark (`bg-ink`) card style used for the Home dashboard's stat block and the Customer Detail balance/equation block.
- **`BottomSheet`** — a sheet that slides up from the bottom, used for the FAB's "Quick add" menu.

## Auth changes

**Remember me:** Supabase's JS client persists sessions via a pluggable `storage` adapter (defaults to `localStorage`). To make "remember me" a real per-login choice rather than a fixed global setting, `src/lib/supabase.ts` gets a custom storage adapter:

```ts
const rememberKey = 'cylinder-tracker-remember'

const conditionalStorage = {
  getItem: (key: string) =>
    localStorage.getItem(key) ?? sessionStorage.getItem(key),
  setItem: (key: string, value: string) => {
    const remember = localStorage.getItem(rememberKey) === 'true'
    ;(remember ? localStorage : sessionStorage).setItem(key, value)
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}
```

The Login screen writes `localStorage.setItem('cylinder-tracker-remember', String(checked))` before calling `signIn`, based on the "Remember me" checkbox. Checked → session survives browser restarts (localStorage). Unchecked → session is cleared when the browser/tab closes (sessionStorage), though it still survives a same-tab page refresh (sessionStorage persists across refresh by design — only closing the tab/browser clears it).

## Screens

### Login
Restyled to match the prototype's layout: icon badge, heading (defaults to a generic app name, not a hardcoded agency name, until `agency_settings.business_name` is set), email + password fields, a **Remember me** checkbox, Sign in button, matching color/spacing language.

### Home
Replaces the plain white stat cards with:
- A `HeroCard` showing "Amount to collect" (large, from `customer_balances` totals), "outstanding from N customers", and a Sold / Returned / Empties-out row.
- "New sale" (filled) and "Log return" (outlined) quick-action buttons.
- A "Recent activity" section (last ~8 entries from `activity_feed`) with a "See all" link to the Activity tab.

### Customers
List rows get an `Avatar`, a `StatusPill` ("N owed" / "Settled"), and the due amount. Header shows an aggregate line ("N accounts · M empties outstanding").

### Customer Detail
Header gets an `Avatar`. Below the name/phone, two quick-action buttons: **Call** (`tel:` link) and **Address** (opens a maps URL, only shown if an address is set). The balance section becomes a `HeroCard` "equation" layout: `Sold − Returned = Empties` with amount due below a divider. Sale/Return/Payment buttons keep their semantic colors (orange/green/blue). History rows get a type icon.

### New Sale / Log Return / Record Payment
- Numeric fields become `Stepper` controls.
- New Sale: "Price each" prefills from `agency_settings.price_per_cylinder` (editable per-sale), with a live-computed "Sale total" and "New empties owed" preview.
- Log Return: shows "Currently owed" and a live "Remaining after return" preview.
- Record Payment: shows "Currently due", a **Pay full** button that fills the amount field with the outstanding balance, and a live "Balance after payment" preview.
- When reached via a specific customer's page, the customer field is fixed. When reached via the FAB (no customer context), it becomes a searchable picker over existing customers.

### Activity Feed
Same data source as before; rows get a type icon consistent with the History list on Customer Detail.

### Account (new)
Profile card (`Avatar`, `profiles.name`, `agency_settings.business_name · role`), then three navigation rows — Business details, Cylinder pricing, Export ledger — and a Sign out button.

### Business details (new)
Owner-only form editing `agency_settings.business_name`, `business_phone`, `business_address`. Staff can view but not submit changes (RLS blocks the update regardless).

### Cylinder pricing (new)
Owner-only form editing `agency_settings.price_per_cylinder`.

### Export ledger (new)
A button that fetches all transactions joined with customer name (reusing the `activity_feed` view, unpaged) and generates a CSV client-side (`Blob` + a temporary `<a download>` link) — no backend export endpoint needed.

### Bottom navigation
Becomes 5 slots: Home, Customers, a center **FAB**, Activity, Account. The FAB opens a `BottomSheet` ("Quick add") listing New sale / Log return / Record payment / Add customer, each navigating to the corresponding screen without a preset customer (so New Sale/Return/Payment show the customer picker in this path).

## Error handling

Unchanged from the original spec: loading/empty/error states per screen, failed writes surfaced rather than silently discarded. The new owner-only forms (Business details, Cylinder pricing) follow the same pattern already used in Customer Detail — check `error` after every mutation, show it, don't assume success.

## Testing approach

Unchanged: manual verification against the live Supabase project. Additional checks specific to this rework:
- Cylinder pricing: a staff account cannot save changes (RLS-blocked), an owner account can, and the saved price appears as the New Sale form's prefill for both roles.
- Remember me: log in with it checked, close and reopen the browser, confirm still logged in; log in unchecked, close and reopen, confirm logged out.
- Export ledger produces a valid CSV that opens correctly and contains all existing transactions.

## Out of scope

- Multiple cylinder sizes/pricing tiers.
- Phone+PIN authentication.
- Server-side/scheduled export (client-side CSV only).
- Redesigning the underlying data model beyond the one new `agency_settings` table.
