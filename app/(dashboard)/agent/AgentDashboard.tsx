'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  allProducts: { id: string; name: string }[]
}

const STATUS_OPTIONS: { value: OrderStatus; label: string; color: string }[] = [
  { value: 'lead',               label: 'Lead',               color: 'bg-slate-700 text-slate-300' },
  { value: 'call_later',         label: 'Rappeler',           color: 'bg-purple-500/20 text-purple-300' },
  { value: 'no_reply',           label: 'Pas de reponse',     color: 'bg-slate-700 text-slate-400' },
  { value: 'unreachable',        label: 'Boite vocale',       color: 'bg-slate-700 text-slate-400' },
  { value: 'wrong_number',       label: 'Faux numero',        color: 'bg-red-500/20 text-red-400' },
  { value: 'confirmed',          label: 'Confirme',           color: 'bg-blue-500/20 text-blue-300' },
  { value: 'picked_up',          label: 'Ramassé',            color: 'bg-cyan-500/20 text-cyan-300' },
  { value: 'received_hub',       label: 'Reçu agence',        color: 'bg-teal-500/20 text-teal-300' },
  { value: 'address_issue',      label: 'Attente adresse',    color: 'bg-yellow-500/20 text-yellow-300' },
  { value: 'in_delivery',        label: 'En livraison',       color: 'bg-sky-500/20 text-sky-300' },
  { value: 'out_of_zone',        label: 'Hors-zone',          color: 'bg-yellow-600/20 text-yellow-400' },
  { value: 'refused',            label: 'Refusé',             color: 'bg-red-600/20 text-red-400' },
  { value: 'preparing_return',   label: 'Prép. retour',       color: 'bg-orange-600/20 text-orange-400' },
  { value: 'redirect_city',      label: 'Renvoi ville',       color: 'bg-indigo-500/20 text-indigo-300' },
  { value: 'delivered',          label: 'Livre',              color: 'bg-green-500/20 text-green-300' },
  { value: 'returned',           label: 'Retour',             color: 'bg-amber-500/20 text-amber-300' },
  { value: 'cancelled',          label: 'Annule',             color: 'bg-red-500/20 text-red-400' },
  { value: 'out_of_stock',       label: 'Rupture stock',      color: 'bg-amber-500/20 text-amber-400' },
  { value: 'duplicate',          label: 'Doublon',            color: 'bg-purple-500/20 text-purple-400' },
  { value: 'delivery_no_answer', label: 'Pas rep. livraison', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'postponed',          label: 'Reporté',            color: 'bg-yellow-500/20 text-yellow-300' },
]

const FOLLOWUP_OPTIONS = [
  { value: '', label: '—', color: 'bg-slate-800 text-slate-600' },
  ...STATUS_OPTIONS,
]

const COLOR_MAP: Record<string, string> = Object.fromEntries(
  [...STATUS_OPTIONS, { value: '', label: '—', color: 'bg-slate-800 text-slate-600' }].map(s => [s.value, s.color])
)

type Tab = 'queue' | 'retry' | 'callback' | 'confirmed' | 'cancelled' | 'delivered' | 'all'

const TABS: { key: Tab; label: string; statuses: OrderStatus[] }[] = [
  { key: 'queue',     label: '🔥 File d\'attente', statuses: ['lead'] },
  { key: 'retry',     label: '🔁 2ème tentative',  statuses: ['no_reply', 'unreachable'] },
  { key: 'callback',  label: '📅 Reportés',         statuses: ['call_later'] },
  { key: 'confirmed', label: 'Confirmés',           statuses: ['confirmed', 'picked_up', 'received_hub', 'address_issue', 'in_delivery', 'out_of_zone', 'refused', 'preparing_return', 'redirect_city', 'delivery_no_answer', 'postponed'] },
  { key: 'cancelled', label: 'Annulés',             statuses: ['cancelled', 'wrong_number', 'duplicate', 'out_of_stock'] },
  { key: 'delivered', label: 'Livres / Retours',    statuses: ['delivered', 'returned'] },
  { key: 'all',       label: 'Tout',                statuses: [] },
]

const PROCESSED = ['confirmed', 'cancelled', 'wrong_number', 'no_reply', 'unreachable', 'out_of_stock', 'duplicate', 'delivered', 'returned', 'delivery_no_answer', 'picked_up', 'in_delivery', 'postponed', 'received_hub', 'address_issue', 'out_of_zone', 'refused', 'preparing_return', 'redirect_city', 'call_later']

// Statuts gérés par Ameex — l'agent ne peut plus modifier
const AMEEX_LOCKED: string[] = ['picked_up', 'received_hub', 'address_issue', 'in_delivery', 'out_of_zone', 'refused', 'preparing_return', 'redirect_city', 'delivery_no_answer', 'postponed', 'delivered', 'returned']

function PhoneHistoryBadge({ data }: { data: any }) {
  if (!data) return null
  const isAmeex = data.source === 'ameex'
  const blacklist = data.blacklist
  const total  = data.total_colis ?? data.total ?? 0
  const livres = data.livres ?? data.delivered ?? 0
  const retours= data.retours ?? data.returned ?? 0
  const label  = blacklist ? '🚫 BL' : total === 0 ? 'NEW' : `L${livres}R${retours}`
  const tip    = blacklist
    ? `BLACKLISTÉ — Total: ${total} | Livré: ${livres} | Retour: ${retours}`
    : `${isAmeex ? 'Ameex' : 'Notre DB'} — Total: ${total} | Livré: ${livres} | Retour: ${retours}`
  return (
    <span title={tip} className={`text-[10px] font-bold px-1 rounded cursor-default ${
      blacklist ? 'text-red-400 bg-red-500/20 animate-pulse' :
      retours > 1 ? 'text-red-400 bg-red-500/10' :
      retours > 0 ? 'text-amber-400 bg-amber-500/10' :
      total > 0   ? 'text-green-400 bg-green-500/10' :
      'text-slate-400 bg-slate-700'
    }`}>{label}</span>
  )
}

export function AgentDashboard({ agentId, agentProfile, initialOrders, assignedBuyers, allProducts }: Props) {
  const router = useRouter()
  const prevInitialIds = useRef(new Set(initialOrders.map((o: any) => o.id)))
  const [orders, setOrders] = useState<any[]>(initialOrders)
  const [activeTab, setActiveTab] = useState<Tab>('queue')
  const [filterBuyer, setFilterBuyer] = useState('all')
  const [filterProduct, setFilterProduct] = useState('all')
  const [filterAmeex, setFilterAmeex] = useState<'all' | 'pending' | 'sent'>('all')
  const [filterQueueType, setFilterQueueType] = useState<'all' | 'untreated' | 'treated'>('all')
  const [search, setSearch] = useState('')
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(yesterday)
  const [dateTo, setDateTo] = useState(yesterday)
  const [updating, setUpdating] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})
  const [editingAddress, setEditingAddress] = useState<Record<string, string>>({})
  const [editingPhone, setEditingPhone] = useState<Record<string, string>>({})
  const [editingName, setEditingName] = useState<Record<string, string>>({})
  const [editingVariant, setEditingVariant] = useState<Record<string, string>>({})
  const [editingPrice, setEditingPrice] = useState<Record<string, string>>({})
  const [phoneHistory, setPhoneHistory] = useState<Record<string, any | null>>({})
  const [ameexModal, setAmeexModal] = useState<{ order: any; cityName: string; openParcel: boolean; address: string; phone: string; customerName: string } | null>(null)
  const [sendingAmeex, setSendingAmeex] = useState(false)
  const [ameexError, setAmeexError] = useState<string | null>(null)
  const [ameexCities, setAmeexCities] = useState<{ id: number; name: string }[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [cityDropOpen, setCityDropOpen] = useState(false)
  const [citySearch, setCitySearch] = useState('')

  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)

  const ORDER_SELECT = 'id, media_buyer_id, product_id, status, selling_price, product_cost, packaging_cost, delivery_cost, call_center_cost, ad_spend, campaign_name, ad_platform, customer_name, customer_phone, city, notes, product_variant, address1, address2, youcan_order_id, second_contact, day1_contact, confirmed_by, tracking_code, ameex_sent_at, created_at, confirmed_at, delivered_at, products(id, name)'

  useEffect(() => {
    const assignedBuyerIds = new Set(assignedBuyers.map(b => b.id))
    const SELECT = ORDER_SELECT

    const channel = supabase
      .channel('orders-realtime-agent-v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          if (!assignedBuyerIds.has(payload.new.media_buyer_id)) return
          const { data: o } = await supabase.from('orders').select(SELECT).eq('id', payload.new.id).single()
          if (o) setOrders(prev => prev.some(x => x.id === o.id) ? prev : [o as any, ...prev])
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' },
        async (payload) => {
          if (!assignedBuyerIds.has(payload.new.media_buyer_id)) return
          const { data: o } = await supabase.from('orders').select(SELECT).eq('id', payload.new.id).single()
          if (o) setOrders(prev => prev.map(x => x.id === o.id ? o as any : x))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [assignedBuyers])

  // Auto-refresh server data every 20s to pick up new leads
  useEffect(() => {
    const poll = setInterval(() => router.refresh(), 20000)
    return () => clearInterval(poll)
  }, [])

  // When server re-fetches, sync new orders into client state
  useEffect(() => {
    const newOnes = initialOrders.filter((o: any) => !prevInitialIds.current.has(o.id))
    if (newOnes.length > 0) {
      setOrders(prev => {
        const prevIds = new Set(prev.map((x: any) => x.id))
        const toAdd = newOnes.filter((o: any) => !prevIds.has(o.id))
        return toAdd.length > 0 ? [...toAdd, ...prev] : prev
      })
      newOnes.forEach((o: any) => prevInitialIds.current.add(o.id))
    }
  }, [initialOrders])

  const stats = useMemo(() => {
    const dateFiltered = orders.filter(o => {
      const d = o.created_at?.slice(0, 10)
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    })
    const total = dateFiltered.length
    const processedTotal = dateFiltered.filter(o => PROCESSED.includes(o.status)).length
    const processedRate = total > 0 ? (processedTotal / total) * 100 : 0
    const leadsToday = orders.filter(o => o.created_at?.slice(0, 10) === today).length
    // confirmedCount = leads confirmés aujourd'hui (confirmed_at) — pour la carte "Confirmés du jour"
    const confirmedCount = orders.filter(o => {
      const d = o.confirmed_at?.slice(0, 10)
      if (!d) return false
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    }).length
    // Taux confirmation = leads créés dans la période ET actuellement confirmés (même base created_at)
    const CONFIRMED_STATUSES = ['confirmed', 'picked_up', 'received_hub', 'address_issue', 'in_delivery', 'out_of_zone', 'refused', 'preparing_return', 'redirect_city', 'delivery_no_answer', 'postponed', 'delivered', 'returned']
    const confirmedFromSameDay = dateFiltered.filter(o => CONFIRMED_STATUSES.includes(o.status)).length
    const confirmRate = total > 0 ? (confirmedFromSameDay / total) * 100 : 0
    const deliveredOrders = dateFiltered.filter(o => o.status === 'delivered')
    const commission = deliveredOrders.reduce((sum, o) => {
      const np = o.selling_price - o.product_cost - o.packaging_cost - o.delivery_cost - o.call_center_cost - (o.ad_spend || 0)
      return np > 0 ? sum + (np * agentProfile.commission_rate / 100) : sum
    }, 0)
    const deliveryNoAnswer = dateFiltered.filter(o => o.status === 'delivery_no_answer').length
    const totalQueue = dateFiltered.filter(o => o.status === 'lead').length // File d'attente = leads frais uniquement
    const retryCount = dateFiltered.filter(o => ['no_reply', 'unreachable'].includes(o.status)).length
    const callbackCount = dateFiltered.filter(o => o.status === 'call_later').length
    const cancelledCount = dateFiltered.filter(o => ['cancelled', 'wrong_number', 'duplicate', 'out_of_stock'].includes(o.status)).length
    const untreated = totalQueue
    const treatedInQueue = retryCount + callbackCount
    const confirmedTotal = dateFiltered.filter(o => ['confirmed', 'delivered', 'returned'].includes(o.status)).length
    const deliveryRate = confirmedTotal > 0 ? (deliveredOrders.length / confirmedTotal) * 100 : 0
    return { totalQueue, retryCount, callbackCount, cancelledCount, processedTotal, processedRate, leadsToday, confirmRate, confirmedCount, commission, deliveryNoAnswer, delivered: deliveredOrders.length, deliveryRate, untreated, treatedInQueue }
  }, [orders, dateFrom, dateTo])


  const filtered = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab)!
    return orders.filter(o => {
      if (tab.statuses.length > 0 && !tab.statuses.includes(o.status)) return false
      if (filterBuyer !== 'all' && o.media_buyer_id !== filterBuyer) return false
      if (filterProduct !== 'all' && o.product_id !== filterProduct) return false
      if (filterAmeex !== 'all' && o.status === 'confirmed') {
        if (filterAmeex === 'pending' && (o.ameex_sent_at || o.tracking_code)) return false
        if (filterAmeex === 'sent' && !o.ameex_sent_at && !o.tracking_code) return false
      }
      if (activeTab === 'queue' && filterQueueType !== 'all') {
        if (filterQueueType === 'untreated' && o.status !== 'lead') return false
        if (filterQueueType === 'treated' && o.status === 'lead') return false
      }
      const d = o.created_at?.slice(0, 10)
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      if (search) {
        const s = search.toLowerCase()
        const name = o.customer_name?.toLowerCase() || ''
        const phone = o.customer_phone?.toLowerCase() || ''
        if (!name.includes(s) && !phone.includes(s)) return false
      }
      return true
    })
  }, [orders, activeTab, filterBuyer, filterProduct, filterAmeex, filterQueueType, search, dateFrom, dateTo])

  const tabCounts = useMemo(() => {
    return Object.fromEntries(TABS.map(t => [
      t.key,
      t.statuses.length > 0 ? orders.filter(o => t.statuses.includes(o.status)).length : orders.length
    ]))
  }, [orders])

  async function handleStatus(orderId: string, newStatus: OrderStatus) {
    setUpdating(orderId)
    // Use service role API to bypass RLS
    await fetch('/api/orders/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, status: newStatus, confirmedBy: newStatus === 'confirmed' ? agentId : null }),
    })
    setOrders(prev => prev.map(o => o.id === orderId
      ? { ...o, status: newStatus, confirmed_by: newStatus === 'confirmed' ? agentId : o.confirmed_by }
      : o))
    setUpdating(null)
  }

  const apiUpdate = (orderId: string, fields: Record<string, any>) =>
    fetch('/api/orders/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, ...fields }),
    })

  async function handleFollowup(orderId: string, field: 'second_contact' | 'day1_contact', value: string) {
    setUpdating(orderId + field)
    await apiUpdate(orderId, { [field]: value || null })
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: value || null } : o))
    setUpdating(null)
  }

  async function handleNotesBlur(orderId: string) {
    const notes = editingNotes[orderId] ?? orders.find(o => o.id === orderId)?.notes ?? ''
    await apiUpdate(orderId, { notes: notes || null })
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes: notes || null } : o))
  }

  function getNotesValue(order: any) {
    return editingNotes[order.id] !== undefined ? editingNotes[order.id] : (order.notes || '')
  }

  async function handleAddressBlur(orderId: string) {
    const addr = editingAddress[orderId] ?? orders.find(o => o.id === orderId)?.address1 ?? ''
    await apiUpdate(orderId, { address1: addr || null })
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, address1: addr || null } : o))
  }

  async function handlePhoneBlur(orderId: string) {
    const phone = editingPhone[orderId] ?? orders.find(o => o.id === orderId)?.customer_phone ?? ''
    if (!phone) return
    await apiUpdate(orderId, { customer_phone: phone })
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, customer_phone: phone } : o))
  }

  async function handleNameBlur(orderId: string) {
    const name = editingName[orderId] ?? orders.find(o => o.id === orderId)?.customer_name ?? ''
    if (!name) return
    await apiUpdate(orderId, { customer_name: name })
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, customer_name: name } : o))
  }

  function getPhoneValue(order: any) {
    return editingPhone[order.id] !== undefined ? editingPhone[order.id] : (order.customer_phone || '')
  }

  function getNameValue(order: any) {
    return editingName[order.id] !== undefined ? editingName[order.id] : (order.customer_name || '')
  }

  async function handleVariantBlur(orderId: string) {
    const variant = editingVariant[orderId] ?? orders.find(o => o.id === orderId)?.product_variant ?? ''
    await apiUpdate(orderId, { product_variant: variant || null })
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, product_variant: variant || null } : o))
  }

  async function handlePriceBlur(orderId: string) {
    const price = parseFloat(editingPrice[orderId] ?? '')
    if (isNaN(price) || price <= 0) return
    await apiUpdate(orderId, { selling_price: price })
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, selling_price: price } : o))
  }

  function getVariantValue(order: any) {
    return editingVariant[order.id] !== undefined ? editingVariant[order.id] : (order.product_variant || '')
  }

  function getPriceValue(order: any) {
    return editingPrice[order.id] !== undefined ? editingPrice[order.id] : String(order.selling_price || '')
  }

  function getAddressValue(order: any) {
    if (editingAddress[order.id] !== undefined) return editingAddress[order.id]
    return [order.address1, order.address2].filter(Boolean).join(', ') || ''
  }

  function openAmeexModal(order: any) {
    setAmeexError(null)
    setAmeexModal({ order, cityName: '', openParcel: true, address: order.address1 || '', phone: order.customer_phone || '', customerName: order.customer_name || '' })
    if (ameexCities.length === 0 && !loadingCities) {
      setLoadingCities(true)
      fetch('/api/ameex/cities')
        .then(r => r.json())
        .then((data: { id: number; name: string }[]) => {
          if (Array.isArray(data)) {
            setAmeexCities(data)
            const match = data.find(c => c.name.toLowerCase() === (order.city || '').toLowerCase())
            setAmeexModal(m => m ? { ...m, cityName: match?.name ?? '' } : m)
          }
        })
        .catch(() => {})
        .finally(() => setLoadingCities(false))
    } else {
      const match = ameexCities.find(c => c.name.toLowerCase() === (order.city || '').toLowerCase())
      setAmeexModal(m => m ? { ...m, cityName: match?.name ?? '' } : m)
    }
  }

  async function handleSendAmeex() {
    if (!ameexModal) return
    const { order, cityName, openParcel } = ameexModal
    if (!cityName) { setAmeexError('La ville est requise'); return }
    const cityObj = ameexCities.find(c => c.name.toLowerCase() === cityName.toLowerCase())
    if (!cityObj) { setAmeexError(`Ville "${cityName}" introuvable — sélectionnez dans la liste`); return }
    if (!ameexModal.address.trim()) { setAmeexError('Adresse obligatoire'); return }
    setSendingAmeex(true)
    setAmeexError(null)
    try {
      const res = await fetch('/api/ameex/send-parcel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, cityId: cityObj.id, cityName, openParcel, address: ameexModal.address, phone: ameexModal.phone, customerName: ameexModal.customerName }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAmeexError(data.error || 'Erreur Ameex')
      } else {
        const orderId = order.id
        setOrders(prev => prev.map(o => o.id === orderId ? {
          ...o,
          ameex_sent_at: new Date().toISOString(),
          ...(data.tracking_code ? { tracking_code: data.tracking_code } : {}),
          ...(data.auto_confirmed ? { status: 'confirmed' } : {}),
          ...(ameexModal.address ? { address1: ameexModal.address } : {}),
          ...(cityName ? { city: cityName } : {}),
          ...(ameexModal.phone ? { customer_phone: ameexModal.phone } : {}),
          ...(ameexModal.customerName ? { customer_name: ameexModal.customerName } : {}),
        } : o))
        setAmeexModal(null)
        // Refetch after 2s to capture tracking code if not in initial response
        setTimeout(async () => {
          const { data: fresh } = await supabase.from('orders').select('tracking_code, ameex_sent_at, status').eq('id', orderId).single()
          if (fresh) setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...fresh } : o))
        }, 2000)
      }
    } catch {
      setAmeexError('Erreur réseau')
    }
    setSendingAmeex(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-white">Mes Leads — {agentProfile.full_name}</h1>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            LIVE
          </span>
        </div>
        {agentProfile.commission_rate > 0 && (
          <p className="text-slate-400 text-sm">Commission: {agentProfile.commission_rate}% sur les livraisons</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-slate-500 text-xs mb-1">Leads du jour</p>
            <p className="font-bold text-lg text-yellow-400">{stats.leadsToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-slate-500 text-xs mb-1">Non traités</p>
            <p className="font-bold text-lg text-red-400">{stats.untreated}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-slate-500 text-xs mb-1">Traités</p>
            <p className="font-bold text-lg text-white">{stats.processedTotal}</p>
            <p className="text-[10px] text-slate-500">{formatPercent(stats.processedRate)} du total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-slate-500 text-xs mb-1">Confirmés</p>
            <p className="font-bold text-lg text-emerald-400">{stats.confirmedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-slate-500 text-xs mb-1">Taux confirm.</p>
            <p className="font-bold text-lg text-blue-300">{formatPercent(stats.confirmRate)}</p>
            <p className="text-[10px] text-slate-500">sur traités</p>
          </CardContent>
        </Card>
        {[
          { label: 'Livres',        value: stats.delivered,                   color: 'text-green-400' },
          { label: 'Pas rep. livr.',value: stats.deliveryNoAnswer,            color: 'text-orange-400' },
          { label: 'Taux livraison',value: formatPercent(stats.deliveryRate), color: 'text-indigo-400' },
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
        {activeTab === 'confirmed' && (
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {([['all','Tous'],['pending','⏳ En attente'],['sent','✓ Envoyés']] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilterAmeex(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterAmeex === v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >{l}</button>
            ))}
          </div>
        )}
        {allProducts.length > 1 && (
          <select
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tous les produits</option>
            {allProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
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
        <div className="flex flex-wrap items-center gap-2">
          {/* Presets */}
          {[
            { label: 'Hier', days: -1 },
            { label: '7j',  days: 7 },
            { label: '30j', days: 30 },
          ].map(p => {
            const d = new Date()
            const yesterday = new Date(d.getTime() - 86400000).toISOString().slice(0,10)
            const from = p.days === 0 ? d.toISOString().slice(0,10) : p.days === -1 ? yesterday : new Date(d.getTime() - p.days * 86400000).toISOString().slice(0,10)
            const to   = p.days === -1 ? yesterday : d.toISOString().slice(0,10)
            const active = dateFrom === from && dateTo === to
            return (
              <button key={p.label} onClick={() => { setDateFrom(from); setDateTo(to) }}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500'}`}>
                {p.label}
              </button>
            )
          })}
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500" />
          <span className="text-slate-500 text-sm">→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">✕</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-800/50 rounded-xl p-1">
        {TABS.map(t => {
          const count = tabCounts[t.key]
          const colors: Record<string, string> = {
            queue: 'bg-orange-500 text-white',
            retry: 'bg-amber-500 text-white',
            callback: 'bg-purple-500 text-white',
            confirmed: 'bg-indigo-600 text-white',
            cancelled: 'bg-red-600 text-white',
            delivered: 'bg-green-600 text-white',
            all: 'bg-slate-600 text-white',
          }
          return (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === t.key ? colors[t.key] : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === t.key ? 'bg-white/20' : 'bg-slate-700'}`}>
              {count}
            </span>
          </button>
          )}
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto pb-1">
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
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={getPhoneValue(order)}
                          onChange={e => setEditingPhone(prev => ({ ...prev, [order.id]: e.target.value }))}
                          onBlur={() => handlePhoneBlur(order.id)}
                          data-lpignore="true"
                          autoComplete="off"
                          className="bg-transparent border-b border-slate-700 focus:border-indigo-500 outline-none text-indigo-400 font-mono text-sm font-bold placeholder-slate-600 w-32 py-1"
                        />
                        {phoneHistory[order.id] === undefined ? (
                          <button
                            onClick={async () => {
                              const phone = getPhoneValue(order)
                              if (!phone) return
                              setPhoneHistory(prev => ({ ...prev, [order.id]: null }))
                              try {
                                // Try Ameex directly from browser (uses C-Auth-Key from localStorage)
                                const authKey = localStorage.getItem('C-Auth-Key')
                                if (authKey) {
                                  const res = await fetch('https://api.ameex.app/customer/Delivery/Parcels/PhoneSearch', {
                                    method: 'POST',
                                    headers: { 'C-Auth-Key': authKey, 'Content-Type': 'application/x-www-form-urlencoded' },
                                    body: new URLSearchParams({ phone }).toString(),
                                  })
                                  const data = await res.json()
                                  if (data?.login === 'success' && data?.api) {
                                    setPhoneHistory(prev => ({ ...prev, [order.id]: { source: 'ameex', ...data.api } }))
                                    return
                                  }
                                }
                              } catch { /* fall through to our DB */ }
                              // Fallback: our own DB
                              const res = await fetch(`/api/phone-history?phone=${encodeURIComponent(phone)}`)
                              const data = await res.json()
                              setPhoneHistory(prev => ({ ...prev, [order.id]: { source: 'local', ...data } }))
                            }}
                            title="Vérifier historique Ameex"
                            className="text-slate-500 hover:text-indigo-400 text-[10px] transition-colors"
                          >🔍</button>
                        ) : phoneHistory[order.id] === null ? (
                          <span className="text-[10px] text-slate-500">...</span>
                        ) : <PhoneHistoryBadge data={phoneHistory[order.id]} />}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-300 text-xs whitespace-nowrap">{order.city || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input
                        type="text"
                        value={getNameValue(order)}
                        onChange={e => setEditingName(prev => ({ ...prev, [order.id]: e.target.value }))}
                        onBlur={() => handleNameBlur(order.id)}
                        data-lpignore="true"
                        autoComplete="off"
                        className="bg-transparent border-b border-slate-700 focus:border-indigo-500 outline-none text-white text-sm font-medium placeholder-slate-600 w-24 py-1"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      <span className="text-slate-400">{order.products?.name || '—'}</span>
                      {order.campaign_name && (
                        <span className={`ml-1.5 text-[10px] font-bold px-1 py-0.5 rounded ${
                          order.ad_platform === 'facebook' ? 'bg-blue-500/20 text-blue-400' :
                          order.ad_platform === 'tiktok'   ? 'bg-pink-500/20 text-pink-400' :
                          order.ad_platform === 'youtube'  ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-600/40 text-slate-400'
                        }`}>
                          {order.ad_platform === 'facebook' ? 'FB' : order.ad_platform === 'tiktok' ? 'TK' : order.ad_platform === 'youtube' ? 'YT' : '?'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input
                        type="text"
                        value={getVariantValue(order)}
                        placeholder="Variante..."
                        onChange={e => setEditingVariant(prev => ({ ...prev, [order.id]: e.target.value }))}
                        onBlur={() => handleVariantBlur(order.id)}
                        data-lpignore="true"
                        autoComplete="off"
                        className="bg-transparent border-b border-slate-700 focus:border-indigo-500 outline-none text-xs text-slate-300 placeholder-slate-600 w-28 py-1"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-0.5">
                        <input
                          type="number"
                          value={getPriceValue(order)}
                          onChange={e => setEditingPrice(prev => ({ ...prev, [order.id]: e.target.value }))}
                          onBlur={() => handlePriceBlur(order.id)}
                          data-lpignore="true"
                          className="bg-transparent border-b border-slate-700 focus:border-indigo-500 outline-none text-xs text-green-400 font-bold w-16 py-1"
                        />
                        <span className="text-xs text-slate-500">MAD</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={getAddressValue(order)}
                        placeholder="Adresse..."
                        onChange={e => setEditingAddress(prev => ({ ...prev, [order.id]: e.target.value }))}
                        onBlur={() => handleAddressBlur(order.id)}
                        data-lpignore="true"
                        autoComplete="off"
                        className="bg-transparent border-b border-slate-700 focus:border-indigo-500 outline-none text-xs text-slate-300 placeholder-slate-600 w-40 py-1"
                      />
                    </td>

                    {/* ETAT */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {AMEEX_LOCKED.includes(order.status) ? (
                          <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${COLOR_MAP[order.status] || 'bg-slate-700 text-slate-300'}`}>
                            🔒 {STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status}
                          </span>
                        ) : (
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
                        )}
                        {order.status === 'confirmed' && (
                          order.tracking_code ? (
                            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title={`Ameex: ${order.tracking_code}`} />
                          ) : order.ameex_sent_at ? (
                            <span className="w-2 h-2 rounded-full bg-green-400/50 shrink-0" title="Envoyé Ameex" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" title="À envoyer vers Ameex" />
                          )
                        )}
                      </div>
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
                    <td className="px-3 py-2">
                      {order.status === 'confirmed' && (
                        <button
                          onClick={() => openAmeexModal(order)}
                          title={order.tracking_code ? `Code: ${order.tracking_code}` : order.ameex_sent_at ? 'Déjà envoyé — renvoyer ?' : 'Envoyer vers Ameex'}
                          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                            order.tracking_code
                              ? 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20'
                              : order.ameex_sent_at
                              ? 'text-slate-300 border-slate-500 bg-slate-700/50 hover:bg-slate-600/50'
                              : 'text-orange-400 border-orange-500/30 hover:text-white hover:bg-orange-500/20'
                          }`}
                        >
                          {order.tracking_code ? `✓ AMX` : 'AMX'}
                        </button>
                      )}
                      {order.tracking_code && (
                        <span title={order.tracking_code} className="text-[10px] text-green-400 font-mono px-1.5 py-0.5 bg-green-500/10 rounded border border-green-500/20 max-w-[80px] truncate block">
                          {order.tracking_code}
                        </span>
                      )}
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

      {/* AMEEX MODAL */}
      {ameexModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-orange-400 font-bold text-sm">AMEEX</span>
                <h2 className="font-semibold text-white text-sm">Créer le colis</h2>
              </div>
              <button onClick={() => setAmeexModal(null)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-20 shrink-0">Nom</span>
                  <input type="text" value={ameexModal.customerName} onChange={e => setAmeexModal(m => m ? { ...m, customerName: e.target.value } : m)} data-lpignore="true" autoComplete="off" className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-20 shrink-0">Téléphone</span>
                  <input type="text" value={ameexModal.phone} onChange={e => setAmeexModal(m => m ? { ...m, phone: e.target.value } : m)} data-lpignore="true" autoComplete="off" className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex justify-between"><span className="text-slate-400">COD</span><span className="text-green-400 font-bold">{ameexModal.order.selling_price} MAD</span></div>
              </div>

              {/* Adresse */}
              <div>
                <label className="text-sm text-slate-300 block mb-1">Adresse <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="Ex: Rue Hassan II, Appt 3..."
                  value={ameexModal.address}
                  onChange={e => setAmeexModal(m => m ? { ...m, address: e.target.value } : m)}
                  data-lpignore="true"
                  autoComplete="off"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                />
              </div>

              <div className="relative">
                <label className="text-sm text-slate-300 block mb-1">Ville de livraison <span className="text-red-400">*</span></label>
                <button
                  type="button"
                  onClick={() => { if (!loadingCities) setCityDropOpen(o => !o) }}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  disabled={loadingCities}
                >
                  <span className={ameexModal.cityName ? 'text-white' : 'text-slate-500'}>
                    {loadingCities ? 'Chargement…' : (ameexModal.cityName || '— Sélectionner une ville —')}
                  </span>
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {cityDropOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => { setCityDropOpen(false); setCitySearch('') }} />
                    <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden">
                      <div className="p-2 border-b border-slate-700">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Rechercher une ville…"
                          value={citySearch}
                          onChange={e => setCitySearch(e.target.value)}
                          className="w-full bg-slate-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none placeholder-slate-500"
                        />
                      </div>
                      <div className="overflow-y-auto max-h-44">
                        {ameexCities
                          .filter(c => c.name.toLowerCase().includes(citySearch.toLowerCase()))
                          .map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setAmeexModal(m => m ? { ...m, cityName: c.name } : m); setCityDropOpen(false); setCitySearch('') }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${ameexModal.cityName === c.name ? 'text-indigo-400 font-medium bg-indigo-500/10' : 'text-white'}`}
                            >
                              {c.name}
                            </button>
                          ))}
                        {ameexCities.filter(c => c.name.toLowerCase().includes(citySearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-3 text-slate-500 text-sm">Aucune ville trouvée</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {!loadingCities && ameexModal.order.city && !ameexModal.cityName && (
                  <p className="text-xs text-amber-400 mt-1">Ville commande : "{ameexModal.order.city}"</p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">Colis ouvert à la livraison</p>
                </div>
                <button
                  onClick={() => setAmeexModal(m => m ? { ...m, openParcel: !m.openParcel } : m)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ameexModal.openParcel ? 'bg-green-600' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${ameexModal.openParcel ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {ameexError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{ameexError}</div>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setAmeexModal(null)} className="flex-1 px-4 py-2 rounded-lg text-slate-400 bg-slate-800 hover:bg-slate-700 text-sm transition-colors">
                  Annuler
                </button>
                <button
                  onClick={handleSendAmeex}
                  disabled={sendingAmeex || loadingCities || !ameexModal.cityName}
                  className="flex-1 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  {sendingAmeex ? 'Envoi...' : 'Envoyer vers Ameex'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
