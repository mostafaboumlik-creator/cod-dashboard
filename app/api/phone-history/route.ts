import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone requis' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: orders } = await supabase
    .from('orders')
    .select('id, status')
    .eq('customer_phone', phone)

  if (!orders || orders.length === 0) {
    return NextResponse.json({ total: 0, delivered: 0, returned: 0, cancelled: 0, confirmed: 0 })
  }

  const total     = orders.length
  const delivered = orders.filter(o => o.status === 'delivered').length
  const returned  = orders.filter(o => o.status === 'returned').length
  const cancelled = orders.filter(o => o.status === 'cancelled').length
  const confirmed = orders.filter(o => o.status === 'confirmed').length

  return NextResponse.json({ total, delivered, returned, cancelled, confirmed })
}
