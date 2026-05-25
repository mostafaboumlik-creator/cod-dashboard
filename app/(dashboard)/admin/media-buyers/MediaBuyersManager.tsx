'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { calcStats, calcNetProfit, calcCommission } from '@/lib/calculations'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Profile, Order } from '@/lib/types'

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  confirmed: 'Confirme',
  delivered: 'Livre',
  returned: 'Retour',
  cancelled: 'Annule',
  no_reply: 'Pas de reponse',
  unreachable: 'Injoignable',
  call_later: 'Rappeler',
  wrong_number: 'Faux numero',
  duplicate: 'Doublon',
  out_of_stock: 'Rupture stock',
  delivery_no_answer: 'Pas rep. livr.',
}

interface Props {
  initialBuyers: Profile[]
  orders: any[]
  products: { id: string; name: string }[]
}

export function MediaBuyersManager({ initialBuyers, orders, products }: Props) {
  const [buyers, setBuyers] = useState<Profile[]>(initialBuyers)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', commission_rate: 10 })

  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const [importBuyerId, setImportBuyerId] = useState<string | null>(null)
  const [linksBuyerId, setLinksBuyerId] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [importForm, setImportForm] = useState({ sheet_url: '', product_id: '', campaign_name: '', ad_platform: 'facebook', date_from: '' })
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; duplicates?: number; filtered?: number; statusCounts?: Record<string, number> } | null>(null)

  const supabase = createClient()

  async function handleCreate() {
    setSaving(true)
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { alert('Erreur: ' + data.error); setSaving(false); return }
    if (data.profile) setBuyers(prev => [...prev, data.profile as Profile])
    setSaving(false)
    setShowForm(false)
    setForm({ full_name: '', email: '', password: '', commission_rate: 10 })
  }

  async function handleUpdateCommission(buyerId: string, rate: number) {
    await supabase.from('profiles').update({ commission_rate: rate }).eq('id', buyerId)
    setBuyers(prev => prev.map(b => b.id === buyerId ? { ...b, commission_rate: rate } : b))
  }

  async function handleGenerateKey(buyerId: string) {
    setRegenerating(buyerId)
    const res = await fetch('/api/admin/generate-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer_id: buyerId }),
    })
    const data = await res.json()
    if (res.ok) {
      setBuyers(prev => prev.map(b => b.id === buyerId ? { ...b, api_key: data.api_key } : b))
      setShowApiKey(prev => ({ ...prev, [buyerId]: true }))
    }
    setRegenerating(null)
  }

  function copyWebhookUrl(buyer: Profile) {
    const url = `${window.location.origin}/api/webhook/leads?key=${buyer.api_key}`
    navigator.clipboard.writeText(url)
    setCopied(buyer.id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleImport() {
    if (!importBuyerId || !importForm.product_id || !importForm.sheet_url || !importForm.date_from) return
    setImporting(true)
    setImportResult(null)
    const res = await fetch('/api/admin/import-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...importForm, buyer_id: importBuyerId }),
    })
    const data = await res.json()
    if (!res.ok) { alert('Erreur: ' + (data.error || 'Erreur inconnue')); setImporting(false); return }
    setImportResult(data)
    setImporting(false)
  }

  function getBuyerStats(buyerId: string) {
    const buyerOrders = orders.filter(o => o.media_buyer_id === buyerId) as Order[]
    const stats = calcStats(buyerOrders)
    const buyer = buyers.find(b => b.id === buyerId)
    const commissionRate = buyer?.commission_rate || 10
    const totalCommission = buyerOrders
      .filter(o => o.status === 'delivered')
      .reduce((s, o) => s + calcCommission(calcNetProfit(o), commissionRate), 0)
    return { ...stats, totalCommission }
  }

  const webhookOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://votre-domaine.com'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Media Buyers</h1>
          <p className="text-slate-400 text-sm">{buyers.length} media buyers</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau media buyer
        </Button>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="font-semibold text-white">Nouveau Media Buyer</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div><Label>Nom complet</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Prenom Nom" /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@domain.com" /></div>
              <div><Label>Mot de passe</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimum 8 caracteres" /></div>
              <div><Label>Taux de commission (%)</Label><Input type="number" min="0" max="100" step="0.5" value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: Number(e.target.value) }))} /></div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={handleCreate} disabled={saving || !form.full_name || !form.email}>{saving ? 'Creation...' : 'Creer'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Tracking links modal */}
      {linksBuyerId && (() => {
        const buyer = buyers.find(b => b.id === linksBuyerId)!
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                <div>
                  <h2 className="font-semibold text-white">Liens de tracking</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{buyer.full_name}</p>
                </div>
                <button onClick={() => { setLinksBuyerId(null); setCopiedLink(null) }} className="text-slate-400 hover:text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-3">
                <p className="text-xs text-slate-400">
                  Partagez ces liens avec le media buyer. Chaque commande passee via ce lien lui sera automatiquement attribuee.
                </p>
                {products.filter(p => (p as any).is_active !== false).map(p => {
                  const url = `${webhookOrigin}/lp/${p.id}?ref=${buyer.id}`
                  const key = `${buyer.id}-${p.id}`
                  return (
                    <div key={p.id} className="bg-slate-800/50 rounded-xl p-3">
                      <p className="text-sm font-medium text-white mb-2">{p.name}</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs text-slate-300 font-mono bg-slate-900 rounded px-2 py-1.5 truncate">
                          {url}
                        </code>
                        <button
                          onClick={() => { navigator.clipboard.writeText(url); setCopiedLink(key); setTimeout(() => setCopiedLink(null), 2000) }}
                          className={`text-xs px-3 py-1.5 rounded flex-shrink-0 font-medium transition-colors ${copiedLink === key ? 'bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                        >
                          {copiedLink === key ? 'Copie!' : 'Copier'}
                        </button>
                      </div>
                    </div>
                  )
                })}
                {products.length === 0 && (
                  <p className="text-center text-slate-500 py-4">Aucun produit actif</p>
                )}
              </div>
              <div className="flex justify-end px-6 py-4 border-t border-slate-700">
                <button onClick={() => { setLinksBuyerId(null); setCopiedLink(null) }} className="text-sm text-slate-400 hover:text-white">Fermer</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Import Google Sheet modal */}
      {importBuyerId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="font-semibold text-white">Importer depuis Google Sheet</h2>
              <button onClick={() => { setImportBuyerId(null); setImportResult(null) }} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                La Google Sheet doit etre partagee en <strong>lecture publique</strong> (Tout le monde avec le lien).
                Colonnes detectees automatiquement: <strong>nom/full name, tel/telephone, ville, ETAT</strong>.
                La colonne ETAT mappe automatiquement: CONFIRME, PAS DE REPONSE, BOITE VOCALE, ANNULE, REPORTE, NUMERO INCORRECT, etc.
              </div>
              <div>
                <Label>URL Google Sheet</Label>
                <Input value={importForm.sheet_url} onChange={e => setImportForm(f => ({ ...f, sheet_url: e.target.value }))} placeholder="https://docs.google.com/spreadsheets/d/..." />
              </div>
              <div>
                <Label>Produit par defaut</Label>
                <Select value={importForm.product_id} onChange={e => setImportForm(f => ({ ...f, product_id: e.target.value }))}>
                  <option value="">Selectionner un produit...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Importer uniquement a partir du</Label>
                <Input
                  type="date"
                  value={importForm.date_from}
                  onChange={e => setImportForm(f => ({ ...f, date_from: e.target.value }))}
                />
                <p className="text-xs text-slate-500 mt-1">Les leads anterieurs a cette date seront ignores</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Campagne (optionnel)</Label>
                  <Input value={importForm.campaign_name} onChange={e => setImportForm(f => ({ ...f, campaign_name: e.target.value }))} placeholder="Nom campagne..." />
                </div>
                <div>
                  <Label>Plateforme</Label>
                  <Select value={importForm.ad_platform} onChange={e => setImportForm(f => ({ ...f, ad_platform: e.target.value }))}>
                    <option value="facebook">Facebook</option>
                    <option value="tiktok">TikTok</option>
                    <option value="other">Autre</option>
                  </Select>
                </div>
              </div>
              {importResult && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300 text-sm space-y-2">
                  <p>
                    <strong>{importResult.imported} leads importes</strong>
                    {(importResult.filtered ?? 0) > 0 && <span className="text-blue-400"> · {importResult.filtered} anciens filtres</span>}
                    {(importResult.duplicates ?? 0) > 0 && <span className="text-yellow-400"> · {importResult.duplicates} doublons ignores</span>}
                    {importResult.skipped > 0 && <span className="text-slate-400"> · {importResult.skipped} lignes vides</span>}
                  </p>
                  {importResult.statusCounts && Object.keys(importResult.statusCounts).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(importResult.statusCounts).map(([status, count]) => (
                        <span key={status} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                          {STATUS_LABELS[status] || status}: {count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <Button variant="secondary" onClick={() => { setImportBuyerId(null); setImportResult(null) }}>Fermer</Button>
              <Button onClick={handleImport} disabled={importing || !importForm.sheet_url || !importForm.product_id || !importForm.date_from}>
                {importing ? 'Importation...' : 'Importer les leads'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {buyers.map(buyer => {
          const stats = getBuyerStats(buyer.id)
          return (
            <Card key={buyer.id} className="hover:border-slate-600 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
                      {buyer.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{buyer.full_name}</p>
                      <p className="text-xs text-slate-500">{buyer.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="w-16 text-center text-sm bg-slate-700 border border-slate-600 rounded text-white py-1 focus:outline-none focus:border-indigo-500"
                      value={buyer.commission_rate}
                      min={0} max={100} step={0.5}
                      onChange={e => handleUpdateCommission(buyer.id, Number(e.target.value))}
                    />
                    <span className="text-slate-400 text-sm">%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs">Commandes</p>
                    <p className="text-white font-semibold text-lg">{stats.totalOrders}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs">CA livre</p>
                    <p className="text-white font-semibold">{formatCurrency(stats.totalRevenue)}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs">Profit net</p>
                    <p className={`font-semibold ${stats.totalNetProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(stats.totalNetProfit)}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs">Commission due</p>
                    <p className="text-indigo-400 font-semibold">{formatCurrency(stats.totalCommission)}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs">Taux confirm.</p>
                    <p className="text-blue-400 font-semibold">{formatPercent(stats.confirmationRate)}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs">Taux livraison</p>
                    <p className="text-green-400 font-semibold">{formatPercent(stats.deliveryRate)}</p>
                  </div>
                </div>

                {/* Integration section */}
                <div className="border-t border-slate-700 pt-3 space-y-2">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Integration</p>

                  {buyer.api_key ? (
                    <>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-slate-800 rounded px-2 py-1.5 text-slate-300 font-mono truncate">
                          {showApiKey[buyer.id]
                            ? `${webhookOrigin}/api/webhook/leads?key=${buyer.api_key}`
                            : `${webhookOrigin}/api/webhook/leads?key=••••••••••••`}
                        </code>
                        <button
                          onClick={() => setShowApiKey(prev => ({ ...prev, [buyer.id]: !prev[buyer.id] }))}
                          className="text-slate-400 hover:text-white p-1 flex-shrink-0"
                          title={showApiKey[buyer.id] ? 'Masquer' : 'Afficher'}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {showApiKey[buyer.id]
                              ? <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></>
                              : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>}
                          </svg>
                        </button>
                        <button
                          onClick={() => copyWebhookUrl(buyer)}
                          className={`text-xs px-2 py-1 rounded flex-shrink-0 transition-colors ${copied === buyer.id ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        >
                          {copied === buyer.id ? 'Copie!' : 'Copier'}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGenerateKey(buyer.id)}
                          disabled={regenerating === buyer.id}
                          className="text-xs text-slate-400 hover:text-white underline"
                        >
                          {regenerating === buyer.id ? 'Generation...' : 'Regenerer la cle'}
                        </button>
                        <span className="text-slate-700">|</span>
                        <button
                          onClick={() => { setImportBuyerId(buyer.id); setImportResult(null); setImportForm({ sheet_url: '', product_id: '', campaign_name: '', ad_platform: 'facebook', date_from: '' }) }}
                          className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                        >
                          Importer Google Sheet
                        </button>
                        <span className="text-slate-700">|</span>
                        <button
                          onClick={() => setLinksBuyerId(buyer.id)}
                          className="text-xs text-emerald-400 hover:text-emerald-300 underline"
                        >
                          Liens landing page
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => handleGenerateKey(buyer.id)}
                      disabled={regenerating === buyer.id}
                      className="text-xs bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 px-3 py-1.5 rounded border border-indigo-600/30 transition-colors"
                    >
                      {regenerating === buyer.id ? 'Generation...' : 'Generer une cle API'}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {buyers.length === 0 && (
          <div className="col-span-2 text-center py-16 text-slate-500">
            Aucun media buyer cree
          </div>
        )}
      </div>
    </div>
  )
}
