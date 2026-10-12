export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { RelanceList } from './RelanceList'
import { buildRelanceList, JAMLA_PRODUCT_ID } from '@/app/api/agent/relance/route'

export default async function AgentRelancePage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()
  if (!profile || profile.role !== 'confirmation_agent') redirect('/')

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: orders } = await serviceClient
    .from('orders')
    .select('id, customer_phone, customer_name, city, address1, status, delivered_at, created_at, customer_type, quantity, product_id, products(name, pack_size)')
    .eq('product_id', JAMLA_PRODUCT_ID)
    .order('created_at', { ascending: true })

  const clients = buildRelanceList(orders || [])

  const { data: products } = await serviceClient
    .from('products')
    .select('id, name, pack_size, selling_price')
    .eq('is_active', true)
    .order('name')

  return <RelanceList clients={clients} products={products || []} />
}
