export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KPICard } from '@/components/KPICard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/StatusBadge'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { calcStats, calcNetProfit, calcBrutProfit } from '@/lib/calculations'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Order, DailyMetric } from '@/lib/types'
import { format, subDays, parseISO, eachDayOfInterval, parseISO as pi } from 'date-fns'
import { BuyerDateFilter } from './BuyerDateFilter'

export default async function BuyerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const params = await searchParams
  const today     = format(new Date(), 'yyyy-MM-dd')
  const dateFrom  = params.from || format(subDays(new Date(), 29), 'yyyy-MM-dd')
  const dateTo    = params.to   || today

  const { data: orders } = await supabase
    .from('orders')
    .select('*, products(name)')
    .eq('media_buyer_id', user.id)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo + 'T23:59:59')
    .order('created_at', { ascending: false })

  const safeOrders = (orders || []) as Order[]
  const stats = calcStats(safeOrders)

  const deliveredOrders = safeOrders.filter(o => o.status === 'delivered')
  const totalBrutProfit = deliveredOrders.reduce((s, o) => s + calcBrutProfit(o), 0)

  // Build daily chart data for the selected range (cap at 60 days for readability)
  const fromDate = pi(dateFrom)
  const toDate   = pi(dateTo)
  const days = eachDayOfInterval({ start: fromDate, end: toDate })
  const dailyMap = new Map<string, DailyMetric>()
  for (const d of days) {
    const key = format(d, 'dd/MM')
    dailyMap.set(key, { date: key, revenue: 0, net_profit: 0, orders: 0, ad_spend: 0 })
  }
  for (const o of safeOrders) {
    const key = format(parseISO(o.created_at), 'dd/MM')
    const entry = dailyMap.get(key)
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

  const DELIVERY_PIPELINE = ['in_delivery', 'delivery_no_answer', 'out_of_zone', 'redirect_city', 'received_hub', 'picked_up', 'preparing_return', 'postponed', 'address_issue']
  const totalConfirmedAll = safeOrders.filter(o => ['confirmed', 'delivered', 'returned', ...DELIVERY_PIPELINE].includes(o.status)).length
  const confirmationRateByTotal = safeOrders.length > 0 ? (totalConfirmedAll / safeOrders.length) * 100 : 0

  const statusCounts = {
    lead:         safeOrders.filter(o => o.status === 'lead').length,
    call_later:   safeOrders.filter(o => o.status === 'call_later').length,
    no_reply:     safeOrders.filter(o => o.status === 'no_reply').length,
    unreachable:  safeOrders.filter(o => o.status === 'unreachable').length,
    wrong_number: safeOrders.filter(o => o.status === 'wrong_number').length,
    confirmed:    safeOrders.filter(o => o.status === 'confirmed').length,
    in_delivery:  safeOrders.filter(o => DELIVERY_PIPELINE.includes(o.status)).length,
    delivered:    safeOrders.filter(o => o.status === 'delivered').length,
    returned:     safeOrders.filter(o => ['returned', 'refused'].includes(o.status)).length,
    cancelled:    safeOrders.filter(o => ['cancelled', 'duplicate', 'out_of_stock'].includes(o.status)).length,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Bonjour, {profile.full_name}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`}</p>
        </div>
        <BuyerDateFilter activeFrom={dateFrom} activeTo={dateTo} />
      </div>

      {/* Profit brut banner */}
      <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 border border-green-600/30 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-green-300 text-sm font-medium">Profit brut — livraisons</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(totalBrutProfit)}</p>
          <p className="text-green-400 text-xs mt-0.5">Avant déduction des dépenses pub · {stats.totalDelivered} livraisons</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-green-600/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KPICard
          title="Total leads"
          value={stats.totalOrders.toString()}
          subtitle={`Confirmes: ${stats.totalConfirmed}`}
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <KPICard
          title="Taux confirmation"
          value={formatPercent(confirmationRateByTotal)}
          color="purple"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KPICard
          title="Taux livraison"
          value={formatPercent(stats.deliveryRate)}
          color="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
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
              { label: 'Confirmé (non distribué)', count: statusCounts.confirmed,   color: 'bg-blue-500/20 text-blue-300' },
              { label: 'En livraison',            count: statusCounts.in_delivery, color: 'bg-indigo-500/20 text-indigo-300' },
              { label: 'Livre',                   count: statusCounts.delivered,   color: 'bg-green-500/20 text-green-300' },
              { label: 'Retour',                  count: statusCounts.returned,    color: 'bg-amber-500/20 text-amber-300' },
              { label: 'Annule',                  count: statusCounts.cancelled,   color: 'bg-red-500/20 text-red-300' },
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
            <CardTitle>CA &amp; Profit net</CardTitle>
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
                  <th className="text-right text-slate-400 font-medium px-5 py-3">Profit brut</th>
                  <th className="text-left text-slate-400 font-medium px-5 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(o => {
                  const bp = calcBrutProfit(o)
                  return (
                    <tr key={o.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-5 py-3 text-slate-400 text-xs">{format(new Date(o.created_at), 'dd/MM')}</td>
                      <td className="px-5 py-3 text-slate-300">{(o.products as any)?.name || 'N/A'}</td>
                      <td className={`px-5 py-3 text-right font-medium text-sm ${bp >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(bp)}</td>
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
