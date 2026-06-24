import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const { orderId, ...fields } = body

  if (!orderId) return NextResponse.json({ error: 'orderId requis' }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Build update object from all provided fields
  const update: any = {}
  if (fields.status !== undefined) update.status = fields.status
  if (fields.confirmedBy) update.confirmed_by = fields.confirmedBy
  if (fields.status === 'confirmed') update.confirmed_at = new Date().toISOString()
  if (fields.second_contact !== undefined) update.second_contact = fields.second_contact || null
  if (fields.day1_contact !== undefined) update.day1_contact = fields.day1_contact || null
  if (fields.notes !== undefined) update.notes = fields.notes || null
  if (fields.address1 !== undefined) update.address1 = fields.address1 || null
  if (fields.customer_phone !== undefined) update.customer_phone = fields.customer_phone
  if (fields.customer_name !== undefined) update.customer_name = fields.customer_name
  if (fields.product_variant !== undefined) update.product_variant = fields.product_variant || null
  if (fields.selling_price !== undefined) update.selling_price = fields.selling_price

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  const { error } = await supabase.from('orders').update(update).eq('id', orderId)
  if (error) {
    console.error('Order update error:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, updated: update })
}
