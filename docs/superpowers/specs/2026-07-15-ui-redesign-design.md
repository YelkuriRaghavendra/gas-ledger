# Cylinder Tracker — Full UI Redesign

**Date:** 2026-07-15
**Branch:** `3.0-domestic`
**Status:** Design approved via visual brainstorming; ready for implementation planning.

## Goal

Redesign the entire app UI from scratch while keeping the **existing color palette and
fonts**. Alongside the visual overhaul, apply structural cleanup (remove duplicate/unused
navigation), add missing business fields, surface stock on Home, simplify counter billing, and
fix a data bug where supplier purchases never appear in the activity feed.

This is a **presentation-layer + light schema** change. Core business logic (sales, returns,
payments, purchases, combos, godown arithmetic, segment access) is unchanged except where
explicitly noted (activity feed, agency settings, timestamps, domestic payment).

## Design system (unchanged tokens)

Reuse `tailwind.config.js` as-is:

- **Colors:** `cream #F4EFE6`, `surface #FFFFFF`, `ink #1F1813`, commercial accent
  `#E4571B` / `accentSoft #F26B2C`, domestic green `#2E8B57`, plus `muted`, `subtle`,
  `borderMuted`.
- **Fonts:** `Manrope` (body/`font-sans`), `Space Grotesk` (display/`font-display`).
- **Elevation:** `shadow-card` for white cards, gradient hero cards, radii 16–24px.
- **Visual direction:** "Warm & refined" — soft layered white cards, dark/green gradient hero
  cards, large Space Grotesk numerals, generous rounding.
- **Detail popups are centered dialogs** (dimmed backdrop, `✕` to close) — NOT bottom sheets.
  The account menu remains a bottom sheet.

## Navigation & shell architecture

### AppHeader (new, shared, every in-app screen)

- **Left:** business logo tile (accent gradient in Commercial, green gradient in Domestic,
  showing business initials) + business name + subline `"Commercial · Owner"` /
  `"Domestic · Owner"`.
- **Right:**
  - **Mode-switch button** — a single **`⇄` icon** (symbol only) in a tinted square: green tint
    in Commercial (→ Domestic), orange tint in Domestic (→ Commercial). Rendered **only** for
    owners with `segment_access === 'both'`. Reuses the existing `/choose` mode-switch flow.
  - **Account avatar** — the user's initials (e.g. "RK"). Opens the **Account menu**.

Detail/sub-screens (e.g. Customer Detail, New bill) use a lighter top bar: a back control +
screen title + contextual actions, instead of the full AppHeader.

### Account menu (bottom sheet, replaces the Account tab)

Opened from the header avatar. Identical on both sides: profile header (initials, name,
`"<business> · <role>"`), then **Business details · Products & pricing · Export ledger ·
Sign out** (destructive). Removes the standalone Account tab and `Account.tsx`. The old
Purchases/Godown links do not appear here.

### Bottom navigation

Three tabs + a **centered, elevated `＋` FAB** (2 tabs each side). Identical structure on both
sides; only the 2nd tab differs.

| Side | Tab 1 | Tab 2 | Center FAB | Tab 3 | Tab 4 |
|------|-------|-------|-----------|-------|-------|
| **Commercial** | Home | Customers | ＋ (Sell / Return / Pay) | Purchases | Activity |
| **Domestic** | Home | Stock | ＋ (New bill) | Purchases | History |

- Commercial `＋` opens the QuickAdd sheet (Sale / Return / Payment). **Context-aware:** on a
  Customer Detail page, the `＋` opens those actions already scoped to that customer.
- Domestic `＋` goes to New bill.
- Active tab uses the side's accent; inactive `#B0A594`.

## Screen designs

### Home — Commercial

- AppHeader.
- **Hero** (dark gradient): `Outstanding dues` headline + **Empties out** and **Sold today**
  (the "Collected" stat is removed).
- **Cylinders card**: 2-col grid per cylinder product — dark product tag, large accent number =
  *empties with customers*, divider, **full** (ink) / **empty** (green). Header links to
  `Godown ›`.
- **Recent activity**: latest ~3 entries **including purchases** (bug fix), `See all ›` →
  Activity.

### Home — Domestic

- AppHeader (green).
- **Hero** (green gradient): `Sales today` + `"<n> bills · <n> cylinders sold"`.
- The old New bill / Stock in quick-action buttons are **removed**.
- **Cylinders card** (full/empty); header `All stock ›` → Stock.
- **Today's bills** list; header `History ›` → History. (No payment-method text on rows.)

### New bill — Domestic (simplified, table format)

Fast counter billing. A **clean table**: columns **Item · Qty · Amount**, products grouped by
Cylinders / Accessories / Services.

- **Qty** set inline with `−` / `+`. **Amount** = rate × qty, auto-computed. Zero-qty rows are
  muted (`—`); active rows highlight.
- **Rate is a preset** shown under the item name (`₹925 each`) — **tap to edit** it for this
  bill only (optional; no permanent input box cluttering rows).
- **Empties auto-match 1:1** on cylinder rows, shown inline (`2 empties in`); adjustable.
- **No payment method** — the Cash/UPI selector is removed (domestic sales just save).
- A **Bill total** row closes the table; **Note** (optional) is visible; **Save bill** pinned at
  the bottom.
- Preserves the existing multi-item bill logic (one `bill_id`, empties, combos, date).

### Customers (Commercial)

- AppHeader, title, count chips (`N accounts`, `N empties out`).
- Search matches **name, location, or phone**.
- Each row: initials avatar, name, and a **location line** (`📍 area · phone`). Right side keeps
  the empties-out pill and `₹ due`.

### Customer Detail (Commercial)

- Top bar: back to Customers + `⋯` menu (Edit / Delete for owners).
- **Hero:** avatar, name, `📍 location · phone`.
- **Quick actions row:** **Call · Directions · Statement** (three buttons).
  - **Statement** opens an options dialog: pick a **period** (This month / Last month / All time
    / Custom date range) then an action — **Download PDF · Share on WhatsApp · Print · Share to
    other apps**. (Reuses the existing PDF generator; adds period filtering + share targets.)
- **Amount due** hero card + **Empties out** total.
- **The old Sale / Return / Payment button row is removed** — those are recorded via the
  context-aware nav `＋`.
- **By product** cards: empties owed + sold / returned per cylinder.
- **History** grouped by day with a digest line. Rows are **decluttered** — title · relative
  time · amount + running balance. The full breakdown (empties, paid method, who recorded it)
  lives in the tap popup, not the row.
- Tapping a history row opens the **centered detail popup** (see below).
- Edit-customer form and delete are retained (via the `⋯` menu).

### Activity (Commercial)

- AppHeader, title, feed rows for sale / return / payment **and purchase** (truck icon, orange).
- Tapping any row opens the **centered detail popup**.

### Domestic History

- Bills grouped by day with per-day totals. Tapping a bill opens the **centered detail popup**
  (line items, empties, total, timestamps) — no payment line.

### Detail popup (shared, centered dialog)

Opened by tapping an Activity row, a Customer-Detail history row, or a Domestic-History bill.
Contents:

- Header: type icon + label + counterparty (customer / supplier) + location where relevant.
- Amount, and a breakdown (product, qty, empties, payment status/method for commercial, note,
  balance-after for customer ledger, line items for domestic bills).
- **Created** and **Last updated** stamps — date, time, and who (see schema change).
- **Edit / Delete** actions (owner).

### Business details

Opened from the Account menu. Two grouped cards:

- **Identity:** Business name, Phone, **GST number** (new).
- **Address:** **Address line 1**, **Address line 2**, **City**, **Pincode** (all new; City +
  Pincode on one row).

### All other screens (full overhaul, same language)

Restyled with the shared components, no structural change to logic: `AddCustomer`, `NewSale`,
`LogReturn`, `RecordPayment`, `CylinderPricing`, `ExportLedger`, `Purchases`, `RecordPurchase`,
`Godown`, `SetCurrentStock`, `Login`, `ModeSelect`; domestic `DomesticStock`,
`DomesticPurchases`, `DomesticRecordPurchase`, `DomesticCombos`.

## Bug fix — purchases missing from Activity

**Root cause:** the `activity_feed` view (`supabase/migrations/006_products.sql`) is built only
from `transactions` with an inner `join customers`; the separate `purchases` table is never
referenced, so supplier purchases can never appear. `useActivityFeed` also filters
`.not('customer_id', 'is', null)`.

**Fix:**

1. Rewrite `activity_feed` as a **UNION** of customer transactions (`sale`/`return`/`payment`,
   with product name) and **purchases** (new `type = 'purchase'`, joined to `products` for name
   and **segment**, `customer_name` carrying a supplier/product label, no `customer_id`). Expose
   a `segment` column on every row.
2. `useActivityFeed`: drop the `customer_id is not null` filter and query `segment = 'commercial'`
   so commercial Activity shows commercial customer transactions **and** commercial purchases.
   Domestic sales stay out of this feed (they live in Domestic History).
3. UI: add a **purchase row variant** (truck icon, orange) to the feed and Home "Recent activity".
4. Types: `ActivityEntry.customer_id` nullable; add `'purchase'` to the type union; add optional
   `segment`.

## Schema changes (additive migrations, run in Supabase)

### agency_settings

- Add nullable columns: `address_line1 text`, `address_line2 text`, `city text`, `pincode text`,
  `gst_number text`.
- Backfill `address_line1` from existing `business_address`; keep `business_address` in place
  (unused) to avoid a destructive drop.
- Update `AgencySettings` type and the Business details form.

### Created / last-updated timestamps

- `transactions` and `purchases` already have `created_at`. Add **`updated_at timestamptz not
  null default now()`** to both, plus a trigger (or app-side `updated_at: now()` on every update)
  so edits bump it.
- Add `updated_by uuid` to both tables so the popup can show who last edited (the mockups show
  "Last updated … · <user>"). Set `updated_by` alongside `updated_at` on every edit.
- Surface `created_at` (+ `created_by`) and `updated_at` (+ `updated_by`) in the detail popups.
- Extend the `activity_feed` view and relevant hooks/types to carry `updated_at`.

### Domestic payment removal

- The domestic New bill no longer captures a payment method. Insert domestic sale rows with
  `method = null` (column stays for commercial use). Remove Cash/UPI from the New bill UI and
  the method text from domestic bill/History rows.

## Removals

- **Reports:** delete `src/pages/Reports.tsx`, route `/account/reports`, its Account link, and
  the now-unused hooks `useDailySummary`, `useMonthlySummary`, `useRevenueTrend`. Trim their
  orphaned interfaces from `types/db.ts`.
- **Account tab & page:** remove the bottom-nav Account tab and `src/pages/Account.tsx`;
  replaced by the header avatar → Account menu.
- **Godown as a nav tab:** reached from the Home Cylinders card instead.
- **Domestic Home quick-actions** (New bill / Stock in buttons).
- **Customer Detail Sale/Return/Payment button row** (moved to the context-aware nav `＋`).
- **Domestic payment method selector.**

## New / changed components

- `AppHeader` — shared top bar (logo, name, `⇄` switch, account avatar); theme-aware.
- `AccountMenu` — bottom sheet (reuse `BottomSheet`).
- `BottomNav` / `DomesticNav` — 3 tabs + centered elevated FAB; commercial FAB context-aware on
  customer pages.
- `CylindersCard` — shared Home stock card.
- `DetailModal` — centered dialog for activity / history / bill details (replaces the current
  `BottomSheet`-based transaction viewer).
- `StatementDialog` — statement period + share-target options.
- `NewBillTable` — the domestic billing table (preset tap-to-edit rate, inline empties, no
  payment).
- `ActivityRow` — extended with the `purchase` variant.
- Business details form — new fields.

## Non-goals

- No change to sale/return/payment/purchase/combo arithmetic.
- No change to auth or `segment_access` gating (switch reuses `/choose`).
- No new reporting/analytics (Reports removed, not replaced).

## Verification

Run the app (`npm run dev`) and drive both sides in the browser preview:

- Header `⇄` toggles Commercial ↔ Domestic for a `both` owner; hidden for single-segment staff.
- Avatar opens the Account menu; items route; Sign out works.
- Bottom nav: 3 tabs + centered FAB; FAB opens QuickAdd / New bill; on a customer page it scopes
  to that customer.
- Home shows the Cylinders card and Recent activity with a purchase row.
- Record a supplier purchase → appears in Activity and Home recent activity.
- New bill (domestic): add items via the table, edit a rate by tapping, empties auto-match, no
  payment step, save a multi-item bill.
- Tap an Activity row / customer history row / domestic bill → centered popup with Created +
  Last updated; Edit/Delete work.
- Customers list shows location; search matches location.
- Customer Detail: Call / Directions / Statement present; Statement dialog offers period + PDF /
  WhatsApp / Print / Share.
- Business details saves GST + line1/line2/city/pincode and reloads them.
- `/account/reports` no longer resolves; no dead links.
