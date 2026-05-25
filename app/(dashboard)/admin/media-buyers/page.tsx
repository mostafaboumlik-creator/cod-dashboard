export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MediaBuyersManager } from './MediaBuyersManager'

export default async function MediaBuyersPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/buyer')

  const [{ data: mediaBuyers }, { data: orders }, { data: products }] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'media_buyer').order('full_name'),
    supabase.from('orders').select('media_buyer_id, status, selling_price, product_cost, packaging_cost, delivery_cost, call_center_cost, ad_spend'),
    supabase.from('products').select('id, name').eq('is_active', true),
  ])

  return (
    <MediaBuyersManager
      initialBuyers={mediaBuyers || []}
      orders={orders || []}
      products={products || []}
    />
  )
}
