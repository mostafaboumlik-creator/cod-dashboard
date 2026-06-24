'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { calcNetProfit } from '@/lib/calculations'
import { formatCurrency } from '@/lib/utils'
import type { Order, OrderStatus, AdPlatform } from '@/lib/types'
import { format } from 'date-fns'

interface SheetProduct {
  id: string
  name: string
  category?: string | null
  selling_price: number
  product_cost: number
  packaging_cost: number
  google_sheet_url?: string | null
  sheet_sync_active?: boolean | null
}

interface Props {
  initialOrders: Order[]
  products: SheetProduct[]
  mediaBuyers: { id: string; full_name: string; commission_rate: number }[]
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'lead',               label: 'Lead' },
  { value: 'call_later',         label: 'Rappeler' },
  { value: 'no_reply',           label: 'Pas de reponse' },
  { value: 'unreachable',        label: 'Injoignable' },
  { value: 'wrong_number',       label: 'Faux numero' },
  { value: 'confirmed',          label: 'Confirme' },
  { value: 'picked_up',          label: 'Ramassé' },
  { value: 'received_hub',       label: 'Reçu agence' },
  { value: 'address_issue',      label: 'Attente adresse' },
  { value: 'in_delivery',        label: 'En livraison' },
  { value: 'out_of_zone',        label: 'Hors-zone' },
  { value: 'refused',            label: 'Refusé' },
  { value: 'preparing_return',   label: 'Prép. retour' },
  { value: 'redirect_city',      label: 'Renvoi ville' },
  { value: 'delivered',          label: 'Livre' },
  { value: 'returned',           label: 'Retour' },
  { value: 'cancelled',          label: 'Annule' },
  { value: 'out_of_stock',       label: 'Rupture stock' },
  { value: 'duplicate',          label: 'Doublon' },
  { value: 'delivery_no_answer', label: 'Pas rep. livraison' },
  { value: 'postponed',          label: 'Reporté' },
]

const STATUS_COLORS: Record<OrderStatus, string> = {
  lead:                 'bg-slate-700 text-slate-300',
  call_later:           'bg-purple-500/20 text-purple-300',
  no_reply:             'bg-slate-700 text-slate-400',
  unreachable:          'bg-slate-700 text-slate-400',
  wrong_number:         'bg-red-500/20 text-red-400',
  confirmed:            'bg-blue-500/20 text-blue-300',
  picked_up:            'bg-cyan-500/20 text-cyan-300',
  received_hub:         'bg-teal-500/20 text-teal-300',
  address_issue:        'bg-yellow-500/20 text-yellow-300',
  in_delivery:          'bg-sky-500/20 text-sky-300',
  out_of_zone:          'bg-yellow-600/20 text-yellow-400',
  refused:              'bg-red-600/20 text-red-400',
  preparing_return:     'bg-orange-600/20 text-orange-400',
  redirect_city:        'bg-indigo-500/20 text-indigo-300',
  delivered:            'bg-green-500/20 text-green-300',
  returned:             'bg-amber-500/20 text-amber-300',
  cancelled:            'bg-red-500/20 text-red-400',
  out_of_stock:         'bg-amber-500/20 text-amber-400',
  duplicate:            'bg-purple-500/20 text-purple-400',
  delivery_no_answer:   'bg-orange-500/20 text-orange-400',
  postponed:            'bg-yellow-500/20 text-yellow-300',
}

const EMPTY_FORM = {
  media_buyer_id: '',
  product_id: '',
  status: 'lead' as OrderStatus,
  selling_price: 0,
  product_cost: 0,
  packaging_cost: 0,
  delivery_cost: 20,
  call_center_cost: 5,
  campaign_name: '',
  ad_platform: 'facebook' as AdPlatform,
  customer_name: '',
  customer_phone: '',
  city: '',
  notes: '',
  tracking_code: '',
}

const FOLLOWUP_OPTIONS = [
  { value: '', label: '—' },
  { value: 'lead',         label: 'Lead' },
  { value: 'call_later',   label: 'Rappeler' },
  { value: 'no_reply',     label: 'Pas de rep.' },
  { value: 'unreachable',  label: 'Injoignable' },
  { value: 'wrong_number', label: 'Faux num.' },
  { value: 'confirmed',    label: 'Confirme' },
  { value: 'delivered',    label: 'Livre' },
  { value: 'returned',     label: 'Retour' },
  { value: 'cancelled',    label: 'Annule' },
]

export function OrdersManager({ initialOrders, products, mediaBuyers }: Props) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [activeTab, setActiveTab] = useState<'orders' | 'sheets'>('orders')

  // Orders tab state
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterBuyer, setFilterBuyer] = useState('all')
  const [filterProduct, setFilterProduct] = useState('all')
  const [filterSheet, setFilterSheet] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [notesMap, setNotesMap] = useState<Record<string, string>>({})

  // Sheets tab state
  const [sheetData, setSheetData] = useState<SheetProduct[]>(products)
  const [sheetUrlEdits, setSheetUrlEdits] = useState<Record<string, string>>({})
  const [savingSheet, setSavingSheet] = useState<string | null>(null)

  // Ameex state
  const [ameexModal, setAmeexModal] = useState<{ order: Order; cityName: string; openParcel: boolean; address: string; phone: string; customerName: string } | null>(null)
  const [sendingAmeex, setSendingAmeex] = useState(false)
  const [ameexError, setAmeexError] = useState<string | null>(null)
  const [ameexCities, setAmeexCities] = useState<{ id: number; name: string }[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [cityDropOpen, setCityDropOpen] = useState(false)
  const [citySearch, setCitySearch] = useState('')

  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime-admin')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          const { data: newOrder } = await supabase
            .from('orders')
            .select('id, media_buyer_id, product_id, status, selling_price, product_cost, packaging_cost, delivery_cost, call_center_cost, ad_spend, campaign_name, ad_platform, customer_name, customer_phone, city, notes, product_variant, address1, address2, youcan_order_id, second_contact, day1_contact, confirmed_by, created_at, confirmed_at, delivered_at, profiles(full_name), products(id, name)')
            .eq('id', payload.new.id)
            .single()
          if (newOrder) setOrders(prev => [newOrder as any, ...prev])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Orders handlers ──────────────────────────────────────────────

  function fillFormFromProduct(productId: string) {
    const p = products.find(p => p.id === productId)
    if (p) setForm(f => ({ ...f, product_id: productId, selling_price: p.selling_price, product_cost: p.product_cost, packaging_cost: p.packaging_cost }))
    else setForm(f => ({ ...f, product_id: productId }))
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      selling_price: Number(form.selling_price),
      product_cost: Number(form.product_cost),
      packaging_cost: Number(form.packaging_cost),
      delivery_cost: Number(form.delivery_cost),
      call_center_cost: Number(form.call_center_cost),
      tracking_code: form.tracking_code || null,
    }
    if (editingOrder) {
      const { data } = await supabase.from('orders').update(payload).eq('id', editingOrder.id).select('*, products(id, name)').single()
      if (data) setOrders(prev => prev.map(o => o.id === editingOrder.id ? data as Order : o))
    } else {
      const { data } = await supabase.from('orders').insert(payload).select('*, products(id, name)').single()
      if (data) setOrders(prev => [data as Order, ...prev])
    }
    setSaving(false)
    setShowForm(false)
    setEditingOrder(null)
    setForm(EMPTY_FORM)
  }

  async function handleQuickStatus(orderId: string, newStatus: OrderStatus) {
    setUpdatingStatus(orderId)
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    setUpdatingStatus(null)
  }

  async function handleFollowup(orderId: string, field: 'second_contact' | 'day1_contact', value: string) {
    await supabase.from('orders').update({ [field]: value || null }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: value || null } : o))
  }

  async function handleNotesBlur(orderId: string) {
    const notes = notesMap[orderId]
    if (notes === undefined) return
    await supabase.from('orders').update({ notes: notes || null }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes: notes || null } : o))
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette commande ?')) return
    await supabase.from('orders').delete().eq('id', id)
    setOrders(prev => prev.filter(o => o.id !== id))
  }

  function openEdit(order: Order) {
    setEditingOrder(order)
    setForm({
      media_buyer_id: order.media_buyer_id,
      product_id: order.product_id,
      status: order.status,
      selling_price: order.selling_price,
      product_cost: order.product_cost,
      packaging_cost: order.packaging_cost,
      delivery_cost: order.delivery_cost,
      call_center_cost: order.call_center_cost,
      campaign_name: order.campaign_name || '',
      ad_platform: order.ad_platform || 'facebook',
      customer_name: order.customer_name || '',
      customer_phone: order.customer_phone || '',
      city: order.city || '',
      notes: order.notes || '',
      tracking_code: (order as any).tracking_code || '',
    })
    setShowForm(true)
  }

  // ── Ameex handler ────────────────────────────────────────────────

  function openAmeexModal(order: Order) {
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
        } as any : o))
        setAmeexModal(null)
        setTimeout(async () => {
          const { data: fresh } = await supabase.from('orders').select('tracking_code, ameex_sent_at, status').eq('id', orderId).single()
          if (fresh) setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...fresh } as any : o))
        }, 2000)
      }
    } catch {
      setAmeexError('Erreur réseau')
    }
    setSendingAmeex(false)
  }

  // ── Sheets handlers ──────────────────────────────────────────────

  async function handleSaveSheetUrl(productId: string) {
    const url = sheetUrlEdits[productId]
    if (url === undefined) return
    setSavingSheet(productId)
    await supabase.from('products').update({ google_sheet_url: url.trim() || null }).eq('id', productId)
    setSheetData(prev => prev.map(p => p.id === productId ? { ...p, google_sheet_url: url.trim() || null } : p))
    setSheetUrlEdits(prev => { const n = { ...prev }; delete n[productId]; return n })
    setSavingSheet(null)
  }

  async function handleToggleSheet(productId: string) {
    const current = sheetData.find(p => p.id === productId)
    const newActive = current?.sheet_sync_active === false ? true : false
    await supabase.from('products').update({ sheet_sync_active: newActive }).eq('id', productId)
    setSheetData(prev => prev.map(p => p.id === productId ? { ...p, sheet_sync_active: newActive } : p))
  }

  // ── Computed ─────────────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = products.map(p => p.category).filter(Boolean) as string[]
    return [...new Set(cats)].sort()
  }, [products])

  const productsByCategory = useMemo(() => {
    if (filterCategory === 'all') return null
    return new Set(products.filter(p => p.category === filterCategory).map(p => p.id))
  }, [products, filterCategory])

  const filtered = useMemo(() => orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false
    if (filterBuyer !== 'all' && o.media_buyer_id !== filterBuyer) return false
    if (filterProduct !== 'all' && o.product_id !== filterProduct) return false
    if (filterSheet !== 'all' && o.product_id !== filterSheet) return false
    if (productsByCategory && !productsByCategory.has(o.product_id)) return false
    if (dateFrom && o.created_at < dateFrom) return false
    if (dateTo && o.created_at > dateTo + 'T23:59:59') return false
    if (search) {
      const s = search.toLowerCase()
      const name = o.customer_name?.toLowerCase() || ''
      const phone = o.customer_phone?.toLowerCase() || ''
      const city = o.city?.toLowerCase() || ''
      if (!name.includes(s) && !phone.includes(s) && !city.includes(s)) return false
    }
    return true
  }), [orders, filterStatus, filterBuyer, filterProduct, filterSheet, search, dateFrom, dateTo, productsByCategory])

  const sheetsWithUrl = useMemo(() => sheetData.filter(p => p.google_sheet_url), [sheetData])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white">Gestion des Commandes</h1>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              LIVE
            </span>
            {/* Tab switcher */}
            <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('orders')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'orders' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Commandes
                <span className="bg-white/20 text-[10px] px-1 rounded-full">{orders.length}</span>
              </button>
              <button
                onClick={() => setActiveTab('sheets')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'sheets' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
                Google Sheets
                <span className={`text-[10px] px-1 rounded-full ${activeTab === 'sheets' ? 'bg-white/20' : 'bg-slate-700'}`}>
                  {sheetData.filter(p => p.sheet_sync_active !== false && p.google_sheet_url).length}/{sheetData.length}
                </span>
              </button>
            </div>
          </div>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeTab === 'orders' ? `${filtered.length} commandes affichees` : `${sheetData.length} produits configurables`}
          </p>
        </div>
        {activeTab === 'orders' && (
          <Button onClick={() => { setEditingOrder(null); setForm(EMPTY_FORM); setShowForm(true) }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle commande
          </Button>
        )}
      </div>

      {/* ── ONGLET COMMANDES ─────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="flex flex-wrap gap-3 py-3">
              <Input className="w-48" placeholder="Rechercher client..." value={search} onChange={e => setSearch(e.target.value)} />
              <Select className="w-44" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">Tous les statuts</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
              <Select className="w-44" value={filterBuyer} onChange={e => setFilterBuyer(e.target.value)}>
                <option value="all">Tous les buyers</option>
                {mediaBuyers.map(b => <option key={b.id} value={b.id}>{b.full_name}</option>)}
              </Select>
              {products.length > 1 && (
                <Select className="w-44" value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
                  <option value="all">Tous les produits</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
              {sheetsWithUrl.length > 0 && (
                <Select
                  className="w-48"
                  value={filterSheet}
                  onChange={e => setFilterSheet(e.target.value)}
                >
                  <option value="all">Toutes les feuilles</option>
                  {sheetsWithUrl.map(p => (
                    <option key={p.id} value={p.id}>
                      📊 {p.name}
                    </option>
                  ))}
                </Select>
              )}
              {categories.length > 0 && (
                <Select className="w-40" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                  <option value="all">Toutes categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {[{ label: "Auj.", days: 0 }, { label: 'Hier', days: -1 }, { label: '7j', days: 7 }, { label: '30j', days: 30 }].map(p => {
                  const d = new Date()
                  const yesterday = new Date(d.getTime() - 86400000).toISOString().slice(0,10)
                  const from = p.days === 0 ? d.toISOString().slice(0,10) : p.days === -1 ? yesterday : new Date(d.getTime() - p.days * 86400000).toISOString().slice(0,10)
                  const to = p.days === -1 ? yesterday : d.toISOString().slice(0,10)
                  const active = dateFrom === from && dateTo === to
                  return (
                    <button key={p.label} onClick={() => { setDateFrom(from); setDateTo(to) }}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}>
                      {p.label}
                    </button>
                  )
                })}
                <Input type="date" className="w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <span className="text-slate-500 text-sm">→</span>
                <Input type="date" className="w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-700">✕</button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Form modal */}
          {showForm && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                  <h2 className="font-semibold text-white">{editingOrder ? 'Modifier la commande' : 'Nouvelle commande'}</h2>
                  <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Media Buyer</Label>
                      <Select value={form.media_buyer_id} onChange={e => setForm(f => ({ ...f, media_buyer_id: e.target.value }))}>
                        <option value="">Selectionner...</option>
                        {mediaBuyers.map(b => <option key={b.id} value={b.id}>{b.full_name}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label>Produit</Label>
                      <Select value={form.product_id} onChange={e => fillFormFromProduct(e.target.value)}>
                        <option value="">Selectionner...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label>Statut</Label>
                      <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as OrderStatus }))}>
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label>Plateforme pub</Label>
                      <Select value={form.ad_platform} onChange={e => setForm(f => ({ ...f, ad_platform: e.target.value as AdPlatform }))}>
                        <option value="facebook">Facebook</option>
                        <option value="tiktok">TikTok</option>
                        <option value="youtube">YouTube</option>
                        <option value="other">Autre</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Nom client</Label>
                      <Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Nom..." />
                    </div>
                    <div>
                      <Label>Telephone</Label>
                      <Input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="06..." />
                    </div>
                    <div>
                      <Label>Ville</Label>
                      <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Casablanca..." />
                    </div>
                    <div>
                      <Label>Campagne</Label>
                      <Input value={form.campaign_name} onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))} placeholder="Nom de campagne..." />
                    </div>
                  </div>
                  <div className="border-t border-slate-700 pt-4">
                    <p className="text-sm font-medium text-slate-300 mb-3">Couts (MAD)</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Prix vente', key: 'selling_price' },
                        { label: 'Cout produit', key: 'product_cost' },
                        { label: 'Packaging', key: 'packaging_cost' },
                        { label: 'Livraison', key: 'delivery_cost' },
                        { label: 'Call center', key: 'call_center_cost' },
                      ].map(({ label, key }) => (
                        <div key={key}>
                          <Label>{label}</Label>
                          <Input type="number" step="0.01" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 p-3 rounded-lg bg-slate-800/50 text-sm">
                      <span className="text-slate-400">Profit net estime: </span>
                      <span className={`font-bold ${calcNetProfit({ ...form, selling_price: Number(form.selling_price), product_cost: Number(form.product_cost), packaging_cost: Number(form.packaging_cost), delivery_cost: Number(form.delivery_cost), call_center_cost: Number(form.call_center_cost), ad_spend: 0 } as any) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(calcNetProfit({ ...form, selling_price: Number(form.selling_price), product_cost: Number(form.product_cost), packaging_cost: Number(form.packaging_cost), delivery_cost: Number(form.delivery_cost), call_center_cost: Number(form.call_center_cost), ad_spend: 0 } as any))}
                      </span>
                    </div>
                  </div>
                  {['confirmed','delivered','returned','delivery_no_answer'].includes(form.status) && (
                    <div>
                      <Label>Code de suivi Ameex</Label>
                      <Input value={form.tracking_code} onChange={e => setForm(f => ({ ...f, tracking_code: e.target.value }))} placeholder="Ex: AZR0526B21479UU7569908" className="font-mono" />
                      <p className="text-xs text-slate-500 mt-1">Necessaire pour la mise a jour automatique du statut via Ameex</p>
                    </div>
                  )}
                  <div>
                    <Label>Notes</Label>
                    <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes..." />
                  </div>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
                  <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
                  <Button onClick={handleSave} disabled={saving || !form.media_buyer_id || !form.product_id}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Stats summary */}
          {filtered.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-2">
              {STATUS_OPTIONS.map(s => {
                const count = filtered.filter(o => o.status === s.value).length
                if (count === 0) return null
                return (
                  <button
                    key={s.value}
                    onClick={() => setFilterStatus(filterStatus === s.value ? 'all' : s.value)}
                    className={`rounded-lg p-2 text-center transition-all border ${filterStatus === s.value ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-transparent hover:border-slate-600'} ${STATUS_COLORS[s.value]}`}
                  >
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs opacity-75 truncate">{s.label}</p>
                  </button>
                )
              })}
            </div>
          )}

          {/* Orders table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto pb-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs">
                      <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">#</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Date</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">Telephone</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3">Ville</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3">Client</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3">Produit</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3">Variante</th>
                      <th className="text-right text-slate-400 font-medium px-3 py-3">Prix</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3">Adresse</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3">ETAT</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3 whitespace-nowrap">2EM ETAT</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3">J+1</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3">REMARQUE</th>
                      <th className="text-left text-slate-400 font-medium px-3 py-3">Buyer</th>
                      <th className="text-right text-slate-400 font-medium px-3 py-3">Profit</th>
                      <th className="text-right text-slate-400 font-medium px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((order, idx) => {
                      const np = calcNetProfit(order)
                      const currentNotes = notesMap[order.id] !== undefined ? notesMap[order.id] : (order.notes || '')
                      return (
                        <tr key={order.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                          <td className="px-3 py-2 text-slate-500 text-xs">{idx + 1}</td>
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap text-xs">{format(new Date(order.created_at), 'dd/MM/yy HH:mm')}</td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            <a href={`tel:${order.customer_phone}`} className="text-indigo-400 hover:text-indigo-300 font-medium">{order.customer_phone || '—'}</a>
                          </td>
                          <td className="px-3 py-2 text-slate-300 text-xs">{order.city || '—'}</td>
                          <td className="px-3 py-2 text-white font-medium text-xs">{order.customer_name || '—'}</td>
                          <td className="px-3 py-2 text-xs">
                            <span className="text-slate-400">{(order.products as any)?.name || '—'}</span>
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
                          <td className="px-3 py-2 text-slate-400 text-xs">{(order as any).product_variant || '—'}</td>
                          <td className="px-3 py-2 text-right text-green-400 font-semibold text-xs whitespace-nowrap">{order.selling_price ? `${order.selling_price} MAD` : '—'}</td>
                          <td className="px-3 py-2 text-slate-400 text-xs max-w-[120px] truncate">{(order as any).address1 || '—'}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={order.status}
                                disabled={updatingStatus === order.id}
                                onChange={e => handleQuickStatus(order.id, e.target.value as OrderStatus)}
                                className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${STATUS_COLORS[order.status]}`}
                              >
                                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} className="bg-slate-800 text-white">{s.label}</option>)}
                              </select>
                              {order.status === 'confirmed' && (
                                (order as any).tracking_code ? (
                                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title={`Ameex: ${(order as any).tracking_code}`} />
                                ) : (order as any).ameex_sent_at ? (
                                  <span className="w-2 h-2 rounded-full bg-green-400/50 shrink-0" title="Envoyé Ameex — en attente code" />
                                ) : (
                                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" title="À envoyer vers Ameex" />
                                )
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <select value={(order as any).second_contact || ''} onChange={e => handleFollowup(order.id, 'second_contact', e.target.value)} className="text-xs bg-transparent border-b border-slate-600 text-slate-300 focus:outline-none focus:border-indigo-400 cursor-pointer">
                              {FOLLOWUP_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select value={(order as any).day1_contact || ''} onChange={e => handleFollowup(order.id, 'day1_contact', e.target.value)} className="text-xs bg-transparent border-b border-slate-600 text-slate-300 focus:outline-none focus:border-indigo-400 cursor-pointer">
                              {FOLLOWUP_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input value={currentNotes} onChange={e => setNotesMap(m => ({ ...m, [order.id]: e.target.value }))} onBlur={() => handleNotesBlur(order.id)} placeholder="—" className="text-xs bg-transparent border-b border-slate-700 text-slate-300 focus:outline-none focus:border-indigo-400 w-28 placeholder-slate-600" />
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-xs">{mediaBuyers.find(b => b.id === order.media_buyer_id)?.full_name || '—'}</td>
                          <td className={`px-3 py-2 text-right font-medium text-xs ${np >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(np)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {order.status === 'confirmed' && (
                                <button
                                  onClick={() => openAmeexModal(order)}
                                  title={(order as any).tracking_code ? `Code: ${(order as any).tracking_code}` : (order as any).ameex_sent_at ? 'Déjà envoyé — renvoyer ?' : 'Envoyer vers Ameex'}
                                  className={`p-1.5 rounded text-[10px] font-bold border transition-colors ${
                                    (order as any).tracking_code
                                      ? 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20'
                                      : (order as any).ameex_sent_at
                                      ? 'text-slate-300 border-slate-500 bg-slate-700/50 hover:bg-slate-600/50'
                                      : 'text-orange-400 border-orange-500/30 hover:text-white hover:bg-orange-500/20'
                                  }`}
                                >
                                  {(order as any).tracking_code ? '✓ AMX' : 'AMX'}
                                </button>
                              )}
                              {(order as any).tracking_code && (
                                <span title={(order as any).tracking_code} className="text-[10px] text-green-400 font-mono px-1.5 py-0.5 bg-green-500/10 rounded border border-green-500/20 max-w-[70px] truncate">
                                  {(order as any).tracking_code}
                                </span>
                              )}
                              <button onClick={() => openEdit(order)} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => handleDelete(order.id)} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={16} className="px-4 py-12 text-center text-slate-500">Aucune commande trouvee</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── ONGLET GOOGLE SHEETS ─────────────────────────────────── */}
      {activeTab === 'sheets' && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-slate-400 text-sm mb-4">
              Copiez l'URL de chaque Google Sheet et activez/désactivez la synchronisation.
              Le webhook refuse les leads d'un sheet mis en <span className="text-red-400 font-medium">Pause</span>.
            </p>
            {sheetData.map(p => {
              const currentUrl = sheetUrlEdits[p.id] !== undefined ? sheetUrlEdits[p.id] : (p.google_sheet_url || '')
              const isActive = p.sheet_sync_active !== false
              const hasUrl = Boolean(currentUrl)
              return (
                <div key={p.id} className={`flex items-center gap-4 rounded-xl px-4 py-3 border transition-colors ${
                  isActive && hasUrl
                    ? 'bg-green-500/5 border-green-500/20'
                    : !isActive
                    ? 'bg-slate-800/30 border-slate-700/30 opacity-60'
                    : 'bg-slate-800/40 border-slate-700/50'
                }`}>
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isActive && hasUrl ? 'bg-green-400 animate-pulse' : isActive ? 'bg-amber-400' : 'bg-slate-600'}`} />

                  {/* Product name */}
                  <div className="w-36 shrink-0">
                    <p className="text-white font-medium text-sm truncate">{p.name}</p>
                    <p className="text-slate-500 text-[10px]">
                      {orders.filter(o => o.product_id === p.id).length} leads
                    </p>
                  </div>

                  {/* Sheet URL input */}
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <input
                      type="url"
                      value={currentUrl}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      onChange={e => setSheetUrlEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                      onBlur={() => handleSaveSheetUrl(p.id)}
                      className="flex-1 min-w-0 bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-green-500 font-mono"
                    />
                    {savingSheet === p.id && <span className="text-slate-500 text-xs shrink-0">Enreg...</span>}
                    {hasUrl && (
                      <a
                        href={currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ouvrir dans Google Sheets"
                        className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-green-400 hover:bg-green-400/10 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>

                  {/* Toggle actif/pause */}
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => handleToggleSheet(p.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isActive ? 'bg-green-500' : 'bg-slate-600'}`}
                      title={isActive ? 'Cliquer pour mettre en pause' : 'Cliquer pour activer'}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className={`text-xs font-medium w-12 ${isActive ? 'text-green-400' : 'text-slate-500'}`}>
                      {isActive ? 'Actif' : 'Pause'}
                    </span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ── AMEEX MODAL ─────────────────────────────────────────────── */}
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
              {/* Order summary */}
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-20 shrink-0">Nom</span>
                  <input type="text" value={ameexModal.customerName} onChange={e => setAmeexModal(m => m ? { ...m, customerName: e.target.value } : m)} data-lpignore="true" autoComplete="off" className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-20 shrink-0">Téléphone</span>
                  <input type="text" value={ameexModal.phone} onChange={e => setAmeexModal(m => m ? { ...m, phone: e.target.value } : m)} data-lpignore="true" autoComplete="off" className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex justify-between"><span className="text-slate-400">COD</span><span className="text-green-400 font-bold">{formatCurrency(ameexModal.order.selling_price)}</span></div>
              </div>

              {/* Adresse */}
              <div>
                <Label>Adresse <span className="text-red-400">*</span></Label>
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

              {/* City picker */}
              <div className="relative">
                <Label>Ville de livraison <span className="text-red-400">*</span></Label>
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

              {/* Open parcel */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">Colis ouvert à la livraison</p>
                  <p className="text-xs text-slate-500">Le livreur ouvre le colis devant le client</p>
                </div>
                <button
                  onClick={() => setAmeexModal(m => m ? { ...m, openParcel: !m.openParcel } : m)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ameexModal.openParcel ? 'bg-green-600' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${ameexModal.openParcel ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {ameexError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">
                  {ameexError}
                </div>
              )}

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
