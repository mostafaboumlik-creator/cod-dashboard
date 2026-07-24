import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const access_token = body?.access_token
  if (!access_token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

  // Decode JWT to get user ID without making an extra Supabase API call
  let userId: string | null = null
  try {
    const parts = String(access_token).split('.')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    userId = payload.sub ?? null
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  if (!userId) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  // Service role key bypasses RLS entirely — no infinite recursion possible
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ role: profile?.role ?? null })
}
