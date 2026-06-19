import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

function detectPlatform(name: string): 'facebook' | 'tiktok' | 'youtube' | 'other' {
  const n = name.toLowerCase().replace(/\s+/g, ' ')
  if (n.includes(' fb') || n.endsWith('fb') || n.startsWith('fb ') || n.includes('facebook')) return 'facebook'
  if (n.includes(' tk') || n.endsWith('tk') || n.startsWith('tk ') || n.includes('tiktok') || n.startsWith('tt ') || n.includes(' tt') || n.includes('tkt') || n.includes(' tik')) return 'tiktok'
  if (n.includes(' yt') || n.endsWith('yt') || n.startsWith('yt ') || n.includes('youtube')) return 'youtube'
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

// Extract first number from variant string (e.g. "باك 120 قطعة" → 120, "باك 5 قطع" → 5)
function extractPackQty(variant: string): number {
  const match = variant.match(/\d+/)
  return match ? parseInt(match[0], 10) : 1
}

// Retire fb/tt/yt/tk en début ou fin pour comparer les noms de produits cross-plateforme
function stripPlatformTag(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(fb|tt|tk|yt|tkt|tiktok|facebook|youtube)\s*/i, '')
    .replace(/\s*(fb|tt|tk|yt|tkt|tiktok|facebook|youtube)$/i, '')
    .replace(/\s+/g, '')
}

function isCasablanca(city: string): boolean {
  const c = city.toLowerCase().trim()
  return c.includes('casa') || c.includes('الدار البيضاء') || c.includes('دار البيضاء') || c === 'bida' || c === 'bda'
}

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

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
  if (!cleanPhone || !api_key) {
    return NextResponse.json({ error: 'phone et api_key requis' }, { status: 400 })
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

  // Resolve product_id: use provided ID, or find by partial name match
  let resolvedProductId = product_id || null
  let product: any = null

  if (resolvedProductId) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('id', resolvedProductId)
      .single()
    product = data
  }

  // Fallback: search by name contained in product_name from sheet
  if (!product && product_name) {
    const { data: allProducts } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)

    if (allProducts) {
      const sheetName = stripPlatformTag(String(product_name))
      const matched = allProducts.find(p => {
        const dbName = stripPlatformTag(p.name)
        return sheetName.includes(dbName) || dbName.includes(sheetName)
      })
      if (matched) {
        product = matched
        resolvedProductId = matched.id
      }
    }
  }

  if (!resolvedProductId || !product) {
    return NextResponse.json({ error: 'Produit introuvable', product_name }, { status: 404 })
  }

  // Duplicate check: use youcan_order_id as primary key (prevents re-sending same order)
  // Never block by phone alone — same customer can place a new Youcan order
  const cleanOrderId = String(youcan_order_id || '').trim()
  if (cleanOrderId) {
    const { data: existingById } = await supabase
      .from('orders')
      .select('id')
      .eq('youcan_order_id', cleanOrderId)
      .eq('product_id', resolvedProductId)
      .single()
    if (existingById) {
      return NextResponse.json({ action: 'skipped', reason: 'doublon_order_id', youcan_order_id: cleanOrderId })
    }
  }

  // Respect the sheet sync toggle — undefined means column not yet added → allow
  if (product?.sheet_sync_active === false) {
    return NextResponse.json({ action: 'skipped', reason: 'sheet_sync_paused', phone: cleanPhone })
  }

  const status = etat ? mapEtat(String(etat)) : 'lead'
  const sellingPrice = Number(variant_price) || product?.selling_price || 0

  // Calculate product cost: if pack product with unit_cost set, multiply by qty from variant
  const variantStr = String(product_variant || '').trim()
  let productCost = product?.product_cost ?? 0
  if (product?.selling_type === 'pack' && product?.unit_cost > 0 && variantStr) {
    const qty = extractPackQty(variantStr)
    productCost = product.unit_cost * qty
  }

  const { error } = await supabase.from('orders').insert({
    media_buyer_id: buyer_id || null,
    product_id: resolvedProductId,
    status,
    selling_price: sellingPrice,
    product_cost: productCost,
    packaging_cost: product?.packaging_cost ?? 0,
    delivery_cost: isCasablanca(String(city || '')) ? (product?.delivery_cost_casa ?? 20) : 35,
    call_center_cost: product?.call_center_cost ?? 15,
    customer_name: String(full_name || '').trim() || null,
    customer_phone: cleanPhone,
    city: String(city || '').trim() || null,
    product_variant: variantStr || null,
    address1: String(address1 || '').trim() || null,
    address2: String(address2 || '').trim() || null,
    youcan_order_id: String(youcan_order_id || '').trim() || null,
    campaign_name: String(product_name || '').trim() || null,
    ad_platform: detectPlatform(String(product_name || '')),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, phone: cleanPhone, status, product_cost: productCost })
}
