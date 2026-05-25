'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { format } from 'date-fns'
import type { OrderStatus } from '@/lib/types'

interface Props {
  agentId: string
  agentProfile: { full_name: string; commission_rate: number }
  initialOrders: any[]
  assignedBuyers: { id: string; full_name: string }[]
}

const STATUS_OPTIONS: { value: OrderStatus; label: string; color: string }[] = [
  { value: 'lead',               label: 'Lead',               color: 'bg-slate-700 text-slate-300' },
  { value: 'call_later',         label: 'Rappeler',           color: 'bg-purple-500/20 text-purple-300' },
  { value: 'no_reply',           label: 'Pas de reponse',     color: 'bg-slate-700 text-slate-400' },
  { value: 'unreachable',        label: 'Boite vocale',       color: 'bg-slate-700 text-slate-400' },
  { value: 'wrong_number',       label: 'Faux numero',        color: 'bg-red-500/20 text-red-400' },
  { value: 'confirmed',          label: 'Confirme',           color: 'bg-blue-500/20 text-blue-300' },
  { value: 'delivered',          label: 'Livre',              color: 'bg-green-500/20 text-green-300' },
  { value: 'returned',           label: 'Retour',             color: 'bg-amber-500/20 text-amber-300' },
  { value: 'cancelled',          label: 'Annule',             color: 'bg-red-500/20 text-red-400' },
  { value: 'out_of_stock',       label: 'Rupture stock',      color: 'bg-amber-500/20 text-amber-400' },
  { value: 'duplicate',          label: 'Doublon',            color: 'bg-purple-500/20 text-purple-400' },
  { value: 'delivery_no_answer', label: 'Pas rep. livraison', color: 'bg-orange-500/20 text-orange-400' },
]

const FOLLOWUP_OPTIONS = [
  { value: '', label: '—', color: 'bg-slate-800 text-slate-600' },
  ...STATUS_OPTIONS,
]

const COLOR_MAP: Record<string, string> = Object.fromEntries(
  [...STATUS_OPTIONS, { value: '', label: '—', color: 'bg-slate-800 text-slate-600' }].map(s => [s.value, s.color])
)

type Tab = 'queue' | 'confirmed' | 'delivered' | 'all'

const TABS: { key: Tab; label: string; statuses: OrderStatus[] }[] = [
  { key: 'queue',     label: 'File d\'attente',  statuses: ['lead', 'call_later', 'no_reply', 'unreachable'] },
  { key: 'confirmed', label: 'Confirmes',        statuses: ['confirmed', 'delivery_no_answer'] },
  { key: 'delivered', label: 'Livres / Retours', statuses: ['delivered', 'returned'] },
  { key: 'all',       label: 'Tout',             statuses: [] },
]

const PROCESSED = ['confirmed', 'cancelled', 'wrong_number', 'no_reply', 'unreachable', 'out_of_stock', 'duplicate', 'delivered', 'returned', 'delivery_no_answer']

export function AgentDashboard({ agentId, agentProfile, initialOrders, assignedBuyers }: Props) {
  const [orders, setOrders] = useState<any[]>(initialOrders)
  const [activeTab, setActiveTab] = useState<Tab>('queue')
  const [filterBuyer, setFilterBuyer] = useState('all')
  const [search, setSearch] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})

  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)

  const stats = useMemo(() => {
    const totalQueue = orders.filter(o => ['lead', 'call_later', 'no_reply', 'unreachable'].includes(o.status)).length
    const processedTotal = orders.filter(o => PROCESSED.includes(o.status)).length
    const processedToday = orders.filter(o => PROCESSED.includes(o.status) && o.created_at?.slice(0, 10) === today).length
    const confirmedCount = orders.filter(o => ['confirmed', 'delivered', 'returned'].includes(o.status)).length
    const confirmRate = processedTotal > 0 ? (confirmedCount / processedTotal) * 100 : 0
    const deliveredOrders = orders.filter(o => o.status === 'delivered')
    const commission = deliveredOrders.reduce((sum, o) => {
      const np = o.selling_price - o.product_cost - o.packaging_cost - o.delivery_cost - o.call_center_cost - (o.ad_spend || 0)
      return np > 0 ? sum + (np * agentProfile.commission_rate / 100) : sum
    }, 0)
    const deliveryNoAnswer = orders.filter(o => o.status === 'delivery_no_answer').length
    return { totalQueue, processedTotal, processedToday, confirmRate, commission, deliveryNoAnswer, delivered: deliveredOrders.length }
  }, [orders])

  const filtered = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab)!
    return orders.filter(o => {
      if (tab.statuses.length > 0 && !tab.statuses.includes(o.status)) return false
      if (filterBuyer !== 'all' && o.media_buyer_id !== filterBuyer) return false
      if (search) {
        const s = search.toLowerCase()
        const name = o.customer_name?.toLowerCase() || ''
        const phone = o.customer_phone?.toLowerCase() || ''
        if (!name.includes(s) && !phone.includes(s)) return false
      }
      return true
    })
  }, [orders, activeTab, filterBuyer, search])

  const tabCounts = useMemo(() => {
    return Object.fromEntries(TABS.map(t => [
      t.key,
      t.statuses.length > 0 ? orders.filter(o => t.statuses.includes(o.status)).length : orders.length
    ]))
  }, [orders])

  async function handleStatus(orderId: string, newStatus: OrderStatus) {
    setUpdating(orderId)
    const update: any = { status: newStatus }
    if (newStatus === 'confirmed') update.confirmed_by = agentId
    await supabase.from('orders').update(update).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId
      ? { ...o, status: newStatus, confirmed_by: newStatus === 'confirmed' ? agentId : o.confirmed_by }
      : o))
    setUpdating(null)
  }

  async function handleFollowup(orderId: string, field: 'second_contact' | 'day1_contact', value: string) {
    setUpdating(orderId + field)
    await supabase.from('orders').update({ [field]: value || null }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: value || null } : o))
    setUpdating(null)
  }

  async function handleNotesBlur(orderId: string) {
    const notes = editingNotes[orderId] ?? orders.find(o => o.id === orderId)?.notes ?? ''
    await supabase.from('orders').update({ notes: notes || null }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes: notes || null } : o))
  }

  function getNotesValue(order: any) {
    return editingNotes[order.id] !== undefined ? editingNotes[order.id] : (order.notes || '')
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Mes Leads — {agentProfile.full_name}</h1>
        <p className="text-slate-400 text-sm">Commission: {agentProfile.commission_rate}% sur les livraisons</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'En attente',       value: stats.totalQueue,               color: 'text-yellow-400' },
          { label: 'Traites total',    value: stats.processedTotal,           color: 'text-white' },
          { label: 'Traites auj.',     value: stats.processedToday,           color: 'text-blue-400' },
          { label: 'Taux confirm.',    value: formatPercent(stats.confirmRate), color: 'text-blue-300' },
          { label: 'Livres',           value: stats.delivered,                color: 'text-green-400' },
          { label: 'Pas rep. livr.',   value: stats.deliveryNoAnswer,         color: 'text-orange-400' },
          { label: 'Commission',       value: formatCurrency(stats.commission), color: 'text-indigo-400' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className="text-slate-500 text-xs mb-1">{s.label}</p>
              <p className={`font-bold text-lg ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input className="w-52" placeholder="Rechercher nom/tel..." value={search} onChange={e => setSearch(e.target.value)} />
        {assignedBuyers.length > 1 && (
          <select
            value={filterBuyer}
            onChange={e => setFilterBuyer(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tous les buyers</option>
            {assignedBuyers.map(b => <option key={b.id} value={b.id}>{b.full_name}</option>)}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === t.key ? 'bg-white/20' : 'bg-slate-700'}`}>
              {tabCounts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">#</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Date</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Telephone</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Ville</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Client</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Produit</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Variante</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Prix</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Adresse</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">ETAT</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">2EM ETAT</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">J+1</th>
                  <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">REMARQUE</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <tr key={order.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap font-mono">
                      {order.youcan_order_id || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">
                      {format(new Date(order.created_at), 'dd/MM/yy HH:mm')}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a href={`tel:${order.customer_phone}`} className="text-indigo-400 hover:text-indigo-300 font-mono text-sm font-bold">
                        {order.customer_phone || 'N/A'}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-slate-300 text-xs whitespace-nowrap">{order.city || '—'}</td>
                    <td className="px-3 py-2 text-white text-sm font-medium whitespace-nowrap">{order.customer_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{order.products?.name || '—'}</td>
                    <td className="px-3 py-2 text-slate-300 text-xs whitespace-nowrap font-medium">{order.product_variant || '—'}</td>
                    <td className="px-3 py-2 text-green-400 text-xs whitespace-nowrap font-bold">{order.selling_price ? `${order.selling_price} MAD` : '—'}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">
                      <span className="whitespace-nowrap">
                        {[order.address1, order.address2].filter(Boolean).join(', ') || '—'}
                      </span>
                    </td>

                    {/* ETAT */}
                    <td className="px-3 py-2">
                      <select
                        value={order.status}
                        disabled={updating === order.id}
                        onChange={e => handleStatus(order.id, e.target.value as OrderStatus)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${COLOR_MAP[order.status] || 'bg-slate-700 text-slate-300'}`}
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s.value} value={s.value} className="bg-slate-800 text-white">{s.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* 2EM ETAT */}
                    <td className="px-3 py-2">
                      <select
                        value={order.second_contact || ''}
                        disabled={updating === order.id + 'second_contact'}
                        onChange={e => handleFollowup(order.id, 'second_contact', e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${COLOR_MAP[order.second_contact || '']}`}
                      >
                        {FOLLOWUP_OPTIONS.map(s => (
                          <option key={s.value} value={s.value} className="bg-slate-800 text-white">{s.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* J+1 */}
                    <td className="px-3 py-2">
                      <select
                        value={order.day1_contact || ''}
                        disabled={updating === order.id + 'day1_contact'}
                        onChange={e => handleFollowup(order.id, 'day1_contact', e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${COLOR_MAP[order.day1_contact || '']}`}
                      >
                        {FOLLOWUP_OPTIONS.map(s => (
                          <option key={s.value} value={s.value} className="bg-slate-800 text-white">{s.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* REMARQUE CLIENT */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={getNotesValue(order)}
                        placeholder="Remarque..."
                        onChange={e => setEditingNotes(prev => ({ ...prev, [order.id]: e.target.value }))}
                        onBlur={() => handleNotesBlur(order.id)}
                        className="bg-transparent border-b border-slate-700 focus:border-indigo-500 outline-none text-xs text-slate-300 placeholder-slate-600 w-32 py-1"
                      />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-slate-500">
                      {assignedBuyers.length === 0 ? 'Aucun media buyer assigne — contactez l\'admin' : 'Aucun lead dans cette categorie'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
