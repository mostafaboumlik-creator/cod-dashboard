'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Product } from '@/lib/types'

// Google Sheets icon
function SheetsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zM9 15.75H6v-1.5h3v1.5zm0-3H6v-1.5h3v1.5zm0-3H6V8.25h3v1.5zm9 6h-7.5v-1.5H18v1.5zm0-3h-7.5v-1.5H18v1.5zm0-3h-7.5V8.25H18v1.5z"/>
    </svg>
  )
}

interface Props { initialProducts: Product[] }

interface PackVariant {
  qty: number
  selling_price: number
}

const EMPTY = {
  name: '',
  category: '',
  selling_type: 'unite' as 'unite' | 'pack',
  selling_price: 0,
  product_cost: 0,
  packaging_cost: 5,
  delivery_cost_casa: 20,
  delivery_cost_hors_casa: 35,
  call_center_cost: 15,
  warehouse_cost: 15,
  is_active: true,
  unit_cost: 0,
  units_per_pack: 1,
  variants: [] as PackVariant[],
}

export function ProductsManager({ initialProducts }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const supabase = createClient()

  // Google Sheet modal state
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetSyncActive, setSheetSyncActive] = useState(true)
  const [sheetDateFrom, setSheetDateFrom] = useState('')
  const [sheetSaving, setSheetSaving] = useState(false)
  const [sheetImporting, setSheetImporting] = useState(false)
  const [sheetResult, setSheetResult] = useState<any>(null)
  const [sheetError, setSheetError] = useState('')

  function openSheetModal(p: Product) {
    setSheetProduct(p)
    setSheetUrl(p.sheet_url || '')
    setSheetSyncActive(p.sheet_sync_active !== false)
    setSheetResult(null)
    setSheetError('')
  }

  async function saveSheetUrl() {
    if (!sheetProduct) return
    setSheetSaving(true)
    const { data } = await supabase
      .from('products')
      .update({ sheet_url: sheetUrl.trim() || null, sheet_sync_active: sheetSyncActive })
      .eq('id', sheetProduct.id)
      .select()
      .single()
    if (data) {
      setProducts(prev => prev.map(p => p.id === sheetProduct.id ? { ...p, sheet_url: data.sheet_url, sheet_sync_active: data.sheet_sync_active } : p))
      setSheetProduct(prev => prev ? { ...prev, sheet_url: data.sheet_url, sheet_sync_active: data.sheet_sync_active } : prev)
    }
    setSheetSaving(false)
  }

  async function runImport() {
    if (!sheetProduct || !sheetUrl.trim()) return
    setSheetImporting(true)
    setSheetResult(null)
    setSheetError('')
    try {
      const res = await fetch('/api/admin/import-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheet_url: sheetUrl.trim(),
          product_id: sheetProduct.id,
          date_from: sheetDateFrom || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) setSheetError(data.error || 'Erreur lors de l\'import')
      else setSheetResult(data)
    } catch {
      setSheetError('Erreur réseau')
    }
    setSheetImporting(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    const payload = {
      name: form.name,
      category: form.category || null,
      selling_type: form.selling_type,
      selling_price: Number(form.selling_price),
      unit_cost: form.selling_type === 'pack' ? Number(form.unit_cost) : 0,
      product_cost: Number(form.product_cost),
      packaging_cost: Number(form.packaging_cost),
      delivery_cost_casa: Number(form.delivery_cost_casa),
      delivery_cost_hors_casa: Number(form.delivery_cost_hors_casa),
      call_center_cost: Number(form.call_center_cost),
      warehouse_cost: Number(form.warehouse_cost),
      is_active: form.is_active,
      variants: form.selling_type === 'pack' ? form.variants : [],
    }
    if (editing) {
      const { data, error } = await supabase.from('products').update(payload).eq('id', editing.id).select().single()
      if (error) {
        setSaveError(error.message)
        setSaving(false)
        return
      }
      // Fallback optimiste si RLS bloque le SELECT après UPDATE
      setProducts(prev => prev.map(p => p.id === editing!.id
        ? (data ? data as Product : { ...p, ...payload } as Product)
        : p
      ))
    } else {
      const { data, error } = await supabase.from('products').insert(payload).select().single()
      if (error) {
        setSaveError(error.message)
        setSaving(false)
        return
      }
      if (data) setProducts(prev => [data as Product, ...prev])
    }
    setSaving(false)
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY)
  }

  async function handleToggle(product: Product) {
    const { data } = await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id).select().single()
    if (data) setProducts(prev => prev.map(p => p.id === product.id ? data as Product : p))
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce produit ?')) return
    await supabase.from('products').delete().eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name,
      category: p.category || '',
      selling_type: p.selling_type || 'unite',
      selling_price: p.selling_price,
      product_cost: p.product_cost,
      packaging_cost: p.packaging_cost,
      delivery_cost_casa: p.delivery_cost_casa ?? 20,
      delivery_cost_hors_casa: p.delivery_cost_hors_casa ?? 35,
      call_center_cost: p.call_center_cost ?? 15,
      warehouse_cost: p.warehouse_cost ?? 15,
      unit_cost: p.unit_cost || 0,
      units_per_pack: 1,
      is_active: p.is_active,
      variants: p.variants || [],
    })
    setShowForm(true)
  }

  const sp = Number(form.selling_price)
  const pc = Number(form.product_cost)
  const pk = Number(form.packaging_cost)
  const dc = Number(form.delivery_cost_casa)
  const dh = Number(form.delivery_cost_hors_casa)
  const cc = Number(form.call_center_cost)
  const wc = Number(form.warehouse_cost)
  const grossMargin = sp - pc - pk
  const netProfit = sp - pc - pk - dc - cc - wc
  const netProfitHorsCasa = sp - pc - pk - dh - cc - wc

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Gestion des Produits</h1>
          <p className="text-slate-400 text-sm">{products.length} produits</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(EMPTY); setShowForm(true) }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau produit
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="font-semibold text-white">{editing ? 'Modifier le produit' : 'Nouveau produit'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Nom + Catégorie */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nom du produit</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Magic Hanger..." />
                </div>
                <div>
                  <Label>Catégorie</Label>
                  <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Ex: Accessoire..." />
                </div>
              </div>

              {/* Type de vente */}
              <div>
                <Label>Type de vente</Label>
                <div className="flex gap-2 mt-1">
                  {(['unite', 'pack'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, selling_type: t }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.selling_type === t
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t === 'unite' ? 'Unité' : 'Pack'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculateur pack / unité */}
              {form.selling_type === 'pack' ? (
                <div className="space-y-4">
                  {/* Coût unitaire + Packaging */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Coût unitaire (MAD)</Label>
                      <Input
                        type="number" step="0.01"
                        value={form.unit_cost}
                        onChange={e => setForm(f => ({ ...f, unit_cost: Number(e.target.value) }))}
                        placeholder="Ex: 1"
                      />
                      <p className="text-[11px] text-slate-500 mt-0.5">Coût par pièce</p>
                    </div>
                    <div>
                      <Label>Packaging (MAD)</Label>
                      <Input type="number" step="0.01" value={form.packaging_cost} onChange={e => setForm(f => ({ ...f, packaging_cost: Number(e.target.value) }))} />
                    </div>
                  </div>

                  {/* Tableau des offres Youcan */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Offres Youcan (variantes)</Label>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, variants: [...f.variants, { qty: 1, selling_price: 0 }] }))}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Ajouter offre
                      </button>
                    </div>

                    {form.variants.length > 0 ? (
                      <div className="rounded-lg bg-slate-800/60 border border-slate-700 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-700 bg-slate-900/50">
                              <th className="text-left px-3 py-2 text-slate-400 font-medium">Qté</th>
                              <th className="text-right px-3 py-2 text-slate-400 font-medium">Coût achat</th>
                              <th className="text-right px-3 py-2 text-slate-400 font-medium">Prix vente</th>
                              <th className="text-right px-3 py-2 text-green-400/80 font-medium">Profit Casa</th>
                              <th className="text-right px-3 py-2 text-amber-400/80 font-medium">Profit H.Casa</th>
                              <th className="px-2 py-2 w-6"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {form.variants.map((v, i) => {
                              const uc = Number(form.unit_cost) || 0
                              const purchaseCost = uc * v.qty
                              const pk2 = Number(form.packaging_cost) || 0
                              const dc2 = Number(form.delivery_cost_casa) || 0
                              const dh2 = Number(form.delivery_cost_hors_casa) || 0
                              const cc2 = Number(form.call_center_cost) || 0
                              const wc2 = Number(form.warehouse_cost) || 0
                              const profitCasa = v.selling_price - purchaseCost - pk2 - dc2 - cc2 - wc2
                              const profitHC   = v.selling_price - purchaseCost - pk2 - dh2 - cc2 - wc2
                              return (
                                <tr key={i} className="border-b border-slate-700/40 last:border-0 hover:bg-slate-700/20">
                                  <td className="px-2 py-1.5">
                                    <Input
                                      type="number" min="1" step="1"
                                      value={v.qty}
                                      onChange={e => {
                                        const updated = [...form.variants]
                                        updated[i] = { ...v, qty: Math.max(1, Number(e.target.value)) }
                                        setForm(f => ({ ...f, variants: updated }))
                                      }}
                                      className="w-16 text-xs py-0.5 h-7"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-slate-300 font-medium">
                                    {purchaseCost > 0 ? `${purchaseCost.toFixed(0)} MAD` : '—'}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <Input
                                      type="number" step="0.01"
                                      value={v.selling_price || ''}
                                      placeholder="0"
                                      onChange={e => {
                                        const updated = [...form.variants]
                                        updated[i] = { ...v, selling_price: Number(e.target.value) }
                                        setForm(f => ({ ...f, variants: updated }))
                                      }}
                                      className="w-20 text-xs py-0.5 h-7"
                                    />
                                  </td>
                                  <td className={`px-3 py-1.5 text-right font-semibold ${v.selling_price > 0 ? (profitCasa >= 0 ? 'text-green-400' : 'text-red-400') : 'text-slate-600'}`}>
                                    {v.selling_price > 0 ? `${profitCasa.toFixed(0)} MAD` : '—'}
                                  </td>
                                  <td className={`px-3 py-1.5 text-right font-semibold ${v.selling_price > 0 ? (profitHC >= 0 ? 'text-amber-400' : 'text-red-400') : 'text-slate-600'}`}>
                                    {v.selling_price > 0 ? `${profitHC.toFixed(0)} MAD` : '—'}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setForm(f => ({ ...f, variants: f.variants.filter((_, j) => j !== i) }))}
                                      className="text-slate-500 hover:text-red-400 transition-colors"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-800/40 border border-dashed border-slate-700 py-4 text-center">
                        <p className="text-xs text-slate-500">Aucune offre — cliquez "Ajouter offre" pour saisir vos variantes Youcan</p>
                      </div>
                    )}
                  </div>

                  {/* Valeurs par défaut (pour le tableau de bord) */}
                  <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-3 space-y-2">
                    <p className="text-xs text-slate-400 font-medium">Offre principale (Default variant Youcan)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Prix de vente (MAD)</Label>
                        <Input type="number" step="0.01" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: Number(e.target.value) }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Coût du pack (MAD)</Label>
                        <div className="relative">
                          <Input type="number" step="0.01" value={form.product_cost} onChange={e => setForm(f => ({ ...f, product_cost: Number(e.target.value) }))} className="h-8 text-sm bg-indigo-950/30" />
                          {form.unit_cost > 0 && form.product_cost > 0 && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-indigo-400">
                              {(form.product_cost / form.unit_cost).toFixed(0)}×{form.unit_cost}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Prix de vente (MAD)</Label>
                    <Input type="number" step="0.01" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <Label>Coût unitaire (MAD)</Label>
                    <Input type="number" step="0.01" value={form.product_cost} onChange={e => setForm(f => ({ ...f, product_cost: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <Label>Packaging (MAD)</Label>
                    <Input type="number" step="0.01" value={form.packaging_cost} onChange={e => setForm(f => ({ ...f, packaging_cost: Number(e.target.value) }))} />
                  </div>
                </div>
              )}

              {/* Livraison */}
              <div>
                <Label>Coût de livraison (MAD)</Label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Casablanca</p>
                    <div className="flex gap-2 items-center">
                      <Input type="number" step="0.01" value={form.delivery_cost_casa} onChange={e => setForm(f => ({ ...f, delivery_cost_casa: Number(e.target.value) }))} />
                      <button
                        onClick={() => setForm(f => ({ ...f, delivery_cost_casa: 20 }))}
                        className="text-xs text-indigo-400 hover:text-indigo-300 whitespace-nowrap"
                      >20 MAD</button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Hors Casablanca</p>
                    <div className="flex gap-2 items-center">
                      <Input type="number" step="0.01" value={form.delivery_cost_hors_casa} onChange={e => setForm(f => ({ ...f, delivery_cost_hors_casa: Number(e.target.value) }))} />
                      <button
                        onClick={() => setForm(f => ({ ...f, delivery_cost_hors_casa: 35 }))}
                        className="text-xs text-indigo-400 hover:text-indigo-300 whitespace-nowrap"
                      >35 MAD</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Call center + Warehouse */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Coût call center (MAD)</Label>
                  <Input type="number" step="0.01" value={form.call_center_cost} onChange={e => setForm(f => ({ ...f, call_center_cost: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Charges bureau / warehouse (MAD)</Label>
                  <Input type="number" step="0.01" value={form.warehouse_cost} onChange={e => setForm(f => ({ ...f, warehouse_cost: Number(e.target.value) }))} />
                </div>
              </div>

              {/* Aperçu profit */}
              {sp > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-800/50 text-sm space-y-1.5">
                    <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">📍 Casablanca ({dc} MAD)</p>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Profit brut:</span>
                      <span className={netProfit >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>{formatCurrency(netProfit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Profit brut %:</span>
                      <span className={netProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPercent((netProfit / sp) * 100)}</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50 text-sm space-y-1.5">
                    <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">🌍 Hors Casa ({dh} MAD)</p>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Profit brut:</span>
                      <span className={netProfitHorsCasa >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>{formatCurrency(netProfitHorsCasa)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Profit brut %:</span>
                      <span className={netProfitHorsCasa >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPercent((netProfitHorsCasa / sp) * 100)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {saveError && (
              <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700/40 text-red-400 text-xs">{saveError}</div>
            )}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving || !form.name}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheet Modal */}
      {sheetProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <SheetsIcon className="w-5 h-5 text-green-400" />
                <h2 className="font-semibold text-white">Google Sheet</h2>
              </div>
              <button onClick={() => setSheetProduct(null)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-400">Produit : <span className="text-white font-medium">{sheetProduct.name}</span></p>

              {/* URL input */}
              <div>
                <Label>Lien Google Sheet</Label>
                <Input
                  value={sheetUrl}
                  onChange={e => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="text-xs"
                />
                <p className="text-xs text-slate-500 mt-1">Le sheet doit être partagé en lecture publique ("Tout le monde avec le lien")</p>
              </div>

              {/* Sync toggle */}
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div>
                  <p className="text-sm text-white font-medium">Sync automatique actif</p>
                  <p className="text-xs text-slate-400">Accepte les nouvelles leads via webhook</p>
                </div>
                <button
                  onClick={() => setSheetSyncActive(v => !v)}
                  className={`w-11 h-6 rounded-full transition-colors ${sheetSyncActive ? 'bg-green-500' : 'bg-slate-600'}`}
                >
                  <span className={`block w-4 h-4 rounded-full bg-white mx-1 transition-transform ${sheetSyncActive ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Save URL */}
              <Button
                variant="secondary"
                onClick={saveSheetUrl}
                disabled={sheetSaving}
                className="w-full"
              >
                {sheetSaving ? 'Enregistrement...' : 'Enregistrer l\'URL'}
              </Button>

              <hr className="border-slate-700" />

              {/* Manual import */}
              <div>
                <p className="text-sm font-medium text-white mb-3">Import manuel</p>
                <div className="mb-3">
                  <Label>Importer depuis la date (optionnel)</Label>
                  <Input
                    type="date"
                    value={sheetDateFrom}
                    onChange={e => setSheetDateFrom(e.target.value)}
                  />
                </div>
                <Button
                  onClick={runImport}
                  disabled={sheetImporting || !sheetUrl.trim()}
                  className="w-full bg-green-600 hover:bg-green-500 text-white"
                >
                  {sheetImporting ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeWidth={2} strokeLinecap="round"/>
                      </svg>
                      Import en cours...
                    </span>
                  ) : 'Importer maintenant'}
                </Button>
              </div>

              {/* Result */}
              {sheetResult && (
                <div className="rounded-xl bg-green-900/20 border border-green-700/40 p-4 space-y-2">
                  <p className="text-green-400 font-semibold text-sm">Import terminé</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Importés :</span>
                      <span className="text-green-400 font-bold">{sheetResult.imported}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Doublons :</span>
                      <span className="text-amber-400 font-bold">{sheetResult.duplicates}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Filtrés :</span>
                      <span className="text-slate-300 font-bold">{sheetResult.filtered ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total lignes :</span>
                      <span className="text-slate-300 font-bold">{sheetResult.total}</span>
                    </div>
                  </div>
                  {sheetResult.statusCounts && Object.keys(sheetResult.statusCounts).length > 0 && (
                    <div className="pt-2 border-t border-green-700/30">
                      <p className="text-xs text-slate-400 mb-1">Statuts importés :</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(sheetResult.statusCounts).map(([s, c]: any) => (
                          <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{s}: {c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sheetError && (
                <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4">
                  <p className="text-red-400 text-sm">{sheetError}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 font-medium px-5 py-3">Produit</th>
                <th className="text-center text-slate-400 font-medium px-3 py-3">Type</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Prix vente</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Coût</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Packaging</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Livr. Casa</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Livr. H.Casa</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Call center</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Bureau/WH</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Profit brut Casa</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Profit brut H.Casa</th>
                <th className="text-center text-slate-400 font-medium px-3 py-3">Statut</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const dc = p.delivery_cost_casa ?? 20
                const dh = p.delivery_cost_hors_casa ?? 35
                const cc = p.call_center_cost ?? 15
                const wc = p.warehouse_cost ?? 15
                const net = p.selling_price - p.product_cost - p.packaging_cost - dc - cc - wc
                const netHC = p.selling_price - p.product_cost - p.packaging_cost - dh - cc - wc
                return (
                  <tr key={p.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-5 py-3 font-medium text-white">{p.name}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.selling_type === 'pack'
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-slate-700 text-slate-300'
                      }`}>{p.selling_type === 'pack' ? 'Pack' : 'Unité'}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-white">{formatCurrency(p.selling_price)}</td>
                    <td className="px-3 py-3 text-right text-slate-400">{formatCurrency(p.product_cost)}</td>
                    <td className="px-3 py-3 text-right text-slate-400">{formatCurrency(p.packaging_cost)}</td>
                    <td className="px-3 py-3 text-right text-slate-400">{formatCurrency(dc)}</td>
                    <td className="px-3 py-3 text-right text-slate-400">{formatCurrency(p.delivery_cost_hors_casa ?? 35)}</td>
                    <td className="px-3 py-3 text-right text-slate-400">{formatCurrency(cc)}</td>
                    <td className="px-3 py-3 text-right text-slate-400">{formatCurrency(wc)}</td>
                    <td className={`px-3 py-3 text-right font-medium ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(net)}</td>
                    <td className={`px-3 py-3 text-right font-medium ${netHC >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{formatCurrency(netHC)}</td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => handleToggle(p)}>
                        <Badge variant={p.is_active ? 'success' : 'default'}>{p.is_active ? 'Actif' : 'Inactif'}</Badge>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openSheetModal(p)}
                          title="Google Sheet"
                          className={`p-1.5 rounded transition-colors ${p.sheet_url ? 'text-green-400 hover:text-green-300 hover:bg-green-400/10' : 'text-slate-400 hover:text-green-400 hover:bg-green-400/10'}`}
                        >
                          <SheetsIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {products.length === 0 && (
                <tr><td colSpan={13} className="px-5 py-12 text-center text-slate-500">Aucun produit créé</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
