# All-Stock (Godown) Screen — Design

Date: 2026-07-18

## Goal
A single read-only screen showing full/empty cylinder stock for **both**
segments (commercial + domestic) at once. Reached from the `/choose` mode-select
screen so an owner can glance at all stock without entering a specific mode.

## Non-goals
No predictions, no per-segment totals, no editing. Existing per-mode Godown
(`/commercial/godown`) and DomesticStock screens are unchanged.

## Changes

### 1. Hook — `src/hooks/useGodownStock.ts`
Widen the param to `Segment | 'all'` (default `'commercial'`, unchanged). When
`'all'`, drop the `.eq('segment', …)` filter and order by `segment` then
`product_id`. All existing callers pass an explicit segment or rely on the
`'commercial'` default, so they are unaffected.

### 2. Page — `src/pages/AllStock.tsx` (new)
Read-only. Fetches `useGodownStock('all')`, splits rows by `segment` into two
groups rendered under small-caps headers **Commercial** and **Domestic**. Each
product is a card (reusing the Godown card layout minus prediction/set-stock):
product-name pill + **Full** (ready to sell) / **Empty** (to return). Negative
counts render red (existing convention). A group with no products shows the
standard "No products yet" empty card. Back link → `/choose`.

### 3. Route — `src/App.tsx`
`<Route path="/stock" element={<AllStock />} />`, inside the ModeGate wrapper.
ModeGate already lets non-`/commercial`/`/domestic` paths through for `'both'`
owners; `/stock` is a peer of `/account/*`.

### 4. Entry — `src/pages/ModeSelect.tsx`
A full-width subtle "View all stock →" link below the Commercial/Domestic
buttons, navigating to `/stock` without calling `setMode`.

## Verification
- `tsc` clean, existing tests pass.
- Manual: `/choose` → View all stock → both segments listed with full/empty.
