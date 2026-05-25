export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KPICard } from '@/components/KPICard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/StatusBadge'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { calcStats, calcNetProfit, calcCommission } from '@/lib/calculations'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Order, DailyMetric } from '@/lib/types'
import { format, subDays, parseISO } from 'date-fns'

export default async function BuyerDashboard() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const thirtyDaysAgo = subDays(new Date(), 30).toISOString()

  const { data: orders } = await supabase
    .from('orders')
    .select('*, products(name)')
    .eq('media_buyer_id', user.id)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })

  const safeOrders = (orders || []) as Order[]
  const stats = calcStats(safeOrders)

  const totalCommission = safeOrders
    .filter(o => o.status === 'delivered')
    .reduce((s, o) => s + calcCommission(calcNetProfit(o), profile.commission_rate), 0)

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
  const recentOrders = safeOrders.slice(0, 10)

  const statusCounts = {
    lead:         safeOrders.filter(o => o.status === 'lead').length,
    call_later:   safeOrders.filter(o => o.status === 'call_later').length,
    no_reply:     safeOrders.filter(o => o.status === 'no_reply').length,
    unreachable:  safeOrders.filter(o => o.status === 'unreachable').length,
    wrong_number: safeOrders.filter(o => o.status === 'wrong_number').length,
    confirmed:    safeOrders.filter(o => o.status === 'confirmed').length,
    delivered:    safeOrders.filter(o => o.status === 'delivered').length,
    returned:     safeOrders.filter(o => o.status === 'returned').length,
    cancelled:    safeOrders.filter(o => o.status === 'cancelled').length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Bonjour, {profile.full_name}</h1>
        <p className="text-slate-400 text-sm mt-0.5">Vos performances des 30 derniers jours</p>
      </div>

      <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-600/30 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-indigo-300 text-sm font-medium">Commission a percevoir</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(totalCommission)}</p>
          <p className="text-indigo-400 text-xs mt-0.5">Taux: {profile.commission_rate}% sur profit net des livraisons</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-indigo-600/30 flex items-center justify-center">
          <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
          title="Total leads"
          value={stats.totalOrders.toString()}
          subtitle={`Confirmes: ${stats.totalConfirmed}`}
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
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
          title="Depenses pub"
          value={formatCurrency(stats.totalAdSpend)}
          color="amber"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /></svg>}
        />
      </div>

      {/* Status breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Repartition des statuts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { label: 'Lead',        count: statusCounts.lead,         color: 'bg-slate-700 text-slate-300' },
              { label: 'Rappeler',    count: statusCounts.call_later,   color: 'bg-purple-500/20 text-purple-300' },
              { label: 'Pas rep.',    count: statusCounts.no_reply,     color: 'bg-slate-700 text-slate-300' },
              { label: 'Injoignable', count: statusCounts.unreachable,  color: 'bg-slate-700 text-slate-300' },
              { label: 'Faux num.',   count: statusCounts.wrong_number, color: 'bg-red-500/20 text-red-300' },
              { label: 'Confirme',    count: statusCounts.confirmed,    color: 'bg-blue-500/20 text-blue-300' },
              { label: 'Livre',       count: statusCounts.delivered,    color: 'bg-green-500/20 text-green-300' },
              { label: 'Retour',      count: statusCounts.returned,     color: 'bg-amber-500/20 text-amber-300' },
              { label: 'Annule',      count: statusCounts.cancelled,    color: 'bg-red-500/20 text-red-300' },
            ].map(({ label, count, color }) => (
              <div key={label} className={`rounded-lg p-3 text-center ${color}`}>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs mt-0.5 opacity-80">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>CA &amp; Profit net - 30 jours</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={dailyData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commandes recentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 font-medium px-5 py-3">Date</th>
                  <th className="text-left text-slate-400 font-medium px-5 py-3">Produit</th>
                  <th className="text-right text-slate-400 font-medium px-5 py-3">Net</th>
                  <th className="text-left text-slate-400 font-medium px-5 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(o => {
                  const np = calcNetProfit(o)
                  return (
                    <tr key={o.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-5 py-3 text-slate-400 text-xs">{format(new Date(o.created_at), 'dd/MM')}</td>
                      <td className="px-5 py-3 text-slate-300">{(o.products as any)?.name || 'N/A'}</td>
                      <td className={`px-5 py-3 text-right font-medium text-sm ${np >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(np)}</td>
                      <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                    </tr>
                  )
                })}
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
