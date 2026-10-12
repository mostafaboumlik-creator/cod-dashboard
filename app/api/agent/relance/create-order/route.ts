import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

function isCasablanca(city: string): boolean {
  const c = city.toLowerCase().trim()
  return c.includes('casa') || c.includes('الدار البيضاء') || c.includes('دار البيضاء') || c === 'bida' || c === 'bda'
}

export async function POST(request: NextRequest) {
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

  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Resolve agent's first assigned buyer (order must be visible in agent's dashboard)
  const { data: assignments } = await supabase
    .from('agent_buyer_assignments')
    .select('buyer_id')
    .eq('agent_id', session.user.id)
    .limit(1)

  const buyerId = assignments?.[0]?.buyer_id ?? null
  if (!buyerId) {
    return NextResponse.json({ error: 'Aucun media buyer assigné à cet agent — contactez un administrateur' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body invalide' }, { status: 400 })

  const {
    product_id,
    quantity,
    product_variant,
    payment_mode,
    customer_name,
    customer_phone,
    city,
    address1,
    customer_type,
  } = body

  if (!product_id) return NextResponse.json({ error: 'Produit requis' }, { status: 400 })
  if (!customer_phone) return NextResponse.json({ error: 'Téléphone requis' }, { status: 400 })

  const { data: product } = await supabase
    .from('products')
    .select('id, selling_price, selling_type, pack_size, product_cost, packaging_cost, delivery_cost_casa, delivery_cost_hors_casa, call_center_cost')
    .eq('id', product_id)
    .single()

  if (!product) return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })

  // Server-side selling_price: computed from product config, not trusted from browser
  // For pack products (e.g. Jamla): packs × selling_price_per_pack + 36 DH client shipping
  const CLIENT_SHIPPING_FEE = 36
  let computedSellingPrice: number
  const qty = Number(quantity)

  if (product.selling_type === 'pack' && product.pack_size && product.pack_size > 0) {
    if (!qty || qty <= 0 || qty % product.pack_size !== 0) {
      return NextResponse.json({ error: `La quantité doit être un multiple de ${product.pack_size} (pack_size)` }, { status: 400 })
    }
    const packs = qty / product.pack_size
    computedSellingPrice = packs * product.selling_price + CLIENT_SHIPPING_FEE
  } else {
    // Non-pack products: use product's default selling_price
    computedSellingPrice = product.selling_price || 0
  }

  if (computedSellingPrice <= 0) return NextResponse.json({ error: 'Prix calculé invalide — vérifiez la configuration produit' }, { status: 400 })

  const deliveryCost = isCasablanca(String(city || ''))
    ? (product.delivery_cost_casa ?? 20)
    : (product.delivery_cost_hors_casa ?? 35)

  const { error } = await supabase.from('orders').insert({
    media_buyer_id: buyerId,
    product_id,
    status: 'confirmed',
    order_source: 'relance',
    ad_spend: 0,
    confirmed_at: new Date().toISOString(),
    selling_price: computedSellingPrice,
    product_cost: product.product_cost ?? 0,
    packaging_cost: product.packaging_cost ?? 0,
    delivery_cost: deliveryCost,
    call_center_cost: product.call_center_cost ?? 15,
    quantity: Number(quantity) > 0 ? Number(quantity) : null,
    product_variant: product_variant ? String(product_variant).trim() || null : null,
    payment_mode: payment_mode ? String(payment_mode).trim() || null : null,
    customer_name: customer_name ? String(customer_name).trim() || null : null,
    customer_phone: String(customer_phone).trim().replace(/\s/g, ''),
    city: city ? String(city).trim() || null : null,
    address1: address1 ? String(address1).trim() || null : null,
    customer_type: customer_type ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
