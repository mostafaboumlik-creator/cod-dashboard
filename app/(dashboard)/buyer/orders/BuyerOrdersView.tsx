'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { calcNetProfit, calcBrutProfit, calcCommission } from '@/lib/calculations'
import { formatCurrency } from '@/lib/utils'
import type { Order, OrderStatus, AdPlatform } from '@/lib/types'
import { format } from 'date-fns'
import { BuyerDateFilter } from '../BuyerDateFilter'

interface Product {
  id: string
  name: string
  selling_price: number
  product_cost: number
  packaging_cost: number
}

interface Props {
  orders: Order[]
  commissionRate: number
  userId: string
  products: Product[]
  dateFrom: string
  dateTo: string
}

const EMPTY_FORM = {
  product_id: '',
  status: 'lead' as OrderStatus,
  selling_price: 0,
  product_cost: 0,
  packaging_cost: 0,
  delivery_cost: 20,
  call_center_cost: 5,
  ad_spend: 0,
  campaign_name: '',
  ad_platform: 'facebook' as AdPlatform,
  customer_name: '',
  customer_phone: '',
  city: '',
  notes: '',
}

export function BuyerOrdersView({ orders: initialOrders, commissionRate, userId, products, dateFrom, dateTo }: Props) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [filterStatus, setFilterStatus] = useState('delivered')

  useEffect(() => {
    setOrders(initialOrders)
  }, [initialOrders])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  function fillFromProduct(productId: string) {
    const p = products.find(p => p.id === productId)
    if (p) {
      setForm(f => ({ ...f, product_id: productId, selling_price: p.selling_price, product_cost: p.product_cost, packaging_cost: p.packaging_cost }))
    } else {
      setForm(f => ({ ...f, product_id: productId }))
    }
  }

  async function handleCreate() {
    if (!form.product_id) return
    setSaving(true)
    const payload = {
      ...form,
      media_buyer_id: userId,
      selling_price: Number(form.selling_price),
      product_cost: Number(form.product_cost),
      packaging_cost: Number(form.packaging_cost),
      delivery_cost: Number(form.delivery_cost),
      call_center_cost: Number(form.call_center_cost),
      ad_spend: Number(form.ad_spend),
    }
    const { data } = await supabase
      .from('orders')
      .insert(payload)
      .select('*, products(id, name)')
      .single()
    if (data) setOrders(prev => [data as Order, ...prev])
    setSaving(false)
    setShowForm(false)
    setForm(EMPTY_FORM)
  }

  const filtered = useMemo(() => orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false
    if (search) {
      const s = search.toLowerCase()
      const product = (o.products as any)?.name?.toLowerCase() || ''
      const campaign = o.campaign_name?.toLowerCase() || ''
      const name = o.customer_name?.toLowerCase() || ''
      if (!product.includes(s) && !campaign.includes(s) && !name.includes(s)) return false
    }
    return true
  }), [orders, filterStatus, search])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Mes Commandes</h1>
          <p className="text-slate-400 text-sm">{filtered.length} commandes</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BuyerDateFilter activeFrom={dateFrom} activeTo={dateTo} />
          <Button onClick={() => { setForm(EMPTY_FORM); setShowForm(true) }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau lead
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="font-semibold text-white">Nouveau Lead</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Produit</Label>
                  <Select value={form.product_id} onChange={e => fillFromProduct(e.target.value)}>
                    <option value="">Selectionner...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                  <Input value={form.campaign_name} onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))} placeholder="Nom campagne..." />
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
                    { label: 'Depense pub', key: 'ad_spend' },
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
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={handleCreate} disabled={saving || !form.product_id}>
                {saving ? 'Enregistrement...' : 'Ajouter lead'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {orders.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-2">
          {([
            { value: 'lead',         label: 'Lead',        color: 'bg-slate-700/60 text-slate-300' },
            { value: 'call_later',   label: 'Rappeler',    color: 'bg-purple-500/20 text-purple-300' },
            { value: 'no_reply',     label: 'Pas rep.',    color: 'bg-slate-700/60 text-slate-400' },
            { value: 'unreachable',  label: 'Injoignable', color: 'bg-slate-700/60 text-slate-400' },
            { value: 'wrong_number', label: 'Faux num.',   color: 'bg-red-500/20 text-red-400' },
            { value: 'confirmed',    label: 'Confirme',    color: 'bg-blue-500/20 text-blue-300' },
            { value: 'delivered',    label: 'Livre',       color: 'bg-green-500/20 text-green-300' },
            { value: 'returned',     label: 'Retour',      color: 'bg-amber-500/20 text-amber-300' },
            { value: 'cancelled',    label: 'Annule',      color: 'bg-red-500/20 text-red-400' },
          ] as const).map(s => {
            const count = orders.filter(o => o.status === s.value).length
            if (count === 0) return null
            return (
              <button
                key={s.value}
                onClick={() => setFilterStatus(filterStatus === s.value ? 'all' : s.value)}
                className={`rounded-lg p-2 text-center transition-all border ${
                  filterStatus === s.value ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-transparent hover:border-slate-600'
                } ${s.color}`}
              >
                <p className="text-lg font-bold">{count}</p>
                <p className="text-xs opacity-75 truncate">{s.label}</p>
              </button>
            )
          })}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap gap-3 py-3">
          <Input className="w-52" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
          <Select className="w-44" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">Tous les statuts</option>
            <option value="lead">Lead</option>
            <option value="call_later">Rappeler</option>
            <option value="no_reply">Pas de reponse</option>
            <option value="unreachable">Injoignable</option>
            <option value="wrong_number">Faux numero</option>
            <option value="confirmed">Confirme</option>
            <option value="delivered">Livre</option>
            <option value="returned">Retour</option>
            <option value="cancelled">Annule</option>
            <option value="out_of_stock">Rupture stock</option>
            <option value="duplicate">Doublon</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto pb-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 font-medium px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="text-left text-slate-400 font-medium px-4 py-3 whitespace-nowrap">Client</th>
                  <th className="text-left text-slate-400 font-medium px-4 py-3 whitespace-nowrap">Produit</th>
                  <th className="text-right text-slate-400 font-medium px-4 py-3 whitespace-nowrap">Prix vente</th>
                  <th className="text-right text-red-400/70 font-medium px-3 py-3 whitespace-nowrap">− Coût prod.</th>
                  <th className="text-right text-red-400/70 font-medium px-3 py-3 whitespace-nowrap">− Packaging</th>
                  <th className="text-right text-red-400/70 font-medium px-3 py-3 whitespace-nowrap">− Livraison</th>
                  <th className="text-right text-red-400/70 font-medium px-3 py-3 whitespace-nowrap">− Call center et suivie</th>
                  <th className="text-right text-red-400/70 font-medium px-3 py-3 whitespace-nowrap">− Fulfillement center</th>
                  <th className="text-right text-green-400 font-medium px-4 py-3 whitespace-nowrap">= Profit brut</th>
                  <th className="text-left text-slate-400 font-medium px-4 py-3 whitespace-nowrap">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const isDelivered = o.status === 'delivered'
                  const fulfillmentCost = isDelivered ? 10 : 0
                  const bp = calcBrutProfit(o) - fulfillmentCost
                  return (
                    <tr key={o.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap text-xs">
                        {format(new Date(o.created_at), 'dd/MM/yy')}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 text-xs whitespace-nowrap">{o.customer_name || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{(o.products as any)?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-white font-semibold whitespace-nowrap">
                        {formatCurrency(o.selling_price)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-red-400/80 text-xs whitespace-nowrap">{formatCurrency(o.product_cost)}</td>
                      <td className="px-3 py-2.5 text-right text-red-400/80 text-xs whitespace-nowrap">{formatCurrency(o.packaging_cost)}</td>
                      <td className="px-3 py-2.5 text-right text-red-400/80 text-xs whitespace-nowrap">{formatCurrency(o.delivery_cost)}</td>
                      <td className="px-3 py-2.5 text-right text-red-400/80 text-xs whitespace-nowrap">{formatCurrency(o.call_center_cost)}</td>
                      <td className="px-3 py-2.5 text-right text-red-400/80 text-xs whitespace-nowrap">
                        {isDelivered ? formatCurrency(10) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${bp >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(bp)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={o.status} /></td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-500">Aucune commande trouvee</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
