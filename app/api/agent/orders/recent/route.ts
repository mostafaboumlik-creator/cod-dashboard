import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { AGENT_ORDER_SELECT } from '@/lib/agent-orders'

// Polling léger de l'interface agent : commandes des 14 derniers jours (nouveaux leads,
// y compris datés en arrière par la synchro, et changements de statut : p99 livraison ≈ 10 j)
export async function GET() {
  const supabaseUser = await createClient()
  const { data: { session } } = await supabaseUser.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabaseUser
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()
  if (profile?.role !== 'confirmation_agent') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: assignments } = await svc
    .from('agent_buyer_assignments')
    .select('buyer_id')
    .eq('agent_id', session.user.id)
  const buyerIds = assignments?.map(a => a.buyer_id) || []
  if (buyerIds.length === 0) return NextResponse.json([])

  const since = new Date(Date.now() - 14 * 86400000).toISOString()
  const { data, error } = await svc
    .from('orders')
    .select(AGENT_ORDER_SELECT)
    .in('media_buyer_id', buyerIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
