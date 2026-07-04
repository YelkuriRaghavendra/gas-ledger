export type Role = 'owner' | 'staff'

export interface Profile {
  id: string
  name: string
  role: Role
}

export type TransactionType = 'sale' | 'return' | 'payment'
export type PaymentMethod = 'cash' | 'upi'

export interface Product {
  id: number
  name: string
  price: number
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
  customer_id: number
  type: TransactionType
  product_id: number | null
  qty: number
  empties: number
  amount: number
  paid: boolean
  method: PaymentMethod | null
  note: string | null
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
