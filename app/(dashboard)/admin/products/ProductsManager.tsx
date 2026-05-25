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

interface Props { initialProducts: Product[] }

const EMPTY = { name: '', category: '', selling_price: 0, product_cost: 0, packaging_cost: 0, is_active: true }

export function ProductsManager({ initialProducts }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleSave() {
    setSaving(true)
    const payload = {
      name: form.name,
      category: form.category || null,
      selling_price: Number(form.selling_price),
      product_cost: Number(form.product_cost),
      packaging_cost: Number(form.packaging_cost),
      is_active: form.is_active,
    }
    if (editing) {
      const { data } = await supabase.from('products').update(payload).eq('id', editing.id).select().single()
      if (data) setProducts(prev => prev.map(p => p.id === editing.id ? data as Product : p))
    } else {
      const { data } = await supabase.from('products').insert(payload).select().single()
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
    setForm({ name: p.name, category: p.category || '', selling_price: p.selling_price, product_cost: p.product_cost, packaging_cost: p.packaging_cost, is_active: p.is_active })
    setShowForm(true)
  }

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
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="font-semibold text-white">{editing ? 'Modifier le produit' : 'Nouveau produit'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <Label>Nom du produit</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Montre sportive..." />
              </div>
              <div>
                <Label>Categorie</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Ex: Sante, Beaute, Sport..." />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Prix de vente (MAD)', key: 'selling_price' },
                  { label: 'Coût produit (MAD)', key: 'product_cost' },
                  { label: 'Packaging (MAD)', key: 'packaging_cost' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Input type="number" step="0.01" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              {Number(form.selling_price) > 0 && (
                <div className="p-3 rounded-lg bg-slate-800/50 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Marge brute:</span>
                    <span className="text-white">{formatCurrency(Number(form.selling_price) - Number(form.product_cost) - Number(form.packaging_cost))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Taux de marge:</span>
                    <span className="text-green-400">{formatPercent(((Number(form.selling_price) - Number(form.product_cost) - Number(form.packaging_cost)) / Number(form.selling_price)) * 100)}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving || !form.name}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
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
                <th className="text-right text-slate-400 font-medium px-5 py-3">Prix vente</th>
                <th className="text-right text-slate-400 font-medium px-5 py-3">Coût produit</th>
                <th className="text-right text-slate-400 font-medium px-5 py-3">Packaging</th>
                <th className="text-right text-slate-400 font-medium px-5 py-3">Marge brute</th>
                <th className="text-right text-slate-400 font-medium px-5 py-3">Marge %</th>
                <th className="text-center text-slate-400 font-medium px-5 py-3">Statut</th>
                <th className="text-right text-slate-400 font-medium px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const grossMargin = p.selling_price - p.product_cost - p.packaging_cost
                const marginPct = p.selling_price > 0 ? (grossMargin / p.selling_price) * 100 : 0
                return (
                  <tr key={p.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-5 py-3 font-medium text-white">{p.name}</td>
                    <td className="px-5 py-3 text-right text-white">{formatCurrency(p.selling_price)}</td>
                    <td className="px-5 py-3 text-right text-slate-400">{formatCurrency(p.product_cost)}</td>
                    <td className="px-5 py-3 text-right text-slate-400">{formatCurrency(p.packaging_cost)}</td>
                    <td className={`px-5 py-3 text-right font-medium ${grossMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(grossMargin)}</td>
                    <td className={`px-5 py-3 text-right font-medium ${marginPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPercent(marginPct)}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handleToggle(p)}>
                        <Badge variant={p.is_active ? 'success' : 'default'}>{p.is_active ? 'Actif' : 'Inactif'}</Badge>
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
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
                <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-500">Aucun produit créé</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
