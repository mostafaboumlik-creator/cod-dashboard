import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const access_token = body?.access_token
  if (!access_token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

  // Verify the token is valid by fetching the user
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: { user }, error: userError } = await anonClient.auth.getUser(access_token)
  if (userError || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  // Service role key bypasses RLS — no infinite recursion
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ role: profile?.role ?? null })
}
