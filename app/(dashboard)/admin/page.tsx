export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KPICard } from '@/components/KPICard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/StatusBadge'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { MediaBuyerChart } from '@/components/charts/MediaBuyerChart'
import { OrderStatusChart } from '@/components/charts/OrderStatusChart'
import { calcStats, calcNetProfit } from '@/lib/calculations'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Order, DailyMetric } from '@/lib/types'
import { format, subDays, parseISO } from 'date-fns'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/buyer')

  const thirtyDaysAgo = subDays(new Date(), 30).toISOString()

  const [{ data: orders }, { data: allOrders }, { data: mediaBuyers }] = await Promise.all([
    supabase
      .from('orders')
      .select('*, profiles(full_name), products(name)')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('*, profiles(commission_rate)')
      .gte('created_at', thirtyDaysAgo),
    supabase
      .from('profiles')
      .select('id, full_name, commission_rate')
      .eq('role', 'media_buyer'),
  ])

  const safeOrders = (orders || []) as Order[]
  const stats = calcStats(safeOrders)

  const dailyMap = new Map<string, DailyMetric>()
  for (let i = 29; i >= 0; i--) {
    const d = format(subDays(new Date(), i), 'dd/MM')
    dailyMap.set(d, { date: d, revenue: 0, net_profit: 0, orders: 0, ad_spend: 0 })
  }
  for (const o of safeOrders) {
    const d = format(parseISO(o.created_at), 'dd/MM')
    const entry = dailyMap.get(d)
    if (entry) {
      entry.orders++
      entry.ad_spend += o.ad_spend
      if (o.status === 'delivered') {
        entry.revenue += o.selling_price
        entry.net_profit += calcNetProfit(o)
      }
    }
  }
  const dailyData = Array.from(dailyMap.values())

  const buyerMap = new Map<string, { name: string; net_profit: number; orders: number }>()
  for (const o of (allOrders || []) as Order[]) {
    const p = o.profiles as any
    if (!buyerMap.has(o.media_buyer_id)) {
      buyerMap.set(o.media_buyer_id, { name: p?.full_name || 'Inconnu', net_profit: 0, orders: 0 })
    }
    const entry = buyerMap.get(o.media_buyer_id)!
    entry.orders++
    if (o.status === 'delivered') entry.net_profit += calcNetProfit(o)
  }
  const buyerRanking = Array.from(buyerMap.values())
    .sort((a, b) => b.net_profit - a.net_profit)
    .slice(0, 5)

  const otherCount = safeOrders.filter(o =>
    ['wrong_number', 'no_reply', 'unreachable', 'call_later', 'out_of_stock', 'duplicate'].includes(o.status)
  ).length

  const statusChartData = [
    { name: 'Lead',      value: stats.totalLeads,     color: '#64748b' },
    { name: 'Confirme',  value: stats.totalConfirmed, color: '#3b82f6' },
    { name: 'Livre',     value: stats.totalDelivered, color: '#22c55e' },
    { name: 'Retour',    value: stats.totalReturned,  color: '#f59e0b' },
    { name: 'Annule',    value: stats.totalCancelled, color: '#ef4444' },
    { name: 'Autres',    value: otherCount,            color: '#8b5cf6' },
  ]

  const recentOrders = safeOrders.slice(0, 8)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard Admin</h1>
        <p className="text-slate-400 text-sm mt-0.5">Performances des 30 derniers jours</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Chiffre d'affaires"
          value={formatCurrency(stats.totalRevenue)}
          subtitle={`${stats.totalDelivered} livraisons`}
          color="indigo"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KPICard
          title="Profit net"
          value={formatCurrency(stats.totalNetProfit)}
          subtitle={`ROI: ${formatPercent(stats.roi)}`}
          color="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <KPICard
          title="Commandes totales"
          value={stats.totalOrders.toString()}
          subtitle={`Leads: ${stats.totalLeads}`}
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <KPICard
          title="Depenses pub"
          value={formatCurrency(stats.totalAdSpend)}
          subtitle={`${stats.totalOrders} campagnes`}
          color="amber"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>}
        />
        <KPICard
          title="Taux confirmation"
          value={formatPercent(stats.confirmationRate)}
          color="purple"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KPICard
          title="Taux livraison"
          value={formatPercent(stats.deliveryRate)}
          color="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
        />
        <KPICard
          title="Taux retour"
          value={formatPercent(stats.returnRate)}
          color="red"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>}
        />
        <KPICard
          title="Media buyers actifs"
          value={(mediaBuyers?.length || 0).toString()}
          color="indigo"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>CA &amp; Profit net - 30 derniers jours</CardTitle>
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top Media Buyers - Profit net</CardTitle>
          </CardHeader>
          <CardContent>
            {buyerRanking.length > 0 ? (
              <MediaBuyerChart data={buyerRanking} />
            ) : (
              <p className="text-slate-500 text-sm text-center py-8">Aucune donnee disponible</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commandes recentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
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
                      <td className="px-5 py-3 text-slate-400">{(order.products as any)?.name || 'N/A'}</td>
                      <td className="px-5 py-3 text-right text-white font-medium">{formatCurrency(order.selling_price)}</td>
                      <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                    </tr>
                  ))}
                  {recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                        Aucune commande pour le moment
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
