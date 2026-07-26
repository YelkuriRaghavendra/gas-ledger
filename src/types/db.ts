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
