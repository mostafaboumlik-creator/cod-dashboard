import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone requis' }, { status: 400 })

  const authKey = process.env.AMEEX_AUTH_KEY
  if (!authKey) return NextResponse.json({ error: 'AMEEX_AUTH_KEY manquant' }, { status: 500 })

  try {
    const res = await fetch('https://api.ameex.app/customer/Delivery/Parcels/PhoneSearch', {
      method: 'POST',
      headers: {
        'C-Auth-Key': authKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://c.ameex.app',
        'Referer': 'https://c.ameex.app/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: new URLSearchParams({ phone }).toString(),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => null)
    console.log('PhoneSearch:', JSON.stringify(data))
    if (res.ok && data?.login === 'success') {
      return NextResponse.json({ source: 'ameex', api: data.api })
    }
    return NextResponse.json({ error: 'Auth expirée — renouveler AMEEX_AUTH_KEY', raw: data }, { status: 401 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
