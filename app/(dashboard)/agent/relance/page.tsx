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

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  const [ordersRes, productsRes, assignmentsRes] = await Promise.all([
    svc.from('orders')
      .select('id, customer_phone, customer_name, city, address1, status, delivered_at, created_at, customer_type, quantity, product_id, products(name, pack_size)')
      .eq('product_id', JAMLA_PRODUCT_ID)
      .order('created_at', { ascending: true }),
    svc.from('products')
      .select('id, name, pack_size, selling_price')
      .eq('is_active', true)
      .order('name'),
    svc.from('agent_buyer_assignments')
      .select('buyer_id')
      .eq('agent_id', session.user.id)
      .limit(1),
  ])

  const clients = buildRelanceList(ordersRes.data || [])
  const products = productsRes.data || []
  const buyerId = assignmentsRes.data?.[0]?.buyer_id ?? null

  const [todayOrdersRes, followupsRes] = await Promise.all([
    buyerId
      ? svc.from('orders')
          .select('selling_price')
          .eq('order_source', 'relance')
          .eq('media_buyer_id', buyerId)
          .gte('created_at', todayISO)
      : Promise.resolve({ data: [] as { selling_price: number }[] }),
    svc.from('customer_followups')
      .select('customer_phone, result, notes, next_followup_at, created_at')
      .eq('agent_id', session.user.id)
      .order('created_at', { ascending: false }),
  ])

  const todayOrders = (todayOrdersRes as { data: { selling_price: number }[] | null }).data || []
  const allFollowups = followupsRes.data || []

  // Latest followup per phone
  const followupsByPhone: Record<string, { result: string; created_at: string; next_followup_at: string | null }> = {}
  for (const f of allFollowups) {
    if (!followupsByPhone[f.customer_phone]) {
      followupsByPhone[f.customer_phone] = {
        result: f.result,
        created_at: f.created_at,
        next_followup_at: f.next_followup_at,
      }
    }
  }

  // Phones relancé today (distinct)
  const relancedTodayPhones = [
    ...new Set(
      allFollowups
        .filter(f => f.created_at >= todayISO)
        .map(f => f.customer_phone)
    ),
  ]

  const kpiData = {
    eligibleCount: clients.length,
    relancedToday: relancedTodayPhones.length,
    ordersToday: todayOrders.length,
    caToday: todayOrders.reduce((s, o) => s + (o.selling_price || 0), 0),
  }

  return (
    <RelanceList
      clients={clients}
      products={products}
      kpiData={kpiData}
      followupsByPhone={followupsByPhone}
      relancedTodayPhones={relancedTodayPhones}
    />
  )
}
