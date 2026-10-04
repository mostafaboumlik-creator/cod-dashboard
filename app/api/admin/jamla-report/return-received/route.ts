import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const JAMLA_PRODUCT_ID = 'c0a1618b-75b9-4b0b-8d22-058757a79bba'

export async function POST(request: NextRequest) {
  const supabaseUser = await createClient()
  const { data: { session } } = await supabaseUser.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabaseUser
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body invalide' }, { status: 400 })

  const { orderId, received } = body
  if (!orderId || typeof received !== 'boolean') {
    return NextResponse.json({ error: 'orderId (string) et received (boolean) requis' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: order, error: findErr } = await supabase
    .from('orders')
    .select('id, status, product_id')
    .eq('id', orderId)
    .single()

  if (findErr || !order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  if (order.product_id !== JAMLA_PRODUCT_ID) return NextResponse.json({ error: 'Commande non Jamla' }, { status: 403 })
  if (received && order.status !== 'returned') {
    return NextResponse.json({ error: `Statut 'returned' requis pour marquer retour reçu (actuel: ${order.status})` }, { status: 400 })
  }

  const { error: updateErr } = await supabase
    .from('orders')
    .update({ return_received_at: received ? new Date().toISOString() : null })
    .eq('id', orderId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
