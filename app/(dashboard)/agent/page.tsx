export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { AgentDashboard } from './AgentDashboard'

export default async function AgentPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'confirmation_agent') redirect('/')

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Get assigned buyer IDs
  const { data: assignments } = await serviceClient
    .from('agent_buyer_assignments')
    .select('buyer_id')
    .eq('agent_id', user.id)

  const buyerIds = assignments?.map(a => a.buyer_id) || []

  let orders: any[] = []
  if (buyerIds.length > 0) {
    const { data } = await serviceClient
      .from('orders')
      .select('*, products(id, name)')
      .in('media_buyer_id', buyerIds)
      .order('created_at', { ascending: false })
      .limit(2000)
    orders = data || []
  }

  const { data: buyers } = await serviceClient
    .from('profiles')
    .select('id, full_name')
    .in('id', buyerIds.length > 0 ? buyerIds : ['none'])

  return (
    <AgentDashboard
      agentId={user.id}
      agentProfile={profile}
      initialOrders={orders}
      assignedBuyers={buyers || []}
    />
  )
}
