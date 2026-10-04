'use client'

import { useState, useEffect, useCallback } from 'react'

const PACK_SIZE = 12

interface JamlaOrder {
  id: string
  status: string
  categorie: string
  customer_name: string | null
  customer_phone: string | null
  city: string | null
  selling_price: number
  delivery_cost: number
  quantity: number | null
  tracking_code: string | null
  ameex_sent_at: string | null
  return_received_at: string | null
  cod: number
}

interface DailyRamassage {
  date: string
  colis: number
  pieces: number
  packs: number
}

interface ReportKpis {
  confies: number
  confiesPieces: number
  confiesPacks: number
  ramasses: number
  ramassePieces: number
  ramassePacks: number
  livres: number
  livresPieces: number
  livresPacks: number
  enAttenteRamassage: number
  enAttenteRamassagePieces: number
  enAttenteRamassagePacks: number
  enSuspens: number
  enSuspensPieces: number
  enSuspensPacks: number
  retourARecevoir: number
  retourARecevoirPieces: number
  retourARecevoirPacks: number
  retourRecus: number
  retourRecusPieces: number
  retourRecusPacks: number
  echecs: number
  echecsPieces: number
  echecsPacks: number
  aVerifier: number
  aVerifierPieces: number
  aVerifierPacks: number
  tauxLivraison: number
  codARecevoirDAmeex: number
  reconciliationOk: boolean
}

interface ReportData {
  kpis: ReportKpis
  orders: JamlaOrder[]
  dailyRamassages: DailyRamassage[]
}

const STATUS_FR: Record<string, string> = {
  confirmed: 'Confirmé', picked_up: 'Ramassé', received_hub: 'Reçu agence',
  address_issue: 'Attente adresse', in_delivery: 'En livraison', out_of_zone: 'Hors-zone',
  refused: 'Refusé', preparing_return: 'Prép. retour', redirect_city: 'Renvoi ville',
  delivered: 'Livré', returned: 'Retour', cancelled: 'Annulé',
  delivery_no_answer: 'Pas rép. livraison', postponed: 'Reporté', wrong_number: 'Faux numéro',
}

const CATEGORIE_FR: Record<string, string> = {
  en_attente: 'En attente', en_suspens: 'En suspens', livre: 'Livré',
  echec: 'Échec', retour_a_recevoir: 'Retour à recevoir',
  retour_recu: 'Retour reçu', a_verifier: 'À vérifier',
}

function statusBadgeClass(status: string): string {
  if (status === 'delivered') return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
  if (status === 'returned') return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  if (['refused', 'cancelled', 'wrong_number'].includes(status)) return 'bg-red-500/20 text-red-400 border border-red-500/30'
  if (['in_delivery', 'picked_up', 'received_hub', 'redirect_city'].includes(status)) return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
  if (status === 'confirmed') return 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
  if (['address_issue', 'delivery_no_answer', 'postponed', 'out_of_zone'].includes(status)) return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
  if (status === 'preparing_return') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
  return 'bg-slate-700/50 text-slate-300 border border-slate-600'
}

function defaultDates() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtPacks(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1)
}

function PacksCell({ quantity }: { quantity: number | null }) {
  if (quantity == null) return <span className="text-slate-500">—</span>
  const anomaly = quantity % PACK_SIZE !== 0
  const packsVal = quantity / PACK_SIZE
  return (
    <span className={anomaly ? 'text-amber-400' : 'text-slate-300'} title={anomaly ? 'Quantité à vérifier (non multiple de 12)' : undefined}>
      {anomaly ? `${packsVal.toFixed(1)} ⚠` : String(packsVal)}
    </span>
  )
}

export function JamlaReport() {
  const [dates, setDates] = useState(defaultDates)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/jamla-report?from=${dates.from}&to=${dates.to}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Erreur serveur')
        return
      }
      setData(await res.json())
    } catch {
      setError('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }, [dates.from, dates.to])

  useEffect(() => { fetchData() }, [fetchData])

  async function markRetourRecu(orderId: string, received: boolean) {
    setActionLoading(orderId)
    try {
      const res = await fetch('/api/admin/jamla-report/return-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, received }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || 'Erreur serveur')
        return
      }
      await fetchData()
    } finally {
      setActionLoading(null)
    }
  }

  function handleCsvDownload() {
    window.location.href = `/api/admin/jamla-report?from=${dates.from}&to=${dates.to}&format=csv`
  }

  const kpis = data?.kpis
  const orders = data?.orders || []
  const dailyRamassages = data?.dailyRamassages || []

  return (
    <div className="min-h-screen bg-[#060b18] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rapport Jamla — AMEEX</h1>
          <p className="text-slate-400 text-sm mt-1">Chaussettes antidérapantes · Suivi des colis confiés à AMEEX</p>
        </div>
        <button
          onClick={handleCsvDownload}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exporter CSV
        </button>
      </div>

      {/* Date filters */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-slate-400 text-sm">Du</label>
          <input
            type="date"
            value={dates.from}
            onChange={e => setDates(d => ({ ...d, from: e.target.value }))}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-slate-400 text-sm">Au</label>
          <input
            type="date"
            value={dates.to}
            onChange={e => setDates(d => ({ ...d, to: e.target.value }))}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
          />
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Chargement…
          </div>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {kpis && !kpis.reconciliationOk && (
          <p className="text-amber-400 text-xs">⚠ Somme des catégories ({
            kpis.enAttenteRamassage + kpis.livres + kpis.echecs + kpis.retourARecevoir + kpis.retourRecus + kpis.enSuspens + kpis.aVerifier
          }) ≠ confiés ({kpis.confies}) — vérifier les données</p>
        )}
      </div>

      {/* COD À RECEVOIR D'AMEEX — featured card */}
      {kpis && (
        <div className="bg-gradient-to-r from-indigo-900/50 to-indigo-800/30 border border-indigo-600/40 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-indigo-300 text-sm font-medium uppercase tracking-wider">COD À RECEVOIR D&apos;AMEEX</p>
            <p className="text-4xl font-bold text-white mt-1">
              {kpis.codARecevoirDAmeex.toLocaleString('fr-FR')} <span className="text-2xl text-indigo-300">DH</span>
            </p>
            <p className="text-slate-400 text-xs mt-1">
              COD total des {kpis.livres} commandes livrées sur la période
            </p>
          </div>
          <div className="text-indigo-400 opacity-30">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      )}

      {/* KPI grids */}
      {kpis && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard label="COLIS CONFIÉS" value={kpis.confies} color="slate"
              subValues={[`${fmtPacks(kpis.confiesPacks)} packs`, `${kpis.confiesPieces} pièces`]} />
            <KpiCard label="RAMASSÉS" value={kpis.ramasses} color="blue" hint="flux"
              subValues={[`${fmtPacks(kpis.ramassePacks)} packs`, `${kpis.ramassePieces} pièces`]} />
            <KpiCard label="LIVRÉS" value={kpis.livres} color="emerald"
              subValues={[`${fmtPacks(kpis.livresPacks)} packs`, `${kpis.livresPieces} pièces`]} />
            <KpiCard
              label="TAUX LIVRAISON"
              value={`${kpis.tauxLivraison}%`}
              color={kpis.tauxLivraison >= 70 ? 'emerald' : kpis.tauxLivraison >= 50 ? 'yellow' : 'red'}
              hint="dossiers résolus"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard label="EN ATTENTE RAMASSAGE" value={kpis.enAttenteRamassage} color="indigo"
              subValues={[`${fmtPacks(kpis.enAttenteRamassagePacks)} packs`, `${kpis.enAttenteRamassagePieces} pièces`]} />
            <KpiCard label="EN SUSPENS" value={kpis.enSuspens} color="yellow"
              subValues={[`${fmtPacks(kpis.enSuspensPacks)} packs`, `${kpis.enSuspensPieces} pièces`]} />
            <KpiCard
              label="RETOURS À RECEVOIR D'AMEEX"
              value={kpis.retourARecevoir}
              subValues={[`${fmtPacks(kpis.retourARecevoirPacks)} packs`, `${kpis.retourARecevoirPieces} pièces`]}
              color="orange"
            />
            <KpiCard
              label="RETOURS REÇUS"
              value={kpis.retourRecus}
              subValues={[`${fmtPacks(kpis.retourRecusPacks)} packs`, `${kpis.retourRecusPieces} pièces`]}
              color="slate"
            />
            <KpiCard label="ÉCHECS" value={kpis.echecs} color="red"
              subValues={[`${fmtPacks(kpis.echecsPacks)} packs`, `${kpis.echecsPieces} pièces`]} />
          </div>

          {kpis.aVerifier > 0 && (
            <div className="border border-amber-600/40 bg-amber-900/10 rounded-xl p-4 flex items-center gap-4">
              <div className="text-amber-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <p className="text-amber-300 text-sm font-medium uppercase tracking-wide">À VÉRIFIER</p>
                <p className="text-2xl font-bold text-white">
                  {kpis.aVerifier} <span className="text-sm text-amber-400 font-normal">colis</span>
                  <span className="text-sm text-slate-400 font-normal ml-3">{fmtPacks(kpis.aVerifierPacks)} packs · {kpis.aVerifierPieces} pièces</span>
                </p>
                <p className="text-slate-400 text-xs">Statuts non classifiés — vérification manuelle requise</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Daily ramassage breakdown */}
      {dailyRamassages.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="text-white font-medium text-sm">Colis ramassés — regroupés par date d&apos;envoi AMEEX</h2>
            <p className="text-slate-500 text-xs mt-0.5">La date correspond à l&apos;envoi AMEEX, pas nécessairement au ramassage physique.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                  <th className="px-4 py-2 text-left">Date envoi AMEEX</th>
                  <th className="px-4 py-2 text-right">Colis ramassés</th>
                  <th className="px-4 py-2 text-right">Packs</th>
                  <th className="px-4 py-2 text-right">Pièces</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {dailyRamassages.map(row => (
                  <tr key={row.date} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-2 text-slate-300 whitespace-nowrap">
                      {new Date(row.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-2 text-right text-white font-medium">{row.colis}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{fmtPacks(row.packs)}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{row.pieces}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-600 bg-slate-700/20">
                  <td className="px-4 py-2 text-slate-300 font-medium text-xs uppercase">Total</td>
                  <td className="px-4 py-2 text-right text-white font-bold">{dailyRamassages.reduce((a, r) => a + r.colis, 0)}</td>
                  <td className="px-4 py-2 text-right text-slate-200 font-bold">{fmtPacks(dailyRamassages.reduce((a, r) => a + r.packs, 0))}</td>
                  <td className="px-4 py-2 text-right text-slate-400 font-bold">{dailyRamassages.reduce((a, r) => a + r.pieces, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Orders table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="text-white font-medium text-sm">{orders.length} colis</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                <th className="px-4 py-3 text-left">Date AMEEX</th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Ville</th>
                <th className="px-4 py-3 text-right">Qté</th>
                <th className="px-4 py-3 text-right">Packs</th>
                <th className="px-4 py-3 text-right">COD</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-left">Suivi</th>
                <th className="px-4 py-3 text-left">Retour reçu</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {orders.map(order => (
                <tr
                  key={order.id}
                  className={`transition-colors ${order.categorie === 'a_verifier' ? 'bg-amber-900/10 hover:bg-amber-900/20' : 'hover:bg-slate-700/20'}`}
                >
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{fmtDate(order.ameex_sent_at)}</td>
                  <td className="px-4 py-3">
                    <div className="text-white">{order.customer_name || '—'}</div>
                    <div className="text-slate-500 text-xs">{order.customer_phone || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{order.city || '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {order.quantity != null ? order.quantity : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PacksCell quantity={order.quantity} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-white whitespace-nowrap">{order.cod} DH</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(order.status)}`}>
                      {STATUS_FR[order.status] || order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${order.categorie === 'a_verifier' ? 'text-amber-400 font-medium' : 'text-slate-400'}`}>
                      {CATEGORIE_FR[order.categorie] || order.categorie}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">{order.tracking_code || '—'}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {order.return_received_at
                      ? <span className="text-emerald-400">{fmtDate(order.return_received_at)}</span>
                      : '—'
                    }
                  </td>
                  <td className="px-4 py-3">
                    {order.status === 'returned' && !order.return_received_at && (
                      <button
                        onClick={() => markRetourRecu(order.id, true)}
                        disabled={actionLoading === order.id}
                        className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {actionLoading === order.id ? '…' : 'Marquer reçu'}
                      </button>
                    )}
                    {order.status === 'returned' && order.return_received_at && (
                      <button
                        onClick={() => markRetourRecu(order.id, false)}
                        disabled={actionLoading === order.id}
                        className="px-3 py-1 bg-slate-700/50 hover:bg-slate-700 text-slate-400 border border-slate-600 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {actionLoading === order.id ? '…' : 'Annuler'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && !loading && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                    Aucun colis trouvé sur cette période
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, hint, subValues }: {
  label: string
  value: number | string
  color: 'slate' | 'blue' | 'emerald' | 'yellow' | 'red' | 'indigo' | 'orange'
  hint?: string
  subValues?: string[]
}) {
  const colorMap = {
    slate:   { card: 'bg-slate-800/50 border-slate-700', text: 'text-white', label: 'text-slate-400' },
    blue:    { card: 'bg-blue-900/20 border-blue-800/40', text: 'text-blue-300', label: 'text-blue-400/70' },
    emerald: { card: 'bg-emerald-900/20 border-emerald-800/40', text: 'text-emerald-300', label: 'text-emerald-400/70' },
    yellow:  { card: 'bg-yellow-900/20 border-yellow-800/40', text: 'text-yellow-300', label: 'text-yellow-400/70' },
    red:     { card: 'bg-red-900/20 border-red-800/40', text: 'text-red-300', label: 'text-red-400/70' },
    indigo:  { card: 'bg-indigo-900/20 border-indigo-800/40', text: 'text-indigo-300', label: 'text-indigo-400/70' },
    orange:  { card: 'bg-orange-900/20 border-orange-800/40', text: 'text-orange-300', label: 'text-orange-400/70' },
  }
  const c = colorMap[color]
  return (
    <div className={`border rounded-xl p-4 ${c.card}`}>
      <p className={`text-xs font-medium uppercase tracking-wide leading-tight ${c.label}`}>
        {label}
        {hint && <span className="ml-1 normal-case text-slate-500 text-xs">({hint})</span>}
      </p>
      <p className={`text-2xl font-bold mt-1 ${c.text}`}>{value} <span className="text-sm font-normal text-slate-500">colis</span></p>
      {subValues?.map((v, i) => (
        <p key={i} className="text-xs text-slate-500 mt-0.5">{v}</p>
      ))}
    </div>
  )
}
