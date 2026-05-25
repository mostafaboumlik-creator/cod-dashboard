export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OrdersManager } from './OrdersManager'

export default async function AdminOrdersPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/buyer')

  const [{ data: orders }, { data: products }, { data: mediaBuyers }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, media_buyer_id, product_id, status, selling_price, product_cost, packaging_cost, delivery_cost, call_center_cost, ad_spend, campaign_name, ad_platform, customer_name, customer_phone, city, notes, product_variant, address1, address2, youcan_order_id, second_contact, day1_contact, confirmed_by, created_at, confirmed_at, delivered_at, products(id, name)')
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase.from('products').select('id, name, category, selling_price, product_cost, packaging_cost').eq('is_active', true),
    supabase.from('profiles').select('id, full_name, commission_rate').eq('role', 'media_buyer'),
  ])

  return (
    <OrdersManager
      initialOrders={orders || []}
      products={products || []}
      mediaBuyers={mediaBuyers || []}
    />
  )
}

