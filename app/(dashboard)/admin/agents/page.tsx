export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { AgentsManager } from './AgentsManager'

export default async function AgentsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/admin')

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [{ data: agents }, { data: mediaBuyers }, { data: assignments }, { data: orders }] = await Promise.all([
    serviceClient.from('profiles').select('*').eq('role', 'confirmation_agent').order('full_name'),
    serviceClient.from('profiles').select('id, full_name').eq('role', 'media_buyer').order('full_name'),
    serviceClient.from('agent_buyer_assignments').select('agent_id, buyer_id'),
    serviceClient.from('orders').select('media_buyer_id, confirmed_by, status, selling_price, product_cost, packaging_cost, delivery_cost, call_center_cost, ad_spend, created_at'),
  ])

  return (
    <AgentsManager
      initialAgents={agents || []}
      mediaBuyers={mediaBuyers || []}
      initialAssignments={assignments || []}
      orders={orders || []}
    />
  )
}
