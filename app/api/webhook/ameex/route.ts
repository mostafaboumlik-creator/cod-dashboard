import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// Ameex → our status mapping
function mapAmeexStatus(statut: string, statutS?: string): string | null {
  if (statut === 'DELIVERED') return 'delivered'
  if (statut === 'RETURNED') return 'returned'
  if (statut === 'CANCELLED') return 'cancelled'
  if (statut === 'DISTRIBUTION') return 'confirmed'
  if (statut === 'IN_PROGRESS') {
    if (statutS === 'NO_ANSWER_TEAM' || statutS === 'NO_ANSWER') return 'delivery_no_answer'
    if (statutS === 'POSTPONED' || statutS === 'SCHEDULED') return 'call_later'
    return null // other IN_PROGRESS sub-statuses — ignore
  }
  return null
}

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  // Ameex sends application/x-www-form-urlencoded
  let code: string, statut: string, statutS: string | undefined

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text()
    const params = new URLSearchParams(text)
    code = params.get('CODE') || ''
    statut = params.get('STATUT') || ''
    statutS = params.get('STATUT_S') || undefined
  } else {
    const body = await request.json().catch(() => ({}))
    code = body.CODE || ''
    statut = body.STATUT || ''
    statutS = body.STATUT_S || undefined
  }

  if (!code || !statut) {
    return NextResponse.json({ error: 'CODE et STATUT requis' }, { status: 400 })
  }

  const newStatus = mapAmeexStatus(statut, statutS)
  if (!newStatus) {
    // Status not mapped — acknowledge without updating
    return NextResponse.json({ received: true, action: 'ignored', statut, statut_s: statutS })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: order, error: findError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('tracking_code', code)
    .single()

  if (findError || !order) {
    return NextResponse.json({ error: 'Commande introuvable pour ce code: ' + code }, { status: 404 })
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', order.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    order_id: order.id,
    old_status: order.status,
    new_status: newStatus,
  })
}
