export type Role = 'owner' | 'staff'
export type Segment = 'commercial' | 'domestic'
export type SegmentAccess = Segment | 'both'

export interface Profile {
  id: string
  name: string
  role: Role
  segment_access: SegmentAccess
}

export type TransactionType = 'sale' | 'return' | 'payment'
export type PaymentMethod = 'cash' | 'upi'
export type ProductKind = 'cylinder' | 'accessory' | 'service'

export interface Product {
  id: number
  name: string
  price: number
  godown_capacity: number | null
  segment: Segment
  kind: ProductKind
  unit: string
  active: boolean
  sort_order: number
  created_at: string
}

export interface Customer {
  id: number
  name: string
  phone: string | null
  address: string | null
  starting_empties_owed: number
  starting_empties_product_id: number
  created_at: string
}

export interface Transaction {
  id: number
  customer_id: number | null
  type: TransactionType
  product_id: number | null
  qty: number
  empties: number
  amount: number
  paid: boolean
  method: PaymentMethod | null
  note: string | null
  bill_id: string | null
  created_by: string | null
  created_at: string
}

export interface CustomerBalance {
  id: number
  name: string
  phone: string | null
  address: string | null
  starting_empties_owed: number
  amount_due: number
}

export interface CustomerProductBalance {
  customer_id: number
  product_id: number
  product_name: string
  sold: number
  returned: number
  empties_outstanding: number
}

export interface Purchase {
  id: number
  product_id: number
  qty: number
  empties_given: number
  amount: number
  paid: boolean
  method: PaymentMethod | null
  note: string | null
  bill_id: string | null
  created_by: string | null
  created_at: string
}

export interface GodownStock {
  product_id: number
  product_name: string
  segment: Segment
  kind: ProductKind
  unit: string
  godown_capacity: number | null
  full_cylinders: number
  empty_cylinders: number
}

export interface ActivityEntry {
  id: number
  customer_id: number
  customer_name: string
  type: TransactionType
  product_id: number | null
  product_name: string | null
  qty: number
  empties: number
  amount: number
  note: string | null
  created_by: string | null
  created_at: string
}

export interface AgencySettings {
  id: boolean
  business_name: string
  business_phone: string | null
  business_address: string | null
  price_per_cylinder: number
  updated_at: string
}

// --- Phase 3: reporting & insights ---
// DailyPurchaseSummary/purchase figures below describe rows from a view that
// reads Phase 2's `purchases` table. Defined locally (not imported from a
// Phase 2 types module) since this worktree doesn't carry Phase 2's
// TypeScript types — only the SQL view may or may not exist at runtime. See
// useDailySummary/useMonthlySummary for how a missing view degrades gracefully.
export interface DailyProductSummary {
  day: string
  product_id: number
  product_name: string
  segment: Segment
  cylinders_sold: number
  revenue: number
  collected_at_sale: number
  empties_collected: number
}

export interface DailyMoneySummary {
  day: string
  payments_collected: number
}

export interface DailyPurchaseSummary {
  day: string
  product_id: number
  cylinders_purchased: number
  empties_given_to_supplier: number
  purchase_amount: number
}

export interface MonthlyProductSummary {
  month: string
  product_id: number
  product_name: string
  segment: Segment
  cylinders_sold: number
  revenue: number
  collected_at_sale: number
  empties_collected: number
}

export interface MonthlyMoneySummary {
  month: string
  payments_collected: number
}
