import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ameexId    = process.env.AMEEX_API_ID
  const ameexKey   = process.env.AMEEX_API_KEY

  if (!serviceKey || !ameexId || !ameexKey) {
    return NextResponse.json({ error: 'Config Ameex manquante (AMEEX_API_ID / AMEEX_API_KEY)' }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body invalide' }, { status: 400 })

  const { orderId, cityId, cityName, openParcel, address: addressOverride, phone: phoneOverride, customerName: nameOverride } = body
  if (!orderId || !cityId) {
    return NextResponse.json({ error: 'orderId et cityId requis' }, { status: 400 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: order, error: findErr } = await supabase
    .from('orders')
    .select('id, status, customer_name, customer_phone, address1, notes, selling_price, product_variant, products(name)')
    .eq('id', orderId)
    .single()

  if (findErr || !order) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  const formData = new URLSearchParams()
  formData.append('type',     'SIMPLE')
  formData.append('business', ameexId)
  formData.append('replace',  'false')
  formData.append('open',     openParcel === false ? 'NO' : 'YES')
  formData.append('fragile',  '0')
  formData.append('receiver', nameOverride || order.customer_name || '')
  formData.append('phone',    phoneOverride || order.customer_phone || '')
  formData.append('city',     String(cityId))
  formData.append('address',  addressOverride || order.address1 || '')
  formData.append('cod',      String(order.selling_price || 0))
  formData.append('product',  (order.products as any)?.name || '')
  if (order.notes) formData.append('comment', order.notes)
  if (order.product_variant) formData.append('order_num', order.product_variant)

  const ameexRes = await fetch('https://api.ameex.app/customer/Delivery/Parcels/Action/Type/Add', {
    method: 'POST',
    headers: {
      'C-Api-Id':  ameexId,
      'C-Api-Key': ameexKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  })

  const responseText = await ameexRes.text()
  let responseData: any = {}
  try { responseData = JSON.parse(responseText) } catch { responseData = { raw: responseText } }

  if (!ameexRes.ok) {
    return NextResponse.json({ error: 'Erreur Ameex', details: responseData, raw: responseText }, { status: 400 })
  }

  // Log full Ameex response for debugging
  console.log('AMEEX_RESPONSE:', JSON.stringify(responseData))

  // Ameex returns HTTP 200 but api.type=error on validation failures
  if (responseData?.api?.type === 'error') {
    return NextResponse.json({
      error: responseData.api.msg || 'Erreur Ameex',
      details: responseData,
    }, { status: 400 })
  }

  // Scan entire response recursively for Ameex tracking code pattern (e.g. CSA0526B..., RBT0526B...)
  function findCode(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && /^[A-Z]{2,4}\d{4}[A-Z0-9]{8,}$/.test(val)) return val
      const nested = findCode(val)
      if (nested) return nested
    }
    return null
  }

  const trackingCode =
    responseData?.api?.code || responseData?.api?.CODE ||
    responseData?.code      || responseData?.CODE      ||
    findCode(responseData)  || null

  console.log('EXTRACTED_TRACKING_CODE:', trackingCode, 'FULL_API:', JSON.stringify(responseData?.api))

  // Auto-confirm if not already confirmed/delivered
  const shouldConfirm = !['confirmed', 'delivered', 'returned'].includes(order.status)

  const finalAddress = addressOverride?.trim() || order.address1

  await supabase.from('orders').update({
    ameex_sent_at: new Date().toISOString(),
    ...(trackingCode ? { tracking_code: trackingCode } : {}),
    ...(shouldConfirm ? { status: 'confirmed', confirmed_at: new Date().toISOString() } : {}),
    ...(finalAddress && finalAddress !== order.address1 ? { address1: finalAddress } : {}),
    ...(cityName ? { city: cityName } : {}),
    ...(phoneOverride && phoneOverride !== order.customer_phone ? { customer_phone: phoneOverride } : {}),
    ...(nameOverride && nameOverride !== order.customer_name ? { customer_name: nameOverride } : {}),
  }).eq('id', orderId)

  return NextResponse.json({
    success: true,
    tracking_code: trackingCode,
    auto_confirmed: shouldConfirm,
    ameex_response: responseData,
  })
}
