import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const JAMLA_PRODUCT_ID = 'c0a1618b-75b9-4b0b-8d22-058757a79bba'
const JAMLA_PRICE_PER_PIECE = 15

function calcCod(selling_price: number, delivery_cost: number, quantity: number | null): number {
  const qty = quantity || 0
  const isNewShipping = qty > 0 && selling_price === qty * JAMLA_PRICE_PER_PIECE + 36
  return isNewShipping ? selling_price : selling_price + delivery_cost
}

const RAMASSES_STATUSES = new Set([
  'picked_up', 'received_hub', 'in_delivery', 'address_issue', 'out_of_zone',
  'refused', 'preparing_return', 'delivery_no_answer', 'postponed',
  'redirect_city', 'delivered', 'returned',
])

const EN_SUSPENS_STATUSES = new Set([
  'in_delivery', 'delivery_no_answer', 'postponed', 'address_issue',
  'out_of_zone', 'redirect_city', 'received_hub', 'picked_up',
])

const ECHECS_STATUSES = new Set(['refused', 'cancelled', 'wrong_number'])

type Row = {
  id: string
  status: string
  customer_name: string | null
  customer_phone: string | null
  city: string | null
  selling_price: number
  delivery_cost: number
  quantity: number | null
  tracking_code: string | null
  ameex_sent_at: string | null
  delivered_at: string | null
  return_received_at: string | null
  created_at: string
  cod: number
  categorie: string
}

function classifyRow(r: Omit<Row, 'cod' | 'categorie'>): string {
  if (r.status === 'confirmed') return 'en_attente'
  if (EN_SUSPENS_STATUSES.has(r.status)) return 'en_suspens'
  if (r.status === 'delivered') return 'livre'
  if (ECHECS_STATUSES.has(r.status)) return 'echec'
  if (['returned', 'preparing_return'].includes(r.status) && !r.return_received_at) return 'retour_a_recevoir'
  if (r.status === 'returned' && r.return_received_at) return 'retour_recu'
  return 'a_verifier'
}

const CATEGORIE_FR: Record<string, string> = {
  en_attente: 'En attente ramassage',
  en_suspens: 'En suspens',
  livre: 'Livré',
  echec: 'Échec',
  retour_a_recevoir: 'Retour à recevoir',
  retour_recu: 'Retour reçu',
  a_verifier: 'À vérifier',
}

export async function GET(request: NextRequest) {
  const supabaseUser = await createClient()
  const { data: { session } } = await supabaseUser.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabaseUser
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const format = searchParams.get('format') || 'json'

  let query = supabase
    .from('orders')
    .select('id, status, customer_name, customer_phone, city, selling_price, delivery_cost, quantity, tracking_code, ameex_sent_at, delivered_at, return_received_at, created_at')
    .eq('product_id', JAMLA_PRODUCT_ID)
    .not('ameex_sent_at', 'is', null)
    .order('ameex_sent_at', { ascending: false })

  if (from) query = query.gte('ameex_sent_at', from)
  if (to) {
    const toDate = new Date(to)
    toDate.setDate(toDate.getDate() + 1)
    query = query.lt('ameex_sent_at', toDate.toISOString().split('T')[0])
  }

  const { data: orders, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: Row[] = (orders || []).map(o => ({
    ...o,
    cod: calcCod(o.selling_price || 0, o.delivery_cost || 0, o.quantity),
    categorie: classifyRow(o),
  }))

  function pieces(rs: Row[]): number {
    return rs.reduce((acc, r) => acc + (r.quantity || 0), 0)
  }

  const confies       = rows.length
  const confiesPieces = pieces(rows)

  const ramassesRows  = rows.filter(r => RAMASSES_STATUSES.has(r.status))
  const ramasses      = ramassesRows.length
  const ramassePieces = pieces(ramassesRows)

  const livresRows      = rows.filter(r => r.categorie === 'livre')
  const echecsRows      = rows.filter(r => r.categorie === 'echec')
  const enAttenteRows   = rows.filter(r => r.categorie === 'en_attente')
  const enSuspensRows   = rows.filter(r => r.categorie === 'en_suspens')
  const retourARRows    = rows.filter(r => r.categorie === 'retour_a_recevoir')
  const retourRecusRows = rows.filter(r => r.categorie === 'retour_recu')
  const aVerifierRows   = rows.filter(r => r.categorie === 'a_verifier')

  const livres                  = livresRows.length
  const livresPieces            = pieces(livresRows)
  const echecs                  = echecsRows.length
  const echecsPieces            = pieces(echecsRows)
  const enAttenteRamassage      = enAttenteRows.length
  const enAttenteRamassagePieces = pieces(enAttenteRows)
  const enSuspens               = enSuspensRows.length
  const enSuspensPieces         = pieces(enSuspensRows)
  const retourARecevoir         = retourARRows.length
  const retourARecevoirPieces   = pieces(retourARRows)
  const retourRecus             = retourRecusRows.length
  const retourRecusPieces       = pieces(retourRecusRows)
  const aVerifier               = aVerifierRows.length
  const aVerifierPieces         = pieces(aVerifierRows)

  const sumExclusive = enAttenteRamassage + livres + echecs + retourARecevoir + retourRecus + enSuspens + aVerifier
  const reconciliationOk = sumExclusive === confies

  const tauxDenom = livres + rows.filter(r =>
    ['refused', 'cancelled', 'wrong_number', 'returned'].includes(r.status)
  ).length
  const tauxLivraison = tauxDenom > 0 ? Math.round((livres / tauxDenom) * 100) : 0

  const codARecevoirDAmeex = livresRows.reduce((acc, r) => acc + r.cod, 0)

  const kpis = {
    confies,
    confiesPieces,
    ramasses,
    ramassePieces,
    livres,
    livresPieces,
    enAttenteRamassage,
    enAttenteRamassagePieces,
    enSuspens,
    enSuspensPieces,
    retourARecevoir,
    retourARecevoirPieces,
    retourRecus,
    retourRecusPieces,
    echecs,
    echecsPieces,
    aVerifier,
    aVerifierPieces,
    tauxLivraison,
    codARecevoirDAmeex,
    reconciliationOk,
  }

  if (format === 'csv') {
    const BOM = '﻿'
    const headers = ['Date AMEEX', 'Client', 'Téléphone', 'Ville', 'Quantité (pièces)', 'COD (DH)', 'Statut', 'Catégorie', 'Code suivi', 'Retour reçu le']

    const STATUS_FR: Record<string, string> = {
      confirmed: 'Confirmé', picked_up: 'Ramassé', received_hub: 'Reçu agence',
      address_issue: 'Attente adresse', in_delivery: 'En livraison', out_of_zone: 'Hors-zone',
      refused: 'Refusé', preparing_return: 'Prép. retour', redirect_city: 'Renvoi ville',
      delivered: 'Livré', returned: 'Retour', cancelled: 'Annulé',
      delivery_no_answer: 'Pas rép. livraison', postponed: 'Reporté', wrong_number: 'Faux numéro',
    }

    const csvRows = rows.map(r => [
      r.ameex_sent_at ? new Date(r.ameex_sent_at).toLocaleDateString('fr-FR') : '',
      r.customer_name || '',
      r.customer_phone || '',
      r.city || '',
      r.quantity != null ? String(r.quantity) : '',
      String(r.cod),
      STATUS_FR[r.status] || r.status,
      CATEGORIE_FR[r.categorie] || r.categorie,
      r.tracking_code || '',
      r.return_received_at ? new Date(r.return_received_at).toLocaleDateString('fr-FR') : '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))

    const csv = BOM + [headers.map(h => `"${h}"`).join(';'), ...csvRows].join('\r\n')
    const dateLabel = from && to ? `${from}_${to}` : 'tout'
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="jamla-rapport-${dateLabel}.csv"`,
      },
    })
  }

  return NextResponse.json({ kpis, orders: rows })
}
