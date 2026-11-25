import type { SupabaseClient } from '@supabase/supabase-js'

// Colonnes utilisées par l'interface agent (évite select('*') sur des milliers de lignes)
export const AGENT_ORDER_SELECT = 'id, media_buyer_id, product_id, status, selling_price, product_cost, packaging_cost, delivery_cost, call_center_cost, ad_spend, campaign_name, ad_platform, customer_name, customer_phone, city, notes, product_variant, address1, address2, youcan_order_id, second_contact, day1_contact, confirmed_by, tracking_code, ameex_sent_at, created_at, confirmed_at, delivered_at, quantity, payment_mode, customer_type, order_source, products(id, name, pack_size)'

// PostgREST plafonne chaque réponse à 1000 lignes : on pagine pour charger tout l'historique
const PAGE_SIZE = 1000

export async function fetchAllAgentOrders(svc: SupabaseClient, buyerIds: string[]): Promise<{ id: string }[]> {
  if (buyerIds.length === 0) return []

  // Pages lues jusqu'à une page incomplète : une insertion pendant le chargement
  // décale les lignes vers la page suivante (doublon dédoublonné) sans en perdre.
  const byId = new Map<string, { id: string }>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await svc.from('orders')
      .select(AGENT_ORDER_SELECT)
      .in('media_buyer_id', buyerIds)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    for (const o of (data || []) as unknown as { id: string }[]) byId.set(o.id, o)
    if (!data || data.length < PAGE_SIZE) break
  }
  return Array.from(byId.values())
}
