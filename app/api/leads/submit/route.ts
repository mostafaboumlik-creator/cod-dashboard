import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { product_id, buyer_id, customer_name, customer_phone, city } = body

  if (!product_id || !customer_name || !customer_phone || !city) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Configuration manquante' }, { status: 500 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: product } = await supabase
    .from('products')
    .select('selling_price, product_cost, packaging_cost')
    .eq('id', product_id)
    .eq('is_active', true)
    .single()

  if (!product) return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })

  const { error } = await supabase.from('orders').insert({
    product_id,
    media_buyer_id: buyer_id || null,
    customer_name,
    customer_phone,
    city,
    status: 'lead',
    selling_price: product.selling_price,
    product_cost: product.product_cost,
    packaging_cost: product.packaging_cost,
    delivery_cost: 20,
    call_center_cost: 5,
    ad_spend: 0,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
