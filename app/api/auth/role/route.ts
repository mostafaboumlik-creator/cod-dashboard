import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const access_token = body?.access_token
  if (!access_token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

  // Decode JWT to get user ID (no network call needed)
  let userId: string | null = null
  try {
    const parts = String(access_token).split('.')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    userId = payload.sub ?? null
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }
  if (!userId) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Essai 1 : lire depuis auth.users (table auth, pas de RLS publique)
  // auth.admin.getUserById utilise la clé service role → bypass total des policies
  try {
    const { data: { user } } = await adminClient.auth.admin.getUserById(userId)
    if (user) {
      const role = (user.user_metadata?.role || user.app_metadata?.role) as string | undefined
      if (role) return NextResponse.json({ role })
    }
  } catch { /* ignore, essai suivant */ }

  // Essai 2 : lire depuis profiles avec service role (bypass RLS)
  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ role: profile?.role ?? null })
}
