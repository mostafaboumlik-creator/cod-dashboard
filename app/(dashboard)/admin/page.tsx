export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { KPICard } from '@/components/KPICard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/StatusBadge'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { OrderStatusChart } from '@/components/charts/OrderStatusChart'
import { calcNetProfit } from '@/lib/calculations'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Order, DailyMetric } from '@/lib/types'
import { format, subDays, parseISO, eachDayOfInterval } from 'date-fns'
import { AdminDateFilter } from './AdminDateFilter'

const CONFIRMED_STATUSES = ['confirmed','picked_up','received_hub','address_issue','in_delivery',
  'out_of_zone','refused','preparing_return','redirect_city','delivery_no_answer','postponed','delivered','returned']

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/buyer')

  // Use service role to bypass RLS for admin dashboard
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const params = await searchParams
  const today   = format(new Date(), 'yyyy-MM-dd')
  const dateFrom = params.from || format(subDays(new Date(), 29), 'yyyy-MM-dd')
  const dateTo   = params.to   || today

  // Fetch orders created in period + orders delivered in period (even if created before)
  const [{ data: orders }, { data: deliveredInPeriod }, { data: mediaBuyers }, { data: products }] = await Promise.all([
    db
      .from('orders')
      .select('id, media_buyer_id, product_id, status, selling_price, product_cost, packaging_cost, delivery_cost, call_center_cost, ad_spend, customer_name, customer_phone, city, product_variant, created_at, confirmed_at, delivered_at, tracking_code')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false }),
    db
      .from('orders')
      .select('id, product_id, status, selling_price, product_cost, packaging_cost, delivery_cost, call_center_cost, ad_spend, tracking_code, delivered_at, created_at')
      .eq('status', 'delivered')
      .gte('created_at', format(subDays(new Date(dateFrom), 45), 'yyyy-MM-dd'))
      .lte('created_at', dateTo + 'T23:59:59'),
    db
      .from('profiles')
      .select('id, full_name, commission_rate')
      .eq('role', 'media_buyer'),
    db
      .from('products')
      .select('id, name'),
  ])

  const productMap = new Map((products || []).map((p: any) => [p.id, p.name]))

  const safeOrders = (orders || []) as Order[]
  // deliveredInPeriod = livrés avec delivered_at dans la période (même si créés avant)
  const safeDelivered = (deliveredInPeriod || []) as any[]

  // ── Stats (calqués sur Ameex) ─────────────────────────────────────
  const returnedOrders  = safeOrders.filter(o => o.status === 'returned')
  // ameexOrders = all orders with tracking code in extended window (like Ameex)
  const ameexOrders     = [...safeOrders, ...safeDelivered]
    .filter((o: any) => o.tracking_code)
    .filter((o: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === o.id) === i)
  const processedOrders = safeOrders.filter(o => !['lead','call_later'].includes(o.status))
  const confirmedOrders = safeOrders.filter(o => CONFIRMED_STATUSES.includes(o.status))

  // CA = livrés dans la période (par delivered_at) comme Ameex
  const totalCA        = safeDelivered.reduce((s: number, o: any) => s + o.selling_price - (o.delivery_cost || 0), 0)
  const totalNetProfit = safeDelivered.reduce((s: number, o: any) => s + calcNetProfit(o as Order), 0)
  const totalAdSpend   = safeOrders.reduce((s, o) => s + (o.ad_spend || 0), 0)
  const confirmRate    = processedOrders.length > 0 ? (confirmedOrders.length / processedOrders.length) * 100 : 0
  // Taux livraison comme Ameex = livrés dans période / total ameex (avec tracking)
  const deliveryRate   = ameexOrders.length > 0 ? (safeDelivered.length / ameexOrders.length) * 100 : 0
  const returnRate     = ameexOrders.length > 0 ? (returnedOrders.length / ameexOrders.length) * 100 : 0
  const roi            = totalAdSpend > 0 ? (totalNetProfit / totalAdSpend) * 100 : 0

  // Order value stats
  const prices        = safeOrders.map(o => o.selling_price).filter(p => p > 0)
  const maxOrder      = prices.length > 0 ? Math.max(...prices) : 0
  const minOrder      = prices.length > 0 ? Math.min(...prices) : 0
  const avgOrder      = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0

  // ── Daily chart ───────────────────────────────────────────────────
  const fromDate  = new Date(dateFrom)
  const toDateObj = new Date(dateTo)
  const days      = eachDayOfInterval({ start: fromDate, end: toDateObj })
  const dailyMap  = new Map<string, DailyMetric>()
  for (const d of days) {
    const key = format(d, 'dd/MM')
    dailyMap.set(key, { date: key, revenue: 0, net_profit: 0, orders: 0, ad_spend: 0 })
  }
  for (const o of safeOrders) {
    const key = format(parseISO(o.created_at), 'dd/MM')
    const entry = dailyMap.get(key)
    if (entry) {
      entry.orders++
      entry.ad_spend += o.ad_spend || 0
      if (CONFIRMED_STATUSES.includes(o.status)) {
        entry.revenue    += o.selling_price
        entry.net_profit += calcNetProfit(o)
      }
    }
  }
  const dailyData = Array.from(dailyMap.values())

  // ── Top products ──────────────────────────────────────────────────
  const topMap = new Map<string, { name: string; orders: number; revenue: number; delivered: number }>()
  for (const o of safeOrders) {
    const pid  = o.product_id
    const name = productMap.get(pid) || 'Inconnu'
    if (!topMap.has(pid)) topMap.set(pid, { name, orders: 0, revenue: 0, delivered: 0 })
    const entry = topMap.get(pid)!
    entry.orders++
    if (CONFIRMED_STATUSES.includes(o.status)) entry.revenue += o.selling_price
    if (o.status === 'delivered') entry.delivered++
  }
  const topProducts = Array.from(topMap.values())
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 5)

  // ── Status chart ──────────────────────────────────────────────────
  const statusChartData = [
    { name: 'Lead',        value: safeOrders.filter(o => o.status === 'lead').length,      color: '#64748b' },
    { name: 'Confirmé',   value: safeOrders.filter(o => o.status === 'confirmed').length,  color: '#3b82f6' },
    { name: 'En transit', value: safeOrders.filter(o => ['picked_up','received_hub','in_delivery'].includes(o.status)).length, color: '#06b6d4' },
    { name: 'Livré',      value: safeDelivered.length,                                      color: '#22c55e' },
    { name: 'Retour',     value: returnedOrders.length,                                    color: '#f59e0b' },
    { name: 'Annulé',    value: safeOrders.filter(o => ['cancelled','wrong_number'].includes(o.status)).length, color: '#ef4444' },
  ]

  const recentOrders = safeOrders.slice(0, 8)

  return (
    <div className="space-y-6">
      {/* Header + Date filter */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard Admin</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`}
          </p>
        </div>
        <AdminDateFilter activeFrom={dateFrom} activeTo={dateTo} />
      </div>

      {/* KPIs principaux */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="CA net livré" value={formatCurrency(totalCA)}
          subtitle={`${safeDelivered.length} livrés · frais déduits`} color="indigo"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KPICard title="Profit net" value={formatCurrency(totalNetProfit)}
          subtitle={`ROI: ${formatPercent(roi)}`} color="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <KPICard title="Commandes totales" value={safeOrders.length.toString()}
          subtitle={`Leads: ${safeOrders.filter(o => o.status === 'lead').length}`} color="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <KPICard title="Depenses pub" value={formatCurrency(totalAdSpend)}
          subtitle={`${safeOrders.length} commandes`} color="amber"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /></svg>}
        />
        <KPICard title="Taux confirmation" value={formatPercent(confirmRate)} color="purple"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KPICard title="Taux livraison" value={formatPercent(deliveryRate)} color="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
        />
        <KPICard title="Taux retour" value={formatPercent(returnRate)} color="red"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>}
        />
        <KPICard title="Media buyers actifs" value={(mediaBuyers?.length || 0).toString()} color="indigo"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
      </div>

      {/* Order value insights */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-slate-400 text-sm mb-1">Max order value</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(maxOrder)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-slate-400 text-sm mb-1">Average order value</p>
            <p className="text-2xl font-bold text-indigo-400">{formatCurrency(avgOrder)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-slate-400 text-sm mb-1">Min order value</p>
            <p className="text-2xl font-bold text-slate-300">{formatCurrency(minOrder)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>CA &amp; Profit net</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={dailyData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Commandes par statut</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderStatusChart data={statusChartData} />
          </CardContent>
        </Card>
      </div>

      {/* Top products + Recent orders */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top produits</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 font-medium px-5 py-3">Produit</th>
                  <th className="text-right text-slate-400 font-medium px-5 py-3">Orders</th>
                  <th className="text-right text-slate-400 font-medium px-5 py-3">CA</th>
                  <th className="text-right text-slate-400 font-medium px-5 py-3">Livrés</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-5 py-3 text-white font-medium">{p.name}</td>
                    <td className="px-5 py-3 text-right text-slate-300">{p.orders}</td>
                    <td className="px-5 py-3 text-right text-green-400 font-medium">{formatCurrency(p.revenue)}</td>
                    <td className="px-5 py-3 text-right text-blue-400">{p.delivered}</td>
                  </tr>
                ))}
                {topProducts.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">Aucune donnée</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commandes récentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 font-medium px-5 py-3">Client</th>
                  <th className="text-left text-slate-400 font-medium px-5 py-3">Produit</th>
                  <th className="text-right text-slate-400 font-medium px-5 py-3">Prix</th>
                  <th className="text-left text-slate-400 font-medium px-5 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-5 py-3 text-slate-300">{order.customer_name || 'N/A'}</td>
                    <td className="px-5 py-3 text-slate-400">{productMap.get(order.product_id) || 'N/A'}</td>
                    <td className="px-5 py-3 text-right text-white font-medium">{formatCurrency(order.selling_price)}</td>
                    <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">Aucune commande</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
