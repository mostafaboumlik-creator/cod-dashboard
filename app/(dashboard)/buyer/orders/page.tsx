export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BuyerOrdersView } from './BuyerOrdersView'

export default async function BuyerOrdersPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const [{ data: profile }, { data: orders }, { data: products }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('orders')
      .select('*, products(id, name)')
      .eq('media_buyer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('products')
      .select('id, name, selling_price, product_cost, packaging_cost')
      .eq('is_active', true),
  ])

  if (!profile) redirect('/login')

  return (
    <BuyerOrdersView
      orders={orders || []}
      commissionRate={profile.commission_rate}
      userId={user.id}
      products={products || []}
    />
  )
}
