import type { DomesticBill } from '../hooks/useDomesticSales'

// Count of New Connections sold = sum of qty across sale lines whose product
// is a flagged combo (products.is_new_connection). `import type` is erased at
// compile, so this pulls in no supabase runtime code.
export function countNewConnections(bills: DomesticBill[], ncProductIds: Set<number>): number {
  return bills.reduce(
    (sum, b) =>
      sum +
      b.lines.reduce(
        (s, l) => s + (l.product_id !== null && ncProductIds.has(l.product_id) ? l.qty : 0),
        0,
      ),
    0,
  )
}
