import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// Ameex → our status mapping (handles both French and English)
function mapAmeexStatus(statut: string, statutS?: string): string | null {
  // Normalize: uppercase + remove accents
  const normalize = (v?: string) => (v || '').toUpperCase()
    .replace(/É/g,'E').replace(/È/g,'E').replace(/Ê/g,'E')
    .replace(/À/g,'A').replace(/Â/g,'A')
    .replace(/Û/g,'U').replace(/Ù/g,'U')
    .trim()

  const s  = normalize(statut)
  const ss = normalize(statutS)

  console.log('AMEEX_WEBHOOK STATUT:', s, 'STATUT_S:', ss)

  // Ramassé / Picked up
  if (['RAMASSE', 'PICKED_UP', 'COLLECTED', 'PRIS_EN_CHARGE'].includes(s))
    return 'picked_up'

  // Reçu à l'agence / hub
  if (['RECU', 'RECEIVED', 'IN_WAREHOUSE', 'WAREHOUSE', 'PROCESSING', 'EN_AGENCE', 'RECU_AGENCE'].includes(s))
    return 'received_hub'

  // Attente adresse
  if (['ATTENTE_ADRESSE', 'ATTENTE ADRESSE', 'WAITING_ADDRESS', 'ADDRESS_ISSUE', 'INCOMPLETE_ADDRESS'].includes(s))
    return 'address_issue'

  // Expédié / En livraison / Out for delivery
  if (['EN_LIVRAISON', 'EN LIVRAISON', 'OUT_FOR_DELIVERY', 'IN_DELIVERY', 'EXPEDIE', 'EXPEDIE_HUB', 'DISTRIBUTION', 'DISPATCHED', 'SHIPPED', 'EN_COURS_LIVRAISON'].includes(s))
    return 'in_delivery'

  // Livré / Delivered
  if (['LIVRE', 'DELIVERED', 'LIVREE'].includes(s)) return 'delivered'

  // Retourné / Returned
  if (['RETOURNE', 'RETURNED', 'RETOUR'].includes(s)) return 'returned'

  // Annulé / Cancelled
  if (['ANNULE', 'CANCELLED', 'REFUSED', 'REFUSE'].includes(s)) return 'cancelled'

  // En cours avec sous-statuts
  if (['IN_PROGRESS', 'EN_COURS', 'EN COURS'].includes(s)) {
    if (['NO_ANSWER_TEAM', 'NO_ANSWER', 'UNREACHABLE', 'PAS_REPONSE', 'PAS DE REPONSE', 'RELANCER', 'RELANCE', 'RELANCER_SUIVI'].includes(ss)) return 'delivery_no_answer'
    if (['POSTPONED', 'SCHEDULED', 'RESCHEDULED', 'REPORTE', 'REPORTER', 'PROGRAMME', 'REPORTE_SUIVI', 'RELANCER_NOUVEAU_CLIENT', 'RENVOI_VILLE', 'NOUVELLE_VILLE'].includes(ss)) return 'postponed'
    if (['HORS_ZONE', 'HORS ZONE', 'OUT_OF_ZONE'].includes(ss)) return 'out_of_zone'
    if (['REFUSE', 'REFUSED', 'REFUS'].includes(ss)) return 'refused'
    if (['PREPARATION_RETOUR', 'PREPARATION RETOUR', 'PREP_RETOUR', 'RETOUR_EXPEDITEUR'].includes(ss)) return 'preparing_return'
    if (['LIVRE', 'DELIVERED'].includes(ss)) return 'delivered'
    if (['RETOURNE', 'RETURNED'].includes(ss)) return 'returned'
    return 'in_delivery'
  }

  // Statuts directs additionnels
  if (['HORS_ZONE', 'HORS ZONE'].includes(s)) return 'out_of_zone'
  if (['REFUSE', 'REFUSED'].includes(s)) return 'refused'
  if (['PREPARATION_RETOUR', 'PREP_RETOUR'].includes(s)) return 'preparing_return'

  console.log('AMEEX_STATUS_UNMAPPED:', s, ss)
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

  const updateData: any = { status: newStatus }
  if (newStatus === 'delivered') updateData.delivered_at = new Date().toISOString()
  if (newStatus === 'returned')  updateData.delivered_at = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('orders')
    .update(updateData)
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
