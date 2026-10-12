import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const VALID_RESULTS = new Set(['no_answer', 'callback', 'not_interested', 'interested', 'order_obtained'])

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

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body invalide' }, { status: 400 })

  const { customer_phone, result, notes, next_followup_at } = body

  if (!customer_phone || typeof customer_phone !== 'string' || !customer_phone.trim()) {
    return NextResponse.json({ error: 'Téléphone requis' }, { status: 400 })
  }
  if (!result || !VALID_RESULTS.has(result)) {
    return NextResponse.json({ error: 'Résultat invalide' }, { status: 400 })
  }

  let parsedNextFollowup: string | null = null
  if (result === 'callback' && next_followup_at) {
    try {
      parsedNextFollowup = new Date(next_followup_at).toISOString()
    } catch {
      return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
    }
  }

  const { error } = await supabase.from('customer_followups').insert({
    customer_phone: String(customer_phone).trim().replace(/\s/g, ''),
    agent_id: session.user.id,
    result,
    notes: notes ? String(notes).trim() || null : null,
    next_followup_at: parsedNextFollowup,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
