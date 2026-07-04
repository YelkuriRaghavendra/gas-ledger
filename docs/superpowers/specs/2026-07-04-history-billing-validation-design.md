# Customer History Redesign, Sale Payment Option, and Form Validations

Date: 2026-07-04

## Purpose

Three related improvements to the already-shipped app, requested after live use:

1. The Customer Detail history list is accurate to the prototype but not as useful as it could be for actually reconciling an account — add day-grouping and a running balance.
2. Recording a sale currently always adds to the customer's due amount, requiring a separate Record Payment step even when the customer paid on the spot. Add a "received now" option to New Sale.
3. Several forms accept values that don't make business sense (returning more empties than are outstanding, overpaying, invalid phone numbers). Add validation.

This spec builds on the existing app (React + TypeScript + Vite + Supabase) and does not change the backend schema.

## 1. Customer Detail history: grouped by day + running balance

**Scope:** `src/pages/CustomerDetail.tsx` only. The global Activity feed (`src/pages/ActivityFeed.tsx`) and Home's "Recent activity" (`src/pages/Home.tsx`) span multiple customers, so a per-customer running balance doesn't apply there — they are unchanged.

**Running balance computation:** `useTransactions(customerId)` returns transactions ordered newest-first. To compute a running balance, reverse to chronological (oldest-first) order, walk forward accumulating:
- `type === 'sale'` → running total increases by `amount`
- `type === 'payment'` → running total decreases by `amount`
- `type === 'return'` → running total unchanged (returns affect empties, not amount due)

Each transaction is annotated with the running total *after* it occurred. The annotated list is then reversed back to newest-first for display, preserving the existing visual order.

**Day grouping:** Entries are bucketed by calendar day using the same day boundaries as `formatRelativeDate` (Today / Yesterday / older). Each group renders a header (day label) followed by a one-line digest summarizing that day's activity: counts of sales and returns, and total amount collected via payments that day (omitted if zero). Example: "2 sales · 1 return · ₹8,200 collected".

**Row content:** Unchanged from the current design (icon badge, title, subtitle, amount) plus one new line: "Balance: {formatCurrency(balanceAfter)}" in the muted secondary-text style already used elsewhere.

## 2. New Sale: Received now vs. On credit

**UI:** A two-option segmented toggle added to the New Sale form, below the existing fields and above the Sale total summary box. Options: **On credit** (default, selected) and **Received now**. Visually matches the app's existing button/pill language (rounded, accent color when selected).

**Behavior on submit:**
- **On credit** (current behavior, unchanged): insert one `sale` transaction for the full amount.
- **Received now**: insert both a `sale` transaction and a `payment` transaction (same `amount`, same `customer_id`, same `created_by`) in a single `supabase.from('transactions').insert([saleRow, paymentRow])` call. Passing both rows to one `insert()` call sends a single SQL statement, so this is atomic — either both transactions are recorded or neither is; there is no scenario where a "received now" sale is recorded without its matching payment.

This does not require a schema change — both rows use the existing `transactions` table exactly as today, just two rows instead of one.

## 3. Validations

All validation errors use the existing pattern already present in every form: a single red-text message rendered below the fields on submit failure, no new UI component introduced.

| Screen | New rule |
|---|---|
| New Sale | `empties taken` (state `empties`) cannot exceed `qty` (cylinders sold in this same sale). Error: "Empties taken can't exceed cylinders sold." |
| Log Return | `qty` (empties returned) cannot exceed the customer's current `empties_outstanding`. Error: "Can't return more than the N empties outstanding." |
| Record Payment | `amount` cannot exceed the customer's current `amount_due`. Error: "Amount can't exceed the ₹N currently due." (The existing "Pay full" button is unaffected — it already sets the exact due amount.) |
| Add Customer / Customer edit (Customer Detail) / Business Details | `name`/`business_name` required (already enforced via HTML `required` on Add Customer and Customer edit; add the same to Business Details). Phone, if non-empty, must pass a shared `isValidPhone` check (10 digits, optionally prefixed with country code `91`). Error: "Enter a valid 10-digit phone number." |
| Cylinder Pricing | Price must be strictly greater than zero to save (previously only blocked negative values). Error: "Price must be greater than zero." |

**Shared validator:** `src/utils/validation.ts` exports `isValidPhone(phone: string): boolean`, stripping non-digit characters and checking for a 10-digit number (or 12 digits starting with `91`). Used by Add Customer, Customer Detail's edit form, and Business Details — one implementation, no duplication.

**Out of scope:** duplicate-phone-number detection across customers (would require an extra query per keystroke or per submit; not requested and adds meaningful complexity for a single-agency tool where staff know their customer list).

## Testing approach

Consistent with the rest of the app: manual verification against the live Supabase project, since there is no automated test suite in scope. Specific checks:
- Running balance matches manual arithmetic across a mixed sequence of sales/returns/payments for one customer.
- Day grouping and digest line show correct counts/totals for a day with multiple transaction types.
- "Received now" sale results in `amount_due` unchanged (net zero) for that customer, and both a sale and payment row appear in history.
- Each new validation rule blocks the invalid case and allows the valid boundary case (e.g. returning exactly the outstanding amount succeeds; returning one more than that fails).

## Out of scope

- Changing the global Activity feed or Home's recent-activity snippet (no running balance there, per the scoping decision above).
- Duplicate phone number detection.
- Editing/undoing a "received now" sale as a single unit (deleting requires removing both the sale and payment rows manually, same as any other transaction deletion today — no new bulk-delete behavior is introduced).
