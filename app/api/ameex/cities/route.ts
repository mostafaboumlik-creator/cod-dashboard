import { NextResponse } from 'next/server'
import { AMEEX_CITY_LIST } from '@/lib/ameex-cities'

const CANDIDATE_URLS = [
  'https://api.ameex.app/customer/Delivery/Cities',
  'https://api.ameex.app/customer/Delivery/Cities/List',
  'https://api.ameex.app/customer/Delivery/Cities/Action/Type/List',
  'https://api.ameex.app/customer/Delivery/Villes',
  'https://api.ameex.app/customer/Delivery/Villes/Action/Type/List',
  'https://api.ameex.app/customer/Villes',
  'https://api.ameex.app/customer/Cities',
  'https://api.ameex.app/customer/Delivery/Parcels/Cities',
  'https://api.ameex.app/customer/Delivery/Cities/Action/Type/All',
  'https://api.ameex.app/customer/Livraison/Villes',
]

function normalize(raw: any): { id: number; name: string }[] {
  const list: any[] = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)                     ? raw.data
    : Array.isArray(raw?.cities)                   ? raw.cities
    : Array.isArray(raw?.villes)                   ? raw.villes
    : Array.isArray(raw?.result)                   ? raw.result
    : Array.isArray(raw?.items)                    ? raw.items
    : []
  return list
    .map((c: any) => ({
      id:   c.id   ?? c.ID   ?? c.city_id  ?? c.CityId ?? c.cityId,
      name: c.name ?? c.NAME ?? c.city_name ?? c.ville ?? c.Ville ?? c.label ?? c.Label,
    }))
    .filter(c => c.id != null && c.name)
}

export async function GET() {
  const ameexId  = process.env.AMEEX_API_ID
  const ameexKey = process.env.AMEEX_API_KEY

  if (ameexId && ameexKey) {
    for (const url of CANDIDATE_URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'C-Api-Id': ameexId, 'C-Api-Key': ameexKey },
          cache: 'no-store',
        })
        if (!res.ok) continue
        const raw = await res.json()
        const cities = normalize(raw)
        if (cities.length > 0) {
          return NextResponse.json(cities)
        }
      } catch { continue }
    }
  }

  // Fallback: static list
  return NextResponse.json(AMEEX_CITY_LIST)
}

export async function POST(request: Request) {
  // Debug: returns the raw response from each candidate URL
  const ameexId  = process.env.AMEEX_API_ID
  const ameexKey = process.env.AMEEX_API_KEY
  if (!ameexId || !ameexKey) return NextResponse.json({ error: 'no config' }, { status: 500 })

  const results: Record<string, any> = {}
  for (const url of CANDIDATE_URLS) {
    try {
      const res = await fetch(url, {
        headers: { 'C-Api-Id': ameexId, 'C-Api-Key': ameexKey },
        cache: 'no-store',
      })
      const text = await res.text()
      results[url] = { status: res.status, body: text.slice(0, 300) }
    } catch (e: any) {
      results[url] = { error: e.message }
    }
  }
  return NextResponse.json(results)
}
