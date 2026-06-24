import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cells.push(current.trim())
    rows.push(cells)
  }
  return rows
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function detectColumn(headers: string[], keywords: string[]): number {
  const lower = headers.map(h => normalize(h))
  for (const kw of keywords) {
    const idx = lower.findIndex(h => h.includes(kw))
    if (idx !== -1) return idx
  }
  return -1
}

// Parse dates in DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, or DD-MM-YYYY formats
function parseRowDate(raw: string): Date | null {
  if (!raw) return null
  const s = raw.trim()
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`)
  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (ymd) return new Date(`${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`)
  // MM/DD/YYYY fallback
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return new Date(`${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`)
  return null
}

// Maps CABLE STICKY / common Google Sheet ETAT values to platform statuses
function mapEtat(etat: string): string {
  const v = normalize(etat)
  if (v.includes('confirme') || v.includes('confirm')) return 'confirmed'
  if (v.includes('pas de reponse') || v.includes('pas reponse')) return 'no_reply'
  if (v.includes('boite vocale') || v.includes('boite')) return 'unreachable'
  if (v.includes('a coupe') || v.includes('coupe')) return 'unreachable'
  if (v.includes('injoignable')) return 'unreachable'
  if (v.includes('annule') || v.includes('annul')) return 'cancelled'
  if (v.includes('pas interesse') || v.includes('interesse')) return 'cancelled'
  if (v.includes('black list') || v.includes('blacklist')) return 'cancelled'
  if (v.includes('reporte') || v.includes('rappeler') || v.includes('planifie')) return 'call_later'
  if (v.includes('numero incorrect') || v.includes('faux numero') || v.includes('mauvais')) return 'wrong_number'
  if (v.includes('doublon') || v.includes('double') || v.includes('doubel')) return 'duplicate'
  if (v.includes('livre') || v.includes('livr')) return 'delivered'
  if (v.includes('retour')) return 'returned'
  if (v.includes('en cours') || v.includes('en attente')) return 'lead'
  return 'lead' // default for empty or unknown values
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
  if (adminProfile?.role !== 'admin') return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service key manquante' }, { status: 500 })

  const body = await request.json()
  const { sheet_url, buyer_id, product_id, campaign_name, ad_platform, date_from } = body

  const match = sheet_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return NextResponse.json({ error: 'URL Google Sheet invalide' }, { status: 400 })

  const sheetId = match[1]
  const gidMatch = sheet_url.match(/[?&#]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : null
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}`

  let csvText: string
  try {
    const res = await fetch(csvUrl)
    if (!res.ok) throw new Error('Sheet inaccessible')
    csvText = await res.text()
  } catch {
    return NextResponse.json({
      error: 'Impossible de lire la sheet. Verifiez que le partage est "Tout le monde avec le lien" en lecture.'
    }, { status: 400 })
  }

  const rows = parseCSV(csvText)
  if (rows.length < 2) return NextResponse.json({ error: 'Sheet vide ou sans donnees' }, { status: 400 })

  const headers = rows[0]
  const dataRows = rows.slice(1)

  const colOrderId  = detectColumn(headers, ['order id', 'order_id', 'orderid', 'id commande', 'numero commande'])
  const colName     = detectColumn(headers, ['full name', 'nom complet', 'nom', 'name', 'client', 'prenom', 'first'])
  const colPhone    = detectColumn(headers, ['tel', 'phone', 'mobile', 'numero', 'gsm', 'portable'])
  const colCity     = detectColumn(headers, ['ville', 'city', 'localite', 'region'])
  const colNotes    = detectColumn(headers, ['notes', 'remarque', 'commentaire', 'message'])
  const colEtat     = detectColumn(headers, ['etat', 'statut', 'status', 'état'])
  const colDate     = detectColumn(headers, ['order date', 'date', 'created', 'timestamp', 'heure', 'horodateur'])
  const colVariant  = detectColumn(headers, ['product variant', 'variant', 'variante', 'formule', 'option'])
  const colVPrice   = detectColumn(headers, ['variant price', 'variant_price', 'prix variante', 'unit price'])
  const colAddress1 = detectColumn(headers, ['address 1', 'address1', 'adresse 1', 'adresse1', 'adresse', 'address'])
  const colAddress2 = detectColumn(headers, ['address 2', 'address2', 'adresse 2', 'adresse2'])

  if (colPhone === -1) {
    return NextResponse.json({
      error: `Colonne telephone introuvable. Colonnes detectees: ${headers.join(', ')}`
    }, { status: 400 })
  }

  const { data: product } = await supabase
    .from('products')
    .select('selling_price, product_cost, packaging_cost')
    .eq('id', product_id)
    .single()

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Load existing phones for this product to avoid duplicates
  const { data: existingOrders } = await adminClient
    .from('orders')
    .select('customer_phone')
    .eq('product_id', product_id)

  const existingPhones = new Set(
    (existingOrders || []).map(o => o.customer_phone?.trim().replace(/\s/g, ''))
  )

  const filterDate = date_from ? new Date(date_from) : null

  let imported = 0
  let skipped = 0
  let duplicates = 0
  let filtered = 0
  const statusCounts: Record<string, number> = {}

  for (const row of dataRows) {
    const phone = (colPhone !== -1 ? row[colPhone]?.trim() : '').replace(/\s/g, '')
    if (!phone) { skipped++; continue }

    // Date filter — skip rows with no parseable date when filter is active
    if (filterDate && colDate !== -1) {
      const rowDate = parseRowDate(row[colDate] || '')
      if (!rowDate || rowDate < filterDate) { filtered++; continue }
    }

    if (existingPhones.has(phone)) { duplicates++; continue }

    const rawEtat = colEtat !== -1 ? row[colEtat]?.trim() || '' : ''
    const status = rawEtat ? mapEtat(rawEtat) : 'lead'

    statusCounts[status] = (statusCounts[status] || 0) + 1

    const variantPrice = colVPrice !== -1 ? Number(row[colVPrice]?.trim()) || null : null

    const { error } = await adminClient.from('orders').insert({
      media_buyer_id: buyer_id,
      product_id,
      status,
      selling_price: variantPrice ?? product?.selling_price ?? 0,
      product_cost: product?.product_cost ?? 0,
      packaging_cost: product?.packaging_cost ?? 0,
      delivery_cost: 20,
      call_center_cost: 5,
      campaign_name: campaign_name || null,
      ad_platform: ad_platform || 'other',
      customer_name: colName !== -1 ? row[colName]?.trim() || null : null,
      customer_phone: phone,
      city: colCity !== -1 ? row[colCity]?.trim() || null : null,
      notes: colNotes !== -1 ? row[colNotes]?.trim() || null : null,
      product_variant: colVariant !== -1 ? row[colVariant]?.trim() || null : null,
      address1: colAddress1 !== -1 ? row[colAddress1]?.trim() || null : null,
      address2: colAddress2 !== -1 ? row[colAddress2]?.trim() || null : null,
      youcan_order_id: colOrderId !== -1 ? row[colOrderId]?.trim() || null : null,
    })

    if (error) { skipped++; statusCounts[status] = (statusCounts[status] || 1) - 1 }
    else { imported++; existingPhones.add(phone) }
  }

  return NextResponse.json({ imported, skipped, duplicates, filtered, total: dataRows.length, statusCounts })
}
