import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const JAMLA_PRODUCT_ID = 'c0a1618b-75b9-4b0b-8d22-058757a79bba'

export type ClientRelance = {
  phone: string
  name: string | null
  city: string | null
  address1: string | null
  customer_type: 'jamla' | 'pro' | 'perso' | null
  last_delivered_at: string | null
  last_product_name: string | null
  last_product_id: string | null
  last_quantity: number | null
  last_packs: number | null
  total_delivered: number
  delivered_products: { product_id: string; name: string }[]
}

export function buildRelanceList(orders: any[]): ClientRelance[] {
  const byPhone = new Map<string, any[]>()
  for (const o of orders) {
    const phone = (o.customer_phone || '').trim()
    if (!phone) continue
    if (!byPhone.has(phone)) byPhone.set(phone, [])
    byPhone.get(phone)!.push(o)
  }

  const result: ClientRelance[] = []

  for (const [phone, rows] of byPhone) {
    // Sort ascending by created_at for chronological customer_type lookup
    rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))

    const deliveredRows = rows.filter(r => r.status === 'delivered')
    if (deliveredRows.length === 0) continue

    // Last delivered order: highest delivered_at (fallback: created_at)
    const lastDelivered = deliveredRows.reduce((best, r) => {
      const bScore = best.delivered_at || best.created_at || ''
      const rScore = r.delivered_at || r.created_at || ''
      return rScore > bScore ? r : best
    })

    // current_customer_type: last non-null value (rows already sorted ASC → iterate DESC)
    let current_customer_type: 'jamla' | 'pro' | 'perso' | null = null
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].customer_type != null) {
        current_customer_type = rows[i].customer_type
        break
      }
    }

    // Packs for last delivered order
    const packSize: number | null = lastDelivered.products?.pack_size ?? null
    const lastQty: number | null = lastDelivered.quantity ?? null
    const lastPacks = packSize && lastQty != null ? Math.floor(lastQty / packSize) : null

    // delivered_products: unique by product_id across ALL delivered orders
    const seenProducts = new Map<string, string>()
    for (const r of deliveredRows) {
      const pid: string | null = r.product_id
      const pname: string | null = r.products?.name
      if (pid && pname && !seenProducts.has(pid)) seenProducts.set(pid, pname)
    }
    const delivered_products = Array.from(seenProducts.entries()).map(([product_id, name]) => ({ product_id, name }))

    result.push({
      phone,
      name: lastDelivered.customer_name ?? null,
      city: lastDelivered.city ?? null,
      address1: lastDelivered.address1 ?? null,
      customer_type: current_customer_type,
      last_delivered_at: lastDelivered.delivered_at ?? null,
      last_product_name: lastDelivered.products?.name ?? null,
      last_product_id: lastDelivered.product_id ?? null,
      last_quantity: lastQty,
      last_packs: lastPacks,
      total_delivered: deliveredRows.length,
      delivered_products,
    })
  }

  // Sort by last_delivered_at DESC (nulls last)
  result.sort((a, b) => {
    if (!a.last_delivered_at && !b.last_delivered_at) return 0
    if (!a.last_delivered_at) return 1
    if (!b.last_delivered_at) return -1
    return b.last_delivered_at.localeCompare(a.last_delivered_at)
  })

  return result
}

export async function GET(_request: NextRequest) {
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

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, customer_phone, customer_name, city, address1, status, delivered_at, created_at, customer_type, quantity, product_id, products(name, pack_size)')
    .eq('product_id', JAMLA_PRODUCT_ID)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(buildRelanceList(orders || []))
}
