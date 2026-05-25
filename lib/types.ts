export type UserRole = 'admin' | 'media_buyer' | 'confirmation_agent'
export type OrderStatus =
  | 'lead'
  | 'confirmed'
  | 'delivered'
  | 'returned'
  | 'cancelled'
  | 'wrong_number'
  | 'call_later'
  | 'no_reply'
  | 'unreachable'
  | 'out_of_stock'
  | 'duplicate'
  | 'delivery_no_answer'
export type AdPlatform = 'facebook' | 'tiktok' | 'other'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  commission_rate: number
  api_key?: string | null
  created_at: string
}

export interface Product {
  id: string
  name: string
  category: string | null
  selling_price: number
  product_cost: number
  packaging_cost: number
  is_active: boolean
  created_at: string
}

export interface Order {
  id: string
  media_buyer_id: string
  confirmed_by?: string | null
  product_id: string
  status: OrderStatus
  selling_price: number
  product_cost: number
  packaging_cost: number
  delivery_cost: number
  call_center_cost: number
  ad_spend: number
  campaign_name: string | null
  ad_platform: AdPlatform | null
  customer_name: string | null
  customer_phone: string | null
  city: string | null
  notes: string | null
  product_variant: string | null
  address1: string | null
  address2: string | null
  youcan_order_id: string | null
  second_contact: string | null
  day1_contact: string | null
  created_at: string
  confirmed_at: string | null
  delivered_at: string | null
  profiles?: Profile
  products?: Partial<Product> | null
}

export interface OrderWithMetrics extends Order {
  net_profit: number
  gross_profit: number
  commission: number
  total_costs: number
}

export interface DashboardStats {
  totalRevenue: number
  totalNetProfit: number
  totalOrders: number
  totalLeads: number
  totalConfirmed: number
  totalDelivered: number
  totalReturned: number
  totalCancelled: number
  totalAdSpend: number
  confirmationRate: number
  deliveryRate: number
  returnRate: number
  roi: number
}

export interface MediaBuyerStats extends DashboardStats {
  profile: Profile
  commission: number
}

export interface DailyMetric {
  date: string
  revenue: number
  net_profit: number
  orders: number
  ad_spend: number
}
