'use client'

import { useState, useMemo } from 'react'
import type { ClientRelance } from '@/app/api/agent/relance/route'

interface Product {
  id: string
  name: string
  pack_size: number | null
  selling_price: number
}

const TYPE_LABELS: Record<string, string> = {
  jamla: 'Revendeur',
  pro: 'Pro',
  perso: 'Perso',
}

const TYPE_STYLES: Record<string, string> = {
  jamla: 'text-green-400 bg-green-500/15 border border-green-500/30',
  pro:   'text-blue-400 bg-blue-500/15 border border-blue-500/30',
  perso: 'text-purple-400 bg-purple-500/15 border border-purple-500/30',
}

function TypeBadge({ type }: { type: ClientRelance['customer_type'] }) {
  if (!type) {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-slate-500 bg-slate-800 border border-slate-700">
        Non renseigné
      </span>
    )
  }
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${TYPE_STYLES[type] ?? 'text-slate-400 bg-slate-800 border border-slate-700'}`}>
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fr-FR')
  } catch {
    return '—'
  }
}

interface Props {
  clients: ClientRelance[]
  products: Product[]
}

// Filter option value for null customer_type
const NULL_TYPE = '__null__'

const PAYMENT_OPTIONS = [
  { value: '', label: 'Choisir…' },
  { value: 'cash', label: 'Espèces à la livraison' },
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'cheque', label: 'Chèque' },
]

const CLIENT_SHIPPING_FEE = 36

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

function emptyForm(c: ClientRelance, products: Product[]): CreateForm {
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

export function RelanceList({ clients, products }: Props) {
  const [filterType, setFilterType] = useState('all')
  const [filterProduct, setFilterProduct] = useState('all')
  const [search, setSearch] = useState('')

  // Modal state
  const [modalClient, setModalClient] = useState<ClientRelance | null>(null)
  const [form, setForm] = useState<CreateForm | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  // Collect all unique products from delivered_products across all clients
  const allProducts = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of clients) {
      for (const p of c.delivered_products) {
        if (!map.has(p.product_id)) map.set(p.product_id, p.name)
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [clients])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter(c => {
      // Type filter
      if (filterType !== 'all') {
        if (filterType === NULL_TYPE && c.customer_type !== null) return false
        if (filterType !== NULL_TYPE && c.customer_type !== filterType) return false
      }
      // Product filter: client must have received that product at least once
      if (filterProduct !== 'all') {
        if (!c.delivered_products.some(p => p.product_id === filterProduct)) return false
      }
      // Search: name or phone
      if (q) {
        const nameMatch = (c.name || '').toLowerCase().includes(q)
        const phoneMatch = c.phone.includes(q)
        if (!nameMatch && !phoneMatch) return false
      }
      return true
    })
  }, [clients, filterType, filterProduct, search])

  function openModal(c: ClientRelance) {
    setModalClient(c)
    setForm(emptyForm(c, products))
    setCreateError(null)
    setCreateSuccess(false)
  }

  function closeModal() {
    setModalClient(null)
    setForm(null)
    setCreateError(null)
    setCreateSuccess(false)
  }

  function onProductChange(productId: string) {
    if (!form) return
    setForm(f => f ? { ...f, productId } : f)
  }

  // Derive selected product for pack → qty and total display
  const selectedProduct = products.find(p => p.id === form?.productId)
  const packSize = selectedProduct?.pack_size ?? null
  const packsNum = form ? Number(form.packs) : 0
  const quantityInPieces = packSize && packsNum > 0 ? packsNum * packSize : packsNum > 0 ? packsNum : null

  // Computed total client: packs × selling_price_per_pack + 36 DH livraison
  const isPackProduct = selectedProduct?.pack_size != null && selectedProduct.pack_size > 0
  const merchandiseTotal = isPackProduct && packsNum > 0 ? packsNum * (selectedProduct!.selling_price) : null
  const clientTotal = merchandiseTotal != null ? merchandiseTotal + CLIENT_SHIPPING_FEE : null

  async function handleCreate() {
    if (!form || !modalClient) return
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
      }
    } catch {
      setCreateError('Erreur réseau, veuillez réessayer')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Clients à relancer</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Clients JAMLA ayant au moins une commande livrée
          </p>
        </div>
        <div className="text-slate-400 text-sm">
          <span className="text-white font-semibold">{filtered.length}</span>
          {filtered.length !== clients.length && (
            <span className="ml-1">/ {clients.length}</span>
          )}
          <span className="ml-1">client{clients.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          <option value="all">Tous les types</option>
          <option value="jamla">Revendeur</option>
          <option value="pro">Pro</option>
          <option value="perso">Perso</option>
          <option value={NULL_TYPE}>Non renseigné</option>
        </select>

        {/* Product filter */}
        {allProducts.length > 1 && (
          <select
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tous les produits</option>
            {allProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Recherche nom / téléphone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded px-3 py-2 w-56 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
        />

        {/* Clear filters */}
        {(filterType !== 'all' || filterProduct !== 'all' || search) && (
          <button
            onClick={() => { setFilterType('all'); setFilterProduct('all'); setSearch('') }}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/60 border-b border-slate-700">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Client</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Téléphone</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Ville</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Dernière livraison</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Produit</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Qté</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Packs</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Livrées</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-500 text-sm">
                  Aucun client trouvé
                </td>
              </tr>
            ) : (
              filtered.map(c => (
                <tr key={c.phone} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-2.5 text-white font-medium text-sm max-w-[160px] truncate">
                    {c.name || <span className="text-slate-500 italic">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <TypeBadge type={c.customer_type} />
                  </td>
                  <td className="px-3 py-2.5 text-indigo-400 font-mono text-xs whitespace-nowrap">
                    {c.phone}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 text-xs whitespace-nowrap">
                    {c.city || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 text-xs whitespace-nowrap">
                    {fmtDate(c.last_delivered_at)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 text-xs max-w-[140px] truncate">
                    {c.last_product_name || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300 text-xs">
                    {c.last_quantity != null ? c.last_quantity : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300 text-xs">
                    {c.last_packs != null ? (
                      <span className="text-white font-semibold">{c.last_packs}</span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-green-400 font-bold text-xs bg-green-500/10 px-2 py-0.5 rounded">
                      {c.total_delivered}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => openModal(c)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 hover:bg-indigo-600/40 hover:text-indigo-300 transition-colors whitespace-nowrap"
                    >
                      + Commande
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create order modal */}
      {modalClient && form && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h2 className="font-semibold text-white text-base">Nouvelle commande</h2>
                <p className="text-xs text-slate-400 mt-0.5">{modalClient.name || modalClient.phone}</p>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createSuccess ? (
              <div className="px-6 py-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-semibold">Commande ajoutée avec succès.</p>
                  <p className="text-slate-400 text-sm mt-1">Elle est disponible dans <span className="text-indigo-400 font-medium">Mes Leads → Confirmés</span>.</p>
                </div>
                <button
                  onClick={closeModal}
                  className="mt-2 text-sm px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-5">
                {/* Section: coordonnées client */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Coordonnées client</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Nom</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => setForm(f => f ? { ...f, name: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder="Nom complet"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Téléphone</label>
                      <input
                        type="text"
                        value={form.phone}
                        onChange={e => setForm(f => f ? { ...f, phone: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Ville</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={e => setForm(f => f ? { ...f, city: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder="Ville"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Type client</label>
                      <select
                        value={form.customerType}
                        onChange={e => setForm(f => f ? { ...f, customerType: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">Non renseigné</option>
                        <option value="jamla">Revendeur (Jamla)</option>
                        <option value="pro">Pro</option>
                        <option value="perso">Perso</option>
                      </select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-slate-400">Adresse</label>
                      <input
                        type="text"
                        value={form.address1}
                        onChange={e => setForm(f => f ? { ...f, address1: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder="Adresse de livraison"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: commande */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Commande</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-slate-400">Produit</label>
                      <select
                        value={form.productId}
                        onChange={e => onProductChange(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                      >
                        {products.length === 0 && <option value="">Aucun produit actif</option>}
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">
                        Quantité{packSize ? ` (packs de ${packSize})` : ''}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={form.packs}
                        onChange={e => setForm(f => f ? { ...f, packs: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder={packSize ? 'Nb packs' : 'Quantité'}
                      />
                      {packSize && packsNum > 0 && (
                        <p className="text-[11px] text-slate-500">{quantityInPieces} pièces</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Variante / couleur</label>
                      <input
                        type="text"
                        value={form.variant}
                        onChange={e => setForm(f => f ? { ...f, variant: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                        placeholder="Ex: Noir, Mixte…"
                      />
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
                      <select
                        value={form.paymentMode}
                        onChange={e => setForm(f => f ? { ...f, paymentMode: e.target.value } : f)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                      >
                        {PAYMENT_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
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
                  <button
                    onClick={closeModal}
                    disabled={creating}
                    className="text-sm px-4 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating || !form.productId || !form.phone || !quantityInPieces || clientTotal == null}
                    className="text-sm px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
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
