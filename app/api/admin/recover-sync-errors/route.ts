import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: errors } = await supabase
    .from('sync_errors')
    .select('*')
    .eq('resolved', false)
    .order('created_at', { ascending: true })

  if (!errors || errors.length === 0) {
    return NextResponse.json({ message: 'Aucune erreur à récupérer', recovered: 0 })
  }

  let recovered = 0
  let stillFailing = 0

  for (const err of errors) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.filbos.com'}/api/webhook/sheet-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sync-secret': process.env.SHEET_SYNC_SECRET || '',
        },
        body: JSON.stringify(err.payload),
      })
      const json = await res.json()

      if (res.ok || json.action === 'skipped') {
        await supabase.from('sync_errors').update({ resolved: true }).eq('id', err.id)
        recovered++
      } else {
        stillFailing++
      }
    } catch {
      stillFailing++
    }
  }

  return NextResponse.json({
    total: errors.length,
    recovered,
    stillFailing,
  })
}
