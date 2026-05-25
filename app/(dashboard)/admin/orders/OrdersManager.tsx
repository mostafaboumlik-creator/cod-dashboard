'use client'

import { useState, useMemo } from 'react'
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

interface Props {
  initialOrders: Order[]
  products: { id: string; name: string; category?: string | null; selling_price: number; product_cost: number; packaging_cost: number }[]
  mediaBuyers: { id: string; full_name: string; commission_rate: number }[]
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'lead',         label: 'Lead' },
  { value: 'call_later',   label: 'Rappeler' },
  { value: 'no_reply',     label: 'Pas de reponse' },
  { value: 'unreachable',  label: 'Injoignable' },
  { value: 'wrong_number', label: 'Faux numero' },
  { value: 'confirmed',    label: 'Confirme' },
  { value: 'delivered',    label: 'Livre' },
  { value: 'returned',     label: 'Retour' },
  { value: 'cancelled',    label: 'Annule' },
  { value: 'out_of_stock', label: 'Rupture stock' },
  { value: 'duplicate',          label: 'Doublon' },
  { value: 'delivery_no_answer', label: 'Pas rep. livraison' },
]

const STATUS_COLORS: Record<OrderStatus, string> = {
  lead:         'bg-slate-700 text-slate-300',
  call_later:   'bg-purple-500/20 text-purple-300',
  no_reply:     'bg-slate-700 text-slate-400',
  unreachable:  'bg-slate-700 text-slate-400',
  wrong_number: 'bg-red-500/20 text-red-400',
  confirmed:    'bg-blue-500/20 text-blue-300',
  delivered:    'bg-green-500/20 text-green-300',
  returned:     'bg-amber-500/20 text-amber-300',
  cancelled:    'bg-red-500/20 text-red-400',
  out_of_stock:       'bg-amber-500/20 text-amber-400',
  duplicate:          'bg-purple-500/20 text-purple-400',
  delivery_no_answer: 'bg-orange-500/20 text-orange-400',
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
  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterBuyer, setFilterBuyer] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [notesMap, setNotesMap] = useState<Record<string, string>>({})

  const supabase = createClient()

  function fillFormFromProduct(productId: string) {
    const p = products.find(p => p.id === productId)
    if (p) {
      setForm(f => ({ ...f, product_id: productId, selling_price: p.selling_price, product_cost: p.product_cost, packaging_cost: p.packaging_cost }))
    } else {
      setForm(f => ({ ...f, product_id: productId }))
    }
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
  }), [orders, filterStatus, filterBuyer, search, dateFrom, dateTo, productsByCategory])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Gestion des Commandes</h1>
          <p className="text-slate-400 text-sm">{filtered.length} commandes affichees</p>
        </div>
        <Button onClick={() => { setEditingOrder(null); setForm(EMPTY_FORM); setShowForm(true) }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle commande
        </Button>
      </div>

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
          {categories.length > 0 && (
            <Select className="w-40" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">Toutes categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}
          <div className="flex items-center gap-2">
            <Input type="date" className="w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="text-slate-500 text-sm">au</span>
            <Input type="date" className="w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-400 hover:text-white text-xs underline">
                Effacer
              </button>
            )}
          </div>
        </CardContent>
      </Card>

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
                      <Input
                        type="number"
                        step="0.01"
                        value={(form as any)[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 rounded-lg bg-slate-800/50 text-sm">
                  <span className="text-slate-400">Profit net estime: </span>
                  <span className={`font-bold ${
                    calcNetProfit({ ...form, selling_price: Number(form.selling_price), product_cost: Number(form.product_cost), packaging_cost: Number(form.packaging_cost), delivery_cost: Number(form.delivery_cost), call_center_cost: Number(form.call_center_cost), ad_spend: 0 } as any) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatCurrency(calcNetProfit({ ...form, selling_price: Number(form.selling_price), product_cost: Number(form.product_cost), packaging_cost: Number(form.packaging_cost), delivery_cost: Number(form.delivery_cost), call_center_cost: Number(form.call_center_cost), ad_spend: 0 } as any))}
                  </span>
                </div>
              </div>
              {['confirmed','delivered','returned','delivery_no_answer'].includes(form.status) && (
                <div>
                  <Label>Code de suivi Ameex</Label>
                  <Input
                    value={form.tracking_code}
                    onChange={e => setForm(f => ({ ...f, tracking_code: e.target.value }))}
                    placeholder="Ex: AZR0526B21479UU7569908"
                    className="font-mono"
                  />
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

      {/* Stats summary for filtered results */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-2">
          {STATUS_OPTIONS.map(s => {
            const count = filtered.filter(o => o.status === s.value).length
            if (count === 0) return null
            return (
              <button
                key={s.value}
                onClick={() => setFilterStatus(filterStatus === s.value ? 'all' : s.value)}
                className={`rounded-lg p-2 text-center transition-all border ${
                  filterStatus === s.value
                    ? 'border-indigo-500 ring-1 ring-indigo-500'
                    : 'border-transparent hover:border-slate-600'
                } ${STATUS_COLORS[s.value]}`}
              >
                <p className="text-lg font-bold">{count}</p>
                <p className="text-xs opacity-75 truncate">{s.label}</p>
              </button>
            )
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
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
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap text-xs">
                        {format(new Date(order.created_at), 'dd/MM/yy HH:mm')}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        <a href={`tel:${order.customer_phone}`} className="text-indigo-400 hover:text-indigo-300 font-medium">
                          {order.customer_phone || '—'}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-slate-300 text-xs">{order.city || '—'}</td>
                      <td className="px-3 py-2 text-white font-medium text-xs">{order.customer_name || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="text-slate-400">{(order.products as any)?.name || '—'}</span>
                        {order.campaign_name && (
                          <span className={`ml-1.5 text-[10px] font-bold px-1 py-0.5 rounded ${
                            order.ad_platform === 'facebook' ? 'bg-blue-500/20 text-blue-400' :
                            order.ad_platform === 'tiktok'   ? 'bg-pink-500/20 text-pink-400' :
                            'bg-slate-600/40 text-slate-400'
                          }`}>
                            {order.ad_platform === 'facebook' ? 'FB' : order.ad_platform === 'tiktok' ? 'TK' : order.campaign_name.slice(-4).trim()}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{(order as any).product_variant || '—'}</td>
                      <td className="px-3 py-2 text-right text-green-400 font-semibold text-xs whitespace-nowrap">
                        {order.selling_price ? `${order.selling_price} MAD` : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-400 text-xs max-w-[120px] truncate">{(order as any).address1 || '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={order.status}
                          disabled={updatingStatus === order.id}
                          onChange={e => handleQuickStatus(order.id, e.target.value as OrderStatus)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${STATUS_COLORS[order.status]}`}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s.value} value={s.value} className="bg-slate-800 text-white">{s.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={(order as any).second_contact || ''}
                          onChange={e => handleFollowup(order.id, 'second_contact', e.target.value)}
                          className="text-xs bg-transparent border-b border-slate-600 text-slate-300 focus:outline-none focus:border-indigo-400 cursor-pointer"
                        >
                          {FOLLOWUP_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={(order as any).day1_contact || ''}
                          onChange={e => handleFollowup(order.id, 'day1_contact', e.target.value)}
                          className="text-xs bg-transparent border-b border-slate-600 text-slate-300 focus:outline-none focus:border-indigo-400 cursor-pointer"
                        >
                          {FOLLOWUP_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={currentNotes}
                          onChange={e => setNotesMap(m => ({ ...m, [order.id]: e.target.value }))}
                          onBlur={() => handleNotesBlur(order.id)}
                          placeholder="—"
                          className="text-xs bg-transparent border-b border-slate-700 text-slate-300 focus:outline-none focus:border-indigo-400 w-28 placeholder-slate-600"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{mediaBuyers.find(b => b.id === order.media_buyer_id)?.full_name || '—'}</td>
                      <td className={`px-3 py-2 text-right font-medium text-xs ${np >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(np)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
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
    </div>
  )
}
