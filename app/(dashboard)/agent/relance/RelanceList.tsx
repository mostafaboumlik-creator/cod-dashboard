'use client'

import { useState, useMemo } from 'react'
import type { ClientRelance } from '@/app/api/agent/relance/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product { id: string; name: string; pack_size: number | null; selling_price: number }

type FollowupResult = 'no_answer' | 'callback' | 'not_interested' | 'interested' | 'order_obtained'

interface FollowupInfo {
  result: string
  created_at: string
  next_followup_at: string | null
}

interface KpiData {
  eligibleCount: number
  relancedToday: number
  ordersToday: number
  caToday: number
}

interface CreateForm {
  productId: string
  packs: string
  variant: string
  paymentMode: string
  name: string
  phone: string
  city: string
  address1: string
  customerType: string
}

interface Props {
  clients: ClientRelance[]
  products: Product[]
  kpiData: KpiData
  followupsByPhone: Record<string, FollowupInfo>
  relancedTodayPhones: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NULL_TYPE = '__null__'
const CLIENT_SHIPPING_FEE = 36

const RESULT_OPTIONS: { value: FollowupResult; label: string }[] = [
  { value: 'no_answer', label: 'Pas de réponse' },
  { value: 'callback', label: 'À rappeler' },
  { value: 'not_interested', label: 'Pas intéressé' },
  { value: 'interested', label: 'Intéressé' },
  { value: 'order_obtained', label: 'Commande obtenue' },
]

const RESULT_STYLES: Record<string, string> = {
  no_answer: 'text-slate-400 bg-slate-700/50 border-slate-600',
  callback: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  not_interested: 'text-red-400 bg-red-500/15 border-red-500/30',
  interested: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
  order_obtained: 'text-green-400 bg-green-500/15 border-green-500/30',
}

const RESULT_LABELS: Record<string, string> = {
  no_answer: 'Pas de réponse',
  callback: 'À rappeler',
  not_interested: 'Pas intéressé',
  interested: 'Intéressé',
  order_obtained: 'Commande ✓',
}

const TYPE_STYLES: Record<string, string> = {
  jamla: 'text-green-400 bg-green-500/15 border border-green-500/30',
  pro:   'text-blue-400 bg-blue-500/15 border border-blue-500/30',
  perso: 'text-purple-400 bg-purple-500/15 border border-purple-500/30',
}

const TYPE_LABELS: Record<string, string> = { jamla: 'Revendeur', pro: 'Pro', perso: 'Perso' }

const PAYMENT_OPTIONS = [
  { value: '', label: 'Choisir…' },
  { value: 'cash', label: 'Espèces à la livraison' },
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'cheque', label: 'Chèque' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-FR') } catch { return '—' }
}

function fmtRelative(iso: string | null): string {
  if (!iso) return ''
  try {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
    if (h < 1) return "À l'instant"
    if (h < 24) return `Il y a ${h}h`
    return `Il y a ${Math.floor(h / 24)}j`
  } catch { return '' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ClientRelance['customer_type'] }) {
  if (!type) return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-slate-500 bg-slate-800 border border-slate-700">
      Non renseigné
    </span>
  )
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${TYPE_STYLES[type] ?? 'text-slate-400 bg-slate-800 border border-slate-700'}`}>
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}

function FollowupBadge({ result }: { result: string }) {
  const style = RESULT_STYLES[result] ?? 'text-slate-400 bg-slate-700/50 border-slate-600'
  const label = RESULT_LABELS[result] ?? result
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${style}`}>{label}</span>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
      <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

function emptyCreateForm(c: ClientRelance, products: Product[]): CreateForm {
  const defaultProduct = products.find(p => p.id === c.last_product_id) ?? products[0]
  return {
    productId: defaultProduct?.id ?? '',
    packs: c.last_packs != null ? String(c.last_packs) : '',
    variant: '',
    paymentMode: '',
    name: c.name ?? '',
    phone: c.phone,
    city: c.city ?? '',
    address1: c.address1 ?? '',
    customerType: c.customer_type ?? '',
  }
}

export function RelanceList({
  clients,
  products,
  kpiData,
  followupsByPhone: initialFollowups,
  relancedTodayPhones: initialRelancedToday,
}: Props) {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterType, setFilterType] = useState('all')
  const [filterProduct, setFilterProduct] = useState('all')
  const [filterLastDelivery, setFilterLastDelivery] = useState('all')
  const [filterLastPacks, setFilterLastPacks] = useState('all')
  const [filterDeliveryCount, setFilterDeliveryCount] = useState('all')
  const [search, setSearch] = useState('')

  // ── Followup modal ────────────────────────────────────────────────────────
  const [followupClient, setFollowupClient] = useState<ClientRelance | null>(null)
  const [followupResult, setFollowupResult] = useState<FollowupResult>('no_answer')
  const [followupNotes, setFollowupNotes] = useState('')
  const [followupNextDate, setFollowupNextDate] = useState('')
  const [followupLoading, setFollowupLoading] = useState(false)
  const [followupError, setFollowupError] = useState<string | null>(null)
  const [followupDone, setFollowupDone] = useState(false)
  const [followupDoneResult, setFollowupDoneResult] = useState<FollowupResult | null>(null)

  // ── Create order modal ────────────────────────────────────────────────────
  const [orderClient, setOrderClient] = useState<ClientRelance | null>(null)
  const [form, setForm] = useState<CreateForm | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  // ── Local state for optimistic KPI updates ────────────────────────────────
  const [localFollowups, setLocalFollowups] = useState<Record<string, FollowupInfo>>(
    () => ({ ...initialFollowups })
  )
  const [localRelancedToday, setLocalRelancedToday] = useState<string[]>(initialRelancedToday)
  const [localOrdersToday, setLocalOrdersToday] = useState(kpiData.ordersToday)
  const [localCaToday, setLocalCaToday] = useState(kpiData.caToday)

  // ── Computed KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const relancedCount = new Set(localRelancedToday).size
    const conversion = relancedCount > 0 ? Math.round((localOrdersToday / relancedCount) * 100) : 0
    return {
      eligibleCount: clients.length,
      relancedToday: relancedCount,
      ordersToday: localOrdersToday,
      conversion,
      caToday: localCaToday,
    }
  }, [clients.length, localRelancedToday, localOrdersToday, localCaToday])

  // ── All products across all clients (for product filter) ──────────────────
  const allProducts = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of clients) {
      for (const p of c.delivered_products) {
        if (!map.has(p.product_id)) map.set(p.product_id, p.name)
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [clients])

  // ── Filtered clients ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const nowMs = Date.now()
    const q = search.trim().toLowerCase()
    return clients.filter(c => {
      if (filterType !== 'all') {
        if (filterType === NULL_TYPE && c.customer_type !== null) return false
        if (filterType !== NULL_TYPE && c.customer_type !== filterType) return false
      }
      if (filterProduct !== 'all') {
        if (!c.delivered_products.some(p => p.product_id === filterProduct)) return false
      }
      if (filterLastDelivery !== 'all') {
        if (!c.last_delivered_at) return false
        const ageDays = (nowMs - new Date(c.last_delivered_at).getTime()) / 86400000
        if (ageDays < Number(filterLastDelivery)) return false
      }
      if (filterLastPacks !== 'all') {
        const p = c.last_packs
        if (p == null) return false
        if (filterLastPacks === '1' && p !== 1) return false
        if (filterLastPacks === '2' && p !== 2) return false
        if (filterLastPacks === '3-5' && (p < 3 || p > 5)) return false
        if (filterLastPacks === '6+' && p < 6) return false
      }
      if (filterDeliveryCount !== 'all') {
        if (filterDeliveryCount === '1' && c.total_delivered !== 1) return false
        if (filterDeliveryCount === '2' && c.total_delivered !== 2) return false
        if (filterDeliveryCount === '3+' && c.total_delivered < 3) return false
      }
      if (q) {
        if (!(c.name || '').toLowerCase().includes(q) && !c.phone.includes(q)) return false
      }
      return true
    })
  }, [clients, filterType, filterProduct, filterLastDelivery, filterLastPacks, filterDeliveryCount, search])

  // ── Followup modal handlers ───────────────────────────────────────────────
  function openFollowupModal(c: ClientRelance) {
    setFollowupClient(c)
    setFollowupResult('no_answer')
    setFollowupNotes('')
    setFollowupNextDate('')
    setFollowupError(null)
    setFollowupDone(false)
    setFollowupDoneResult(null)
  }

  function closeFollowupModal() {
    setFollowupClient(null)
    setFollowupDone(false)
    setFollowupDoneResult(null)
  }

  async function handleFollowupSubmit() {
    if (!followupClient) return
    setFollowupLoading(true)
    setFollowupError(null)
    try {
      const res = await fetch('/api/agent/relance/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_phone: followupClient.phone,
          result: followupResult,
          notes: followupNotes || null,
          next_followup_at: followupResult === 'callback' && followupNextDate ? followupNextDate : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFollowupError(data.error ?? 'Erreur')
      } else {
        const nowISO = new Date().toISOString()
        const info: FollowupInfo = {
          result: followupResult,
          created_at: nowISO,
          next_followup_at: followupResult === 'callback' && followupNextDate
            ? new Date(followupNextDate).toISOString()
            : null,
        }
        setLocalFollowups(prev => ({ ...prev, [followupClient.phone]: info }))
        setLocalRelancedToday(prev =>
          prev.includes(followupClient.phone) ? prev : [...prev, followupClient.phone]
        )
        setFollowupDoneResult(followupResult)
        setFollowupDone(true)
      }
    } catch {
      setFollowupError('Erreur réseau, veuillez réessayer')
    } finally {
      setFollowupLoading(false)
    }
  }

  // ── Create order modal handlers ───────────────────────────────────────────
  function openOrderModal(c: ClientRelance) {
    setOrderClient(c)
    setForm(emptyCreateForm(c, products))
    setCreateError(null)
    setCreateSuccess(false)
  }

  function closeOrderModal() {
    setOrderClient(null)
    setForm(null)
    setCreateError(null)
    setCreateSuccess(false)
  }

  function openOrderFromFollowup() {
    if (!followupClient) return
    const c = followupClient
    closeFollowupModal()
    openOrderModal(c)
  }

  const selectedProduct = products.find(p => p.id === form?.productId)
  const packSize = selectedProduct?.pack_size ?? null
  const packsNum = form ? Number(form.packs) : 0
  const quantityInPieces = packSize && packsNum > 0 ? packsNum * packSize : packsNum > 0 ? packsNum : null
  const isPackProduct = (selectedProduct?.pack_size ?? 0) > 0
  const merchandiseTotal = isPackProduct && packsNum > 0 ? packsNum * selectedProduct!.selling_price : null
  const clientTotal = merchandiseTotal != null ? merchandiseTotal + CLIENT_SHIPPING_FEE : null

  async function handleCreate() {
    if (!form || !orderClient) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/agent/relance/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: form.productId,
          quantity: quantityInPieces,
          product_variant: form.variant || null,
          payment_mode: form.paymentMode || null,
          customer_name: form.name || null,
          customer_phone: form.phone,
          city: form.city || null,
          address1: form.address1 || null,
          customer_type: form.customerType || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error ?? 'Erreur lors de la création')
      } else {
        setCreateSuccess(true)
        setLocalOrdersToday(n => n + 1)
        setLocalCaToday(n => n + (clientTotal ?? 0))
        const phone = form.phone
        // Auto-followup order_obtained created server-side → update display
        setLocalRelancedToday(prev => prev.includes(phone) ? prev : [...prev, phone])
        setLocalFollowups(prev => ({
          ...prev,
          [phone]: { result: 'order_obtained', created_at: new Date().toISOString(), next_followup_at: null },
        }))
      }
    } catch {
      setCreateError('Erreur réseau, veuillez réessayer')
    } finally {
      setCreating(false)
    }
  }

  const hasFilters = filterType !== 'all' || filterProduct !== 'all' || filterLastDelivery !== 'all'
    || filterLastPacks !== 'all' || filterDeliveryCount !== 'all' || !!search

  function resetFilters() {
    setFilterType('all'); setFilterProduct('all'); setFilterLastDelivery('all')
    setFilterLastPacks('all'); setFilterDeliveryCount('all'); setSearch('')
  }

  const selectCls = 'bg-slate-800 border border-slate-700 text-white text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500'

  return (
    <div className="p-4 space-y-4">

      {/* KPI cards */}
      <div className="flex flex-wrap gap-3">
        <KpiCard label="Clients éligibles" value={kpis.eligibleCount} />
        <KpiCard label="Relancés aujourd'hui" value={kpis.relancedToday} />
        <KpiCard label="Commandes aujourd'hui" value={kpis.ordersToday} />
        <KpiCard
          label="Conversion relance"
          value={`${kpis.conversion}%`}
          sub={kpis.relancedToday > 0 ? `${kpis.ordersToday} / ${kpis.relancedToday}` : 'Aucune relance'}
        />
        <KpiCard
          label="CA relance"
          value={`${kpis.caToday.toLocaleString('fr-FR')} DH`}
          sub="commandé aujourd'hui"
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Clients à relancer</h1>
          <p className="text-slate-400 text-xs mt-0.5">Clients ayant au moins une commande livrée</p>
        </div>
        <div className="text-slate-400 text-sm">
          <span className="text-white font-semibold">{filtered.length}</span>
          {filtered.length !== clients.length && <span className="ml-1">/ {clients.length}</span>}
          <span className="ml-1">client{clients.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectCls}>
          <option value="all">Tous les types</option>
          <option value="jamla">Revendeur</option>
          <option value="pro">Pro</option>
          <option value="perso">Perso</option>
          <option value={NULL_TYPE}>Non renseigné</option>
        </select>

        <select value={filterLastDelivery} onChange={e => setFilterLastDelivery(e.target.value)} className={selectCls}>
          <option value="all">Toute ancienneté</option>
          <option value="7">≥ 7 jours</option>
          <option value="15">≥ 15 jours</option>
          <option value="30">≥ 30 jours</option>
        </select>

        <select value={filterLastPacks} onChange={e => setFilterLastPacks(e.target.value)} className={selectCls}>
          <option value="all">Tous packs</option>
          <option value="1">1 pack</option>
          <option value="2">2 packs</option>
          <option value="3-5">3–5 packs</option>
          <option value="6+">6+ packs</option>
        </select>

        <select value={filterDeliveryCount} onChange={e => setFilterDeliveryCount(e.target.value)} className={selectCls}>
          <option value="all">Toutes livraisons</option>
          <option value="1">1 livraison</option>
          <option value="2">2 livraisons</option>
          <option value="3+">3+ livraisons</option>
        </select>

        {allProducts.length > 1 && (
          <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className={selectCls}>
            <option value="all">Tous les produits</option>
            {allProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        <input
          type="text"
          placeholder="Nom / téléphone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`${selectCls} w-44 placeholder-slate-500`}
        />

        {hasFilters && (
          <button onClick={resetFilters} className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/60 border-b border-slate-700">
              {['Client', 'Type', 'Téléphone', 'Dernière livr.', 'Packs', 'Livrées', 'Statut relance', 'Actions'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500 text-sm">Aucun client trouvé</td>
              </tr>
            ) : (
              filtered.map(c => {
                const followup = localFollowups[c.phone]
                return (
                  <tr key={c.phone} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2.5 text-white font-medium text-sm max-w-[150px] truncate">
                      {c.name || <span className="text-slate-500 italic">—</span>}
                    </td>
                    <td className="px-3 py-2.5"><TypeBadge type={c.customer_type} /></td>
                    <td className="px-3 py-2.5 text-indigo-400 font-mono text-xs whitespace-nowrap">{c.phone}</td>
                    <td className="px-3 py-2.5 text-slate-300 text-xs whitespace-nowrap">{fmtDate(c.last_delivered_at)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {c.last_packs != null
                        ? <span className="text-white font-semibold text-xs">{c.last_packs}</span>
                        : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-green-400 font-bold text-xs bg-green-500/10 px-2 py-0.5 rounded">
                        {c.total_delivered}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 min-w-[120px]">
                      {followup ? (
                        <div className="space-y-0.5">
                          <FollowupBadge result={followup.result} />
                          {followup.next_followup_at && (
                            <p className="text-[10px] text-amber-400">📅 {fmtDate(followup.next_followup_at)}</p>
                          )}
                          <p className="text-[10px] text-slate-500">{fmtRelative(followup.created_at)}</p>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 justify-center">
                        <button
                          onClick={() => openFollowupModal(c)}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-700/60 text-slate-300 border border-slate-600/50 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap"
                        >
                          Relancer
                        </button>
                        <button
                          onClick={() => openOrderModal(c)}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 hover:bg-indigo-600/40 hover:text-indigo-300 transition-colors whitespace-nowrap"
                        >
                          + Commande
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Followup modal ── */}
      {followupClient && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h2 className="font-semibold text-white text-base">Enregistrer une relance</h2>
                <p className="text-xs text-slate-400 mt-0.5">{followupClient.name || followupClient.phone}</p>
              </div>
              <button onClick={closeFollowupModal} className="text-slate-400 hover:text-white transition-colors">
                <CloseIcon />
              </button>
            </div>

            {followupDone ? (
              <div className="px-6 py-8 text-center space-y-3">
                <div className="w-11 h-11 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-white font-semibold">Relance enregistrée.</p>
                {followupDoneResult === 'order_obtained' && (
                  <div className="space-y-2 pt-1">
                    <p className="text-slate-400 text-sm">Créer la commande pour finaliser ?</p>
                    <button
                      onClick={openOrderFromFollowup}
                      className="text-sm px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors font-medium"
                    >
                      → Créer la commande
                    </button>
                  </div>
                )}
                <button onClick={closeFollowupModal} className="block mx-auto text-xs text-slate-400 hover:text-slate-300 pt-1">
                  Fermer
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 font-medium">Résultat *</p>
                  <div className="space-y-2">
                    {RESULT_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="radio"
                          name="followup-result"
                          value={opt.value}
                          checked={followupResult === opt.value}
                          onChange={() => setFollowupResult(opt.value)}
                          className="accent-indigo-500"
                        />
                        <span className={`text-sm transition-colors ${followupResult === opt.value ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {followupResult === 'callback' && (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Prochaine relance</label>
                    <input
                      type="date"
                      value={followupNextDate}
                      onChange={e => setFollowupNextDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Notes (optionnel)</label>
                  <textarea
                    value={followupNotes}
                    onChange={e => setFollowupNotes(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-none placeholder-slate-500"
                    placeholder="Observations…"
                  />
                </div>

                {followupError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {followupError}
                  </p>
                )}

                <div className="flex justify-end gap-3">
                  <button onClick={closeFollowupModal} disabled={followupLoading}
                    className="text-sm px-4 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors disabled:opacity-50">
                    Annuler
                  </button>
                  <button onClick={handleFollowupSubmit} disabled={followupLoading}
                    className="text-sm px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 font-medium">
                    {followupLoading ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create order modal ── */}
      {orderClient && form && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h2 className="font-semibold text-white text-base">Nouvelle commande</h2>
                <p className="text-xs text-slate-400 mt-0.5">{orderClient.name || orderClient.phone}</p>
              </div>
              <button onClick={closeOrderModal} className="text-slate-400 hover:text-white transition-colors">
                <CloseIcon />
              </button>
            </div>

            {createSuccess ? (
              <div className="px-6 py-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                  <CheckIcon className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Commande ajoutée avec succès.</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Disponible dans <span className="text-indigo-400 font-medium">Mes Leads → Confirmés</span>.
                  </p>
                </div>
                <button onClick={closeOrderModal}
                  className="mt-2 text-sm px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
                  Fermer
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-5">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Coordonnées client</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Nom</label>
                      <input type="text" value={form.name}
                        onChange={e => setForm(f => f ? { ...f, name: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder="Nom complet" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Téléphone</label>
                      <input type="text" value={form.phone}
                        onChange={e => setForm(f => f ? { ...f, phone: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Ville</label>
                      <input type="text" value={form.city}
                        onChange={e => setForm(f => f ? { ...f, city: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder="Ville" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Type client</label>
                      <select value={form.customerType}
                        onChange={e => setForm(f => f ? { ...f, customerType: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                        <option value="">Non renseigné</option>
                        <option value="jamla">Revendeur (Jamla)</option>
                        <option value="pro">Pro</option>
                        <option value="perso">Perso</option>
                      </select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-slate-400">Adresse</label>
                      <input type="text" value={form.address1}
                        onChange={e => setForm(f => f ? { ...f, address1: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder="Adresse de livraison" />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Commande</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-slate-400">Produit</label>
                      <select value={form.productId}
                        onChange={e => setForm(f => f ? { ...f, productId: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                        {products.length === 0 && <option value="">Aucun produit actif</option>}
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">
                        Quantité{packSize ? ` (packs de ${packSize})` : ''}
                      </label>
                      <input type="number" min="1" value={form.packs}
                        onChange={e => setForm(f => f ? { ...f, packs: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder={packSize ? 'Nb packs' : 'Quantité'} />
                      {packSize && packsNum > 0 && (
                        <p className="text-[11px] text-slate-500">{quantityInPieces} pièces</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Variante / couleur</label>
                      <input type="text" value={form.variant}
                        onChange={e => setForm(f => f ? { ...f, variant: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder="Ex: Noir, Mixte…" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Total client (DH)</label>
                      <div className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
                        <span className="text-white font-semibold text-sm">
                          {clientTotal != null ? `${clientTotal} DH` : '—'}
                        </span>
                        {merchandiseTotal != null && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Marchandise : {merchandiseTotal} DH + Livraison : {CLIENT_SHIPPING_FEE} DH
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Mode de paiement</label>
                      <select value={form.paymentMode}
                        onChange={e => setForm(f => f ? { ...f, paymentMode: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                        {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {createError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {createError}
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-1">
                  <button onClick={closeOrderModal} disabled={creating}
                    className="text-sm px-4 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors disabled:opacity-50">
                    Annuler
                  </button>
                  <button onClick={handleCreate}
                    disabled={creating || !form.productId || !form.phone || !quantityInPieces || clientTotal == null}
                    className="text-sm px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium">
                    {creating ? 'Création…' : 'Créer la commande'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
