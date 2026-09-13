# WhatsApp Bill Notifications

**Date:** 2026-09-13
**Implementation branch:** to be cut from `main` (this spec was written from
`feat/activity-redesign-month-summary`, which is unrelated to this work).
**Status:** Design approved in brainstorming; awaiting spec review before implementation planning.

## Goal

When a commercial bill is saved, automatically send the customer a WhatsApp message
summarising it — no extra tap, no manual share. Replaces the current manual
`wa.me` deep-link flow for bills (the statement share in `StatementDialog.tsx` is
unchanged and stays as-is).

Uses the **Meta WhatsApp Cloud API directly** — no BSP, no Twilio. Sending happens in a
Supabase Edge Function so the API token never reaches the browser.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Trigger | Automatic on bill save. No confirmation tap. |
| Content | Text only. No PDF attachment in this phase. |
| Tracking | Record send result per bill, with retry. No delivery webhook. |
| Bill types | `sale`, `payment`, `return`. Not `opening`. |
| Opt-in | Per-customer flag, **default off**. Nothing sends until explicitly enabled. |

## Scope boundary: commercial only

Domestic bills insert with `customer_id: null` (`DomesticNewBill.tsx`,
`DomesticLogReturn.tsx`) — they are walk-in counter sales with no customer record and
therefore no phone number. Domestic is excluded structurally, not by preference. The
`no_customer` guard in the function covers it should a domestic path ever gain a customer.

Three call sites are wired:

- `src/pages/NewSale.tsx` — sale
- `src/pages/RecordPayment.tsx` — payment
- `src/pages/LogReturn.tsx` — return

Note on return bills: `LogReturn.tsx` writes the returned cylinder count into
`bill_lines.qty` with `empties` left at `0`, matching how `customer_product_balances`
computes `returned` (`sum(qty) where type = 'return'`). The `bill_return` template
therefore reads `qty`, not `empties`.

Note on `RecordPayment.tsx`: it currently discards the result of `insertBillWithRetry`.
The returned row id must be captured to pass as `bill_id`.

## Architecture

```
NewSale / RecordPayment / LogReturn
   └─ bill + bill_lines saved                  (existing code, unchanged)
        └─ sendBillWhatsApp(billId)            (fire-and-record, non-blocking)
             └─ Edge Function: send-bill-whatsapp
                  ├─ verify caller's Supabase JWT
                  ├─ load bill + bill_lines + customer server-side
                  ├─ evaluate guards
                  ├─ build template params
                  ├─ POST graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages
                  └─ insert row into whatsapp_sends
```

Two load-bearing properties:

**The function trusts nothing from the client but `bill_id`.** Message content is
derived from rows read server-side. If the client supplied the phone number or the
message body, anyone with a browser console could send arbitrary text to arbitrary
numbers from the business's WhatsApp number.

**The send never blocks the save.** Bill persistence and message delivery are separate
outcomes. Navigation proceeds regardless of what Meta returns; a Meta outage must not
prevent recording a sale.

## Database changes

```sql
-- migration 011_whatsapp_sends.sql

alter table customers
  add column whatsapp_enabled boolean not null default false;

create table whatsapp_sends (
  id         bigint generated always as identity primary key,
  bill_id    bigint not null references bills(id) on delete cascade,
  status     text   not null check (status in ('sent','failed','skipped')),
  reason     text,
  message_id text,
  template   text   not null,
  created_at timestamptz not null default now()
);

create index whatsapp_sends_bill_id_idx on whatsapp_sends (bill_id);
```

One row per **attempt**, not per bill. A retry appends a row, preserving the history of
what failed and why. The UI reads the most recent row per bill.

`reason` values: `no_customer`, `no_phone`, `invalid_phone`, `disabled`,
`not_applicable`, or the verbatim error text returned by Meta.

RLS on `whatsapp_sends`, matching the existing convention (`read` to authenticated with
`using (true)`, writes restricted):

```sql
alter table whatsapp_sends enable row level security;

create policy "read whatsapp_sends" on whatsapp_sends
  for select to authenticated using (true);
```

No insert policy for `authenticated`. Rows are written only by the Edge Function, which
uses the service role key and bypasses RLS. This is deliberate: a client able to insert
`whatsapp_sends` rows could fake a `sent` status for a bill that was never delivered.

**Toggling `whatsapp_enabled` requires the owner role.** There is no `owner update
customers` RLS policy — `customers_write` allows any authenticated user to update any
customer column. The restriction is enforced instead by a trigger,
`trg_whatsapp_enabled_owner_only` (migration `013_whatsapp_enabled_owner_only.sql`,
folded into `db/schema.sql`), fired `before insert or update on customers`. It compares
`old.whatsapp_enabled` to `new.whatsapp_enabled` and raises unless the caller is an owner,
but only when that flag is actually changing — every other column on an already-enabled
customer (phone, address, name, …) stays staff-editable, which a blanket RLS `with check`
on the flag could not do without also blocking those ordinary edits. Staff accounts can see
the toggle state but cannot change it. If staff need to enable customers, that trigger must
be relaxed deliberately — which is a separate decision, not an incidental part of this
change.

## Opt-in UI

Because `whatsapp_enabled` defaults to `false`, the feature is inert until customers are
switched on. Required surfaces:

- **`AddCustomer.tsx`** — toggle on the new-customer form, default off.
- **`CustomerDetail.tsx`** — toggle, showing current state.
- **`Customers.tsx`** — bulk enable, so existing customers can be switched on without
  visiting hundreds of records individually.

This also gives a safe rollout: enable one customer (the owner's own record), confirm
real bills arrive, then bulk-enable the rest.

## Phone normalization

`customers.phone` is free text. Meta requires E.164 digits with no `+` and no separators.

`src/utils/phone.ts`:

```ts
normalizeIndianPhone(raw: string | null): string | null
```

- Strip every non-digit character.
- 10 digits → prepend `91`.
- 12 digits already starting `91` → use as-is.
- Anything else → `null`, producing `invalid_phone`.

The stored value is never rewritten; normalization happens at send time only, so existing
records and the dialer links that use them are untouched.

## Edge Function: `send-bill-whatsapp`

First Edge Function in this repo; establishes `supabase/functions/`.

**Input:** `{ bill_id: number }`

**Sequence:**

1. Verify the caller's Supabase JWT. Reject unauthenticated callers.
2. Load `bills` row, its `bill_lines`, and the related `customers` row.
3. Evaluate guards in order. Each writes a `skipped` row and returns:
   - `bill.type = 'opening'` → `not_applicable`
   - `customer_id is null` → `no_customer`
   - `whatsapp_enabled = false` → `disabled`
   - phone null → `no_phone`; unnormalizable → `invalid_phone`
4. Select template by `bill.type` and build parameters.
5. `POST` to Meta with a 15-second timeout.
6. Insert the `whatsapp_sends` row: `sent` with the returned `wamid`, or `failed` with
   Meta's error text.
7. Return the row to the caller.

**Secrets** (set via `supabase secrets set`, never committed, never in the bundle):

```
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_TOKEN
```

The token is the single most sensitive value in this design. It grants authority to
message customers as the business until revoked. It must not appear in the client
bundle, in git, or in logs — the function logs Meta's error text but never the request
headers.

## Templates

Three, **Utility** category, submitted once in WhatsApp Manager. Utility wording only —
any promotional phrasing gets the template reclassified as Marketing at roughly 7.5× the
per-message cost.

```
bill_sale
Namaste {{1}}, bill {{2}} dated {{3}}.
Items: {{4}}
Amount: Rs {{5}}
Balance due: Rs {{6}}
```

```
bill_payment
Namaste {{1}}, payment of Rs {{2}} received on {{3}} via {{4}}.
Balance due: Rs {{5}}
```

```
bill_return
Namaste {{1}}, return recorded on {{2}}.
Returned: {{3}}
Empties outstanding: {{4}}
```

Balance comes from the existing `customer_balances` view (`amount_due`) so the figure
matches what the app already displays. Empties outstanding comes from
`customer_product_balances`.

**Parameter formats**, fixed so the function and the approved templates cannot drift:

| Placeholder | Format | Example |
|---|---|---|
| Customer name | `customers.name` verbatim | `Ramesh Traders` |
| Bill number | `bills.bill_number` verbatim | `S-1042` |
| Date | `DD-MM-YYYY`, from `bills.created_at` in IST | `13-09-2026` |
| Items (`bill_sale`) | `qty × product name`, comma-separated, single line | `2 × 19kg Commercial, 1 × 5kg` |
| Returned (`bill_return`) | same shape, using `bill_lines.qty` | `3 × 19kg Commercial` |
| Amounts | integer rupees, no decimals, no thousands separator | `4300` |
| Method | `bills.method` title-cased | `Cash`, `Upi`, `Vitran` |

WhatsApp template parameters cannot contain newlines or tabs, so the items list stays on
one line. Meta rejects the message outright if a parameter contains a newline — this is a
hard constraint, not a style preference.

## Status display

The latest `whatsapp_sends` row per bill, surfaced on the bill row in `CustomerDetail.tsx`:

| Status | Shown | Action |
|---|---|---|
| `sent` | ✓ Sent on WhatsApp | — |
| `failed` | ⚠ Not sent — *reason* | **Retry** |
| `skipped` / `disabled` | WhatsApp off for this customer | **Turn on** |
| `skipped` / `no_phone` | No phone number | **Add phone** |
| `skipped` / other | nothing shown | — |
| no row | nothing shown | — |

Retry re-invokes the function with the same `bill_id` and appends a new row.

## Testing

**Unit (vitest, existing setup):**

- `normalizeIndianPhone` — 10-digit, `+91` prefixed, spaced, hyphenated, landline,
  empty, null, and junk input.
- Template parameter building per bill type, including multi-line item summaries and
  zero balances.

**Function guards:** invoke against crafted bills — opening type, null customer,
disabled customer, null phone, unnormalizable phone — asserting the `whatsapp_sends` row
written in each case.

**End to end:** the owner's phone whitelisted on the Meta test number. Only whitelisted
numbers can receive anything from the test number, so no real customer can be messaged
during development.

## Operational limits

- **Test number:** 5 whitelisted recipients, free, no billing required.
- **Production, unverified business:** 1 phone number, 250 unique customers per 24
  hours. The cap counts distinct customers, not messages — 300 bills across 200
  customers is within it.
- **Cost:** Utility category, India, ₹0.1150 per message at time of writing. Roughly
  ₹35/month at 300 bills.
- From 2026-10-01 Meta begins charging for utility and service messages sent inside an
  open 24-hour window, which were previously free. Bills are sent outside any window and
  were always billable; the change affects replies, not this flow.

## Out of scope

- PDF attachment on the message (possible second phase).
- Delivery/read status via Meta webhook — requires a public endpoint and HMAC signature
  verification, and `delivered` rarely changes what the business would do.
- Domestic segment (no customer records).
- Inbound customer replies.
- The statement share in `StatementDialog.tsx`, which keeps its existing `wa.me` flow.

## Prerequisites before production

Phase A (Meta app, test number, test message) is complete. Remaining, all outside the
codebase:

1. Real phone number added to the WABA, verified. Must not be active on WhatsApp or the
   WhatsApp Business app.
2. Three templates submitted and approved.
3. Permanent System User token generated with `whatsapp_business_messaging` and
   `whatsapp_business_management`, stored in Supabase secrets.
4. Payment method added in WhatsApp Manager.

Development proceeds against the test number and blocks on none of these.
