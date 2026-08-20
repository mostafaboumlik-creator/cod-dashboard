import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

function detectPlatform(name: string): 'facebook' | 'tiktok' | 'youtube' | 'other' {
  const n = name.toLowerCase().replace(/\s+/g, ' ')
  if (n.includes(' fb') || n.endsWith('fb') || n.startsWith('fb ') || n.includes('facebook')) return 'facebook'
  if (n.includes(' tk') || n.endsWith('tk') || n.startsWith('tk ') || n.includes('tiktok') || n.startsWith('tt ') || n.includes(' tt') || n.includes('tkt') || n.includes(' tik')) return 'tiktok'
  if (n.includes(' yt') || n.endsWith('yt') || n.startsWith('yt ') || n.includes('youtube')) return 'youtube'
  return 'other'
}

function mapEtat(etat: string): string {
  const v = etat.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (v.includes('confirme') || v.includes('confirm')) return 'confirmed'
  if (v.includes('pas de reponse') || v.includes('pas reponse')) return 'no_reply'
  if (v.includes('boite vocale') || v.includes('boite')) return 'unreachable'
  if (v.includes('a coupe') || v.includes('coupe')) return 'unreachable'
  if (v.includes('injoignable')) return 'unreachable'
  if (v.includes('annule') || v.includes('annul')) return 'cancelled'
  if (v.includes('pas interesse') || v.includes('interesse')) return 'cancelled'
  if (v.includes('black list') || v.includes('blacklist')) return 'cancelled'
  if (v.includes('reporte') || v.includes('rappeler')) return 'call_later'
  if (v.includes('numero incorrect') || v.includes('faux numero')) return 'wrong_number'
  if (v.includes('doublon') || v.includes('doubel')) return 'duplicate'
  return 'lead'
}

// Extract first number from variant string (e.g. "باك 120 قطعة" → 120, "باك 5 قطع" → 5)
function extractPackQty(variant: string): number {
  const match = variant.match(/\d+/)
  return match ? parseInt(match[0], 10) : 1
}

// Retire fb/tt/yt/tk en début ou fin pour comparer les noms de produits cross-plateforme
// Normalise aussi les apostrophes typographiques et symboles ™/®
function stripPlatformTag(name: string): string {
  // Filtre par code Unicode explicite pour éviter tout problème d’encodage
  const SKIP = new Set([
    0x0027, 0x2018, 0x2019, 0x02BC, 0x0060, 0x00B4, // apostrophes
    0x2122, 0x00AE, 0x00A9,                            // ™ ® ©
  ])
  const cleaned = name.split(‘’).filter(c => !SKIP.has(c.codePointAt(0)!)).join(‘’)
  return cleaned
    .toLowerCase()
    .trim()
    .replace(/^(fb|tt|tk|yt|tkt|tiktok|facebook|youtube)\s*/i, ‘’)
    .replace(/\s*(fb|tt|tk|yt|tkt|tiktok|facebook|youtube)$/i, ‘’)
    .replace(/\s+/g, ‘’)
}

// Levenshtein distance — fuzzy fallback pour typos (henger/hanger, etc.)
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

function isCasablanca(city: string): boolean {
  const c = city.toLowerCase().trim()
  return c.includes('casa') || c.includes('الدار البيضاء') || c.includes('دار البيضاء') || c === 'bida' || c === 'bda'
}

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Config manquante' }, { status: 500 })

  const secret = process.env.SHEET_SYNC_SECRET
  if (secret) {
    const provided = request.headers.get('x-sync-secret') || new URL(request.url).searchParams.get('secret')
    if (provided !== secret) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body invalide' }, { status: 400 })

  const {
    api_key, product_id,
    phone, full_name, city,
    product_variant, variant_price,
    address1, address2,
    etat, youcan_order_id,
    product_name, youcan_created_at,
  } = body

  const cleanPhone = String(phone || '').trim().replace(/\s/g, '')
  if (!cleanPhone || !api_key) {
    return NextResponse.json({ error: 'phone et api_key requis' }, { status: 400 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Resolve buyer from api_key
  const { data: buyerProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('api_key', String(api_key).trim())
    .single()

  const buyer_id = buyerProfile?.id ?? null

  // Resolve product_id: use provided ID, or find by partial name match
  let resolvedProductId = product_id || null
  let product: any = null

  if (resolvedProductId) {
    const { data } = await supabase
      .from('products')
      .select('id,name,selling_price,product_cost,packaging_cost,unit_cost,selling_type,delivery_cost_casa,call_center_cost,sheet_sync_active')
      .eq('id', resolvedProductId)
      .single()
    product = data
  }

  // Fallback: search by name contained in product_name from sheet
  if (!product && product_name) {
    const { data: allProducts } = await supabase
      .from('products')
      .select('id,name,selling_price,product_cost,packaging_cost,unit_cost,selling_type,delivery_cost_casa,call_center_cost,sheet_sync_active')
      .eq('is_active', true)

    if (allProducts) {
      const sheetName = stripPlatformTag(String(product_name))
      // Pass 1: exact substring match
      let matched = allProducts.find(p => {
        const dbName = stripPlatformTag(p.name)
        return sheetName.includes(dbName) || dbName.includes(sheetName)
      })
      // Pass 2: fuzzy Levenshtein ≤ 2 — handles typos like "henger"/"hanger"
      if (!matched && sheetName.length >= 4) {
        matched = allProducts.find(p => {
          const dbName = stripPlatformTag(p.name)
          if (Math.abs(sheetName.length - dbName.length) > 3) return false
          return levenshtein(sheetName, dbName) <= 2
        })
      }
      if (matched) {
        product = matched
        resolvedProductId = matched.id
      }
    }
  }

  // Pass 3: historical campaign_name lookup — handles Arabic sheet names that were previously
  // synced via hardcoded PRODUCT_ID. Reuses the product_id from past matching orders.
  if (!product && product_name) {
    const rawName = String(product_name).trim()
    const { data: pastOrders } = await supabase
      .from('orders')
      .select('product_id')
      .eq('campaign_name', rawName)
      .not('product_id', 'is', null)
      .limit(1)
    const pastProductId = pastOrders?.[0]?.product_id
    if (pastProductId) {
      const { data: pastProd } = await supabase
        .from('products')
        .select('id,name,selling_price,product_cost,packaging_cost,unit_cost,selling_type,delivery_cost_casa,call_center_cost,sheet_sync_active')
        .eq('id', pastProductId)
        .eq('is_active', true)
        .limit(1)
      if (pastProd?.[0]) {
        product = pastProd[0]
        resolvedProductId = pastProd[0].id
      }
    }
  }

  if (!resolvedProductId || !product) {
    // Logger l'erreur pour pouvoir récupérer le lead plus tard
    await supabase.from('sync_errors').insert({
      youcan_order_id: String(youcan_order_id || '').trim() || null,
      phone: cleanPhone,
      product_name: String(product_name || ''),
      payload: body,
      error_reason: 'produit_introuvable',
    }).then(() => {})
    return NextResponse.json({ error: 'Produit introuvable', product_name }, { status: 404 })
  }

  // Duplicate check: use youcan_order_id as primary key (prevents re-sending same order)
  // Never block by phone alone — same customer can place a new Youcan order
  const cleanOrderId = String(youcan_order_id || '').trim()
  if (cleanOrderId) {
    const { data: existingById } = await supabase
      .from('orders')
      .select('id')
      .eq('youcan_order_id', cleanOrderId)
      .eq('product_id', resolvedProductId)
      .single()
    if (existingById) {
      return NextResponse.json({ action: 'skipped', reason: 'doublon_order_id', youcan_order_id: cleanOrderId })
    }
  }

  // Respect the sheet sync toggle — undefined means column not yet added → allow
  if (product?.sheet_sync_active === false) {
    return NextResponse.json({ action: 'skipped', reason: 'sheet_sync_paused', phone: cleanPhone })
  }

  const status = etat ? mapEtat(String(etat)) : 'lead'
  const sellingPrice = Number(variant_price) || product?.selling_price || 0

  // Calculate product cost: if pack product with unit_cost set, multiply by qty from variant
  const variantStr = String(product_variant || '').trim()
  let productCost = product?.product_cost ?? 0
  if (product?.selling_type === 'pack' && product?.unit_cost > 0 && variantStr) {
    const qty = extractPackQty(variantStr)
    productCost = product.unit_cost * qty
  }

  // Détermine la vraie date de création de la commande.
  // Priorité 1 : date envoyée par Apps Script (youcan_created_at)
  // Priorité 2 : inférence automatique — si l'ID Youcan est bien plus ancien que les commandes déjà en DB,
  //              c'est une commande ancienne re-synchée (ex: resetBack100). On lui donne la date
  //              du jour précédant la commande la plus proche avec un ID supérieur.
  let orderCreatedAt: string | undefined

  if (youcan_created_at) {
    const d = new Date(String(youcan_created_at))
    if (!isNaN(d.getTime())) orderCreatedAt = d.toISOString()
  } else if (cleanOrderId) {
    const thisNum = parseInt(cleanOrderId, 10)
    if (!isNaN(thisNum)) {
      const { data: recentRows } = await supabase
        .from('orders')
        .select('youcan_order_id, created_at')
        .not('youcan_order_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (recentRows && recentRows.length > 0) {
        // Filtre uniquement les IDs au format Youcan (courts, < 100000) pour éviter que
        // les IDs Storeep (18 chiffres) faussent le calcul du maxNum
        const parsed = recentRows
          .map(o => ({ num: parseInt(o.youcan_order_id!, 10), created_at: o.created_at as string }))
          .filter(o => !isNaN(o.num) && o.num > 0 && o.num < 100_000)

        if (parsed.length > 0) {
          const maxNum = Math.max(...parsed.map(o => o.num))

          // Si l'ID est 10+ en dessous du max → commande ancienne re-synchée via resetBack100
          if (maxNum - thisNum >= 10) {
            const closestNewer = parsed
              .filter(o => o.num > thisNum)
              .sort((a, b) => a.num - b.num)[0]

            if (closestNewer) {
              const d = new Date(closestNewer.created_at)
              d.setDate(d.getDate() - 1)
              orderCreatedAt = d.toISOString()
            }
          }
        }
      }
    }
  }

  const { error } = await supabase.from('orders').insert({
    media_buyer_id: buyer_id || null,
    product_id: resolvedProductId,
    status,
    selling_price: sellingPrice,
    product_cost: productCost,
    packaging_cost: product?.packaging_cost ?? 0,
    delivery_cost: isCasablanca(String(city || '')) ? (product?.delivery_cost_casa ?? 20) : 35,
    call_center_cost: product?.call_center_cost ?? 15,
    customer_name: String(full_name || '').trim() || null,
    customer_phone: cleanPhone,
    city: String(city || '').trim() || null,
    product_variant: variantStr || null,
    address1: String(address1 || '').trim() || null,
    address2: String(address2 || '').trim() || null,
    youcan_order_id: String(youcan_order_id || '').trim() || null,
    campaign_name: String(product_name || '').trim() || null,
    ad_platform: detectPlatform(String(product_name || '')),
    ...(orderCreatedAt ? { created_at: orderCreatedAt } : {}),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, phone: cleanPhone, status, product_cost: productCost })
}
