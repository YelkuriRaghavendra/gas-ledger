export type Role = 'owner' | 'staff'
export type Segment = 'commercial' | 'domestic'
export type SegmentAccess = Segment | 'both'

export interface Profile {
  id: string
  name: string
  role: Role
  segment_access: SegmentAccess
}

export type BillType = 'sale' | 'return' | 'payment' | 'opening'
export type PurchaseOrderType = 'purchase' | 'opening'
export type PaymentMethod = 'cash' | 'upi' | 'vitran'
export type ProductKind = 'cylinder' | 'accessory' | 'service'

export interface PriceOption {
  label: string
  amount: number
}

export interface Product {
  id: number
  name: string
  price: number
  gst_rate: number
  price_options: PriceOption[]
  segment: Segment
  kind: ProductKind
  unit: string
  active: boolean
  is_new_connection: boolean
  pending_delivery: boolean
  sort_order: number
  created_at: string
}

export interface Customer {
  id: number
  name: string
  phone: string | null
  address: string | null
  created_at: string
}

export interface Bill {
  id: number
  bill_number: string
  customer_id: number | null
  type: BillType
  total_amount: number
  paid: boolean
  method: PaymentMethod | null
  note: string | null
  surrender: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface BillLine {
  id: number
  bill_id: number
  product_id: number
  qty: number
  empties: number
  amount: number
  delivered: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface PurchaseOrder {
  id: number
  po_number: string
  type: PurchaseOrderType
  total_amount: number
  paid: boolean
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface PurchaseLine {
  id: number
  purchase_order_id: number
  product_id: number
  qty: number
  empties_given: number
  amount: number
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface CustomerBalance {
  id: number
  name: string
  phone: string | null
  address: string | null
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

export interface GodownStock {
  product_id: number
  product_name: string
  segment: Segment
  kind: ProductKind
  unit: string
  full_cylinders: number
  empty_cylinders: number
}

export interface ActivityEntry {
  id: number
  customer_id: number | null
  customer_name: string
  type: 'sale' | 'return' | 'payment' | 'purchase'
  product_id: number | null
  product_name: string | null
  qty: number
  empties: number
  amount: number
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
  outright: boolean
  segment: Segment
  bill_number: string
  method: PaymentMethod | null
  paid: boolean
}

export interface AgencySettings {
  id: boolean
  business_name: string
  business_phone: string | null
  business_address: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  pincode: string | null
  gst_number: string | null
  price_per_cylinder: number
  updated_at: string
}

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

// One row per commercial sale bill, from commercial_bill_profit(). Every money
// field is ex-GST except revenue_incl and the gst_* pair.
export interface BillProfit {
  bill_id: number
  bill_number: string
  customer_id: number | null
  created_at: string
  day: string
  paid: boolean
  qty: number
  revenue_incl: number
  revenue_ex: number
  cost_ex: number
  profit: number
  gst_out: number
  gst_in: number
  cost_known: boolean
}

export interface BillLineProfit {
  bill_line_id: number
  bill_id: number
  bill_number: string
  customer_id: number | null
  created_at: string
  day: string
  paid: boolean
  product_id: number
  product_name: string
  gst_rate: number
  qty: number
  revenue_incl: number
  revenue_ex: number
  gst_out: number
  unit_cost_ex: number | null
  cost_ex: number | null
  gst_in: number | null
  profit: number | null
  cost_known: boolean
  cost_source: string | null
}

// Payment bills carry no lines, so they are read from `bills` directly rather
// than through the gated profit functions.
export interface PaymentBill {
  customer_id: number
  created_at: string
  total_amount: number
}
