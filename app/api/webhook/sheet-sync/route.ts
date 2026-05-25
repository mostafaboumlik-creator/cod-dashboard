import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

function detectPlatform(name: string): 'facebook' | 'tiktok' | 'other' {
  const n = name.toLowerCase()
  if (n.includes(' fb') || n.endsWith('fb') || n.includes('facebook')) return 'facebook'
  if (n.includes(' tk') || n.endsWith('tk') || n.includes('tiktok')) return 'tiktok'
  return 'other'
}

function mapEtat(etat: string): string {
  const v = etat.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (v.includes('confirme') || v.includes('confirm')) return 'confirmed'
  if (v.includes('pas de reponse') || v.includes('pas reponse')) return 'no_reply'
  if (v.includes('boite vocale') || v.includes('boite')) return 'unreachable'
  if (v.includes('a coupe') || v.includes('coupe')) return 'unreachable'
  if (v.includes('injoignable')) return 'unreachable'
  if (v.includes('annule') || v.includes('annul')) return 'cancelled'
  if (v.includes('pas interesse') || v.includes('interesse')) return 'cancelled'
  if (v.includes('black list') || v.includes('blacklist')) return 'cancelled'
  if (v.includes('reporte') || v.includes('rappeler')) return 'call_later'
  if (v.includes('numero incorrect') || v.includes('faux numero')) return 'wrong_number'
  if (v.includes('doublon') || v.includes('doubel')) return 'duplicate'
  return 'lead'
}

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  // Optional secret key protection
  const secret = process.env.SHEET_SYNC_SECRET
  if (secret) {
    const provided = request.headers.get('x-sync-secret') || new URL(request.url).searchParams.get('secret')
    if (provided !== secret) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body invalide' }, { status: 400 })

  const {
    api_key, product_id,
    phone, full_name, city,
    product_variant, variant_price,
    address1, address2,
    etat, youcan_order_id,
    product_name,
  } = body

  const cleanPhone = String(phone || '').trim().replace(/\s/g, '')
  if (!cleanPhone || !product_id || !api_key) {
    return NextResponse.json({ error: 'phone, product_id et api_key requis' }, { status: 400 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Resolve buyer from api_key
  const { data: buyerProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('api_key', api_key)
    .single()

  const buyer_id = buyerProfile?.id ?? null

  // Skip if phone already exists for this product
  const { data: existing } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_phone', cleanPhone)
    .eq('product_id', product_id)
    .single()

  if (existing) {
    return NextResponse.json({ action: 'skipped', reason: 'doublon', phone: cleanPhone })
  }

  // Get product prices
  const { data: product } = await supabase
    .from('products')
    .select('selling_price, product_cost, packaging_cost')
    .eq('id', product_id)
    .single()

  const status = etat ? mapEtat(String(etat)) : 'lead'
  const sellingPrice = Number(variant_price) || product?.selling_price || 0

  const { error } = await supabase.from('orders').insert({
    media_buyer_id: buyer_id || null,
    product_id,
    status,
    selling_price: sellingPrice,
    product_cost: product?.product_cost ?? 0,
    packaging_cost: product?.packaging_cost ?? 0,
    delivery_cost: 20,
    call_center_cost: 5,
    customer_name: String(full_name || '').trim() || null,
    customer_phone: cleanPhone,
    city: String(city || '').trim() || null,
    product_variant: String(product_variant || '').trim() || null,
    address1: String(address1 || '').trim() || null,
    address2: String(address2 || '').trim() || null,
    youcan_order_id: String(youcan_order_id || '').trim() || null,
    campaign_name: String(product_name || '').trim() || null,
    ad_platform: detectPlatform(String(product_name || '')),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, phone: cleanPhone, status })
}
