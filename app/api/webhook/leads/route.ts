import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const apiKey =
    request.headers.get('x-api-key') ||
    request.nextUrl.searchParams.get('key')

  if (!apiKey) {
    return NextResponse.json({ error: 'API key required' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: buyer } = await supabase
    .from('profiles')
    .select('id')
    .eq('api_key', apiKey)
    .single()

  if (!buyer) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  let body: any = {}
  try { body = await request.json() } catch {}

  const { customer_name, customer_phone, city, product_id, product_name, campaign_name, ad_platform, ad_spend, notes } = body

  let resolvedProductId = product_id

  if (!resolvedProductId && product_name) {
    const { data: p } = await supabase
      .from('products')
      .select('id')
      .ilike('name', `%${product_name}%`)
      .eq('is_active', true)
      .limit(1)
      .single()
    if (p) resolvedProductId = p.id
  }

  if (!resolvedProductId) {
    const { data: p } = await supabase
      .from('products')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single()
    if (p) resolvedProductId = p.id
  }

  if (!resolvedProductId) {
    return NextResponse.json({ error: 'No active product found' }, { status: 400 })
  }

  const { data: product } = await supabase
    .from('products')
    .select('selling_price, product_cost, packaging_cost, delivery_cost_casa, call_center_cost')
    .eq('id', resolvedProductId)
    .single()

  // Skip duplicate phone for same product — allow re-entry if previous order was closed
  const CLOSED_STATUSES = ['cancelled', 'postponed', 'wrong_number', 'duplicate', 'returned']
  const cleanPhone = String(customer_phone || '').trim()
  if (cleanPhone) {
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('customer_phone', cleanPhone)
      .eq('product_id', resolvedProductId)
      .not('status', 'in', `(${CLOSED_STATUSES.map(s => `"${s}"`).join(',')})`)
      .limit(1)
      .single()
    if (existing) {
      return NextResponse.json({ action: 'skipped', reason: 'doublon', phone: cleanPhone })
    }
  }

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      media_buyer_id: buyer.id,
      product_id: resolvedProductId,
      status: 'lead',
      selling_price: product?.selling_price ?? 0,
      product_cost: product?.product_cost ?? 0,
      packaging_cost: product?.packaging_cost ?? 0,
      delivery_cost: 20,
      call_center_cost: 5,
      ad_spend: Number(ad_spend) || 0,
      campaign_name: campaign_name || null,
      ad_platform: ad_platform || 'other',
      customer_name: customer_name || null,
      customer_phone: String(customer_phone || '').trim() || null,
      city: city || null,
      notes: notes || null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, order_id: order.id })
}
