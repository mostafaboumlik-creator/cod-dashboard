import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// Extract customer info from various YouCan payload shapes
function parseYouCanOrder(body: any): {
  customerName: string
  customerPhone: string
  city: string
  productName: string
  sellingPrice: number
  youcanOrderId: string
} | null {
  try {
    // YouCan wraps payload in either body.data or body.payload or directly
    const order = body.data ?? body.payload ?? body.order ?? body

    // Customer - YouCan may use customer.name or customer.first_name + last_name
    const customer = order.customer ?? order.billing ?? {}
    const customerName =
      customer.name ||
      `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
      'N/A'

    const customerPhone =
      customer.phone ||
      customer.telephone ||
      customer.mobile ||
      order.phone ||
      ''

    // City
    const address = customer.address ?? customer.shipping_address ?? customer ?? {}
    const city =
      address.city ||
      address.ville ||
      customer.city ||
      order.city ||
      ''

    // Product — take first line item
    const items = order.line_items ?? order.items ?? order.products ?? []
    const firstItem = Array.isArray(items) ? items[0] : items
    const productName =
      firstItem?.name ||
      firstItem?.title ||
      firstItem?.product_title ||
      firstItem?.product_name ||
      order.product_name ||
      ''

    const sellingPrice =
      Number(order.total ?? order.subtotal ?? firstItem?.price ?? 0)

    const youcanOrderId =
      String(order.id ?? order.order_id ?? order.reference ?? body.id ?? '')

    if (!customerPhone) return null

    return { customerName, customerPhone, city, productName, sellingPrice, youcanOrderId }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  let body: any
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text()
    body = Object.fromEntries(new URLSearchParams(text))
  } else {
    body = await request.json().catch(() => ({}))
  }

  // Log raw payload in dev for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('[YouCan Webhook] raw payload:', JSON.stringify(body, null, 2))
  }

  // Ignore non-order events (YouCan may send order:updated, order:paid, etc.)
  const event = body.event ?? body.type ?? ''
  if (event && !event.includes('order') && !event.includes('created')) {
    return NextResponse.json({ received: true, action: 'ignored', event })
  }

  const parsed = parseYouCanOrder(body)
  if (!parsed) {
    return NextResponse.json({ error: 'Payload invalide ou telephone manquant', body }, { status: 400 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Match product by name (case-insensitive)
  const { data: products } = await supabase
    .from('products')
    .select('id, name, selling_price, product_cost, packaging_cost')
    .eq('is_active', true)

  const matchedProduct = (products || []).find(p =>
    p.name.toLowerCase().trim() === parsed.productName.toLowerCase().trim()
  ) ?? null

  const { error } = await supabase.from('orders').insert({
    product_id: matchedProduct?.id ?? null,
    media_buyer_id: null, // admin assigns later
    customer_name: parsed.customerName,
    customer_phone: parsed.customerPhone,
    city: parsed.city,
    status: 'lead',
    selling_price: matchedProduct?.selling_price ?? parsed.sellingPrice,
    product_cost: matchedProduct?.product_cost ?? 0,
    packaging_cost: matchedProduct?.packaging_cost ?? 0,
    delivery_cost: 20,
    call_center_cost: 5,
    notes: `YouCan #${parsed.youcanOrderId}`,
    ad_platform: 'other',
  })

  if (error) {
    console.error('[YouCan Webhook] insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    customer: parsed.customerName,
    phone: parsed.customerPhone,
    product_matched: matchedProduct?.name ?? null,
  })
}
