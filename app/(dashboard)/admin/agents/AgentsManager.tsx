'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Profile } from '@/lib/types'

interface Props {
  initialAgents: Profile[]
  mediaBuyers: { id: string; full_name: string }[]
  initialAssignments: { agent_id: string; buyer_id: string }[]
  orders: any[]
}

const STATUS_PROCESSED = ['confirmed', 'cancelled', 'wrong_number', 'no_reply', 'unreachable', 'out_of_stock', 'duplicate', 'delivered', 'returned', 'delivery_no_answer']

export function AgentsManager({ initialAgents, mediaBuyers, initialAssignments, orders }: Props) {
  const [agents, setAgents] = useState<Profile[]>(initialAgents)
  const [assignments, setAssignments] = useState(initialAssignments)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', commission_rate: 10 })
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [assignModal, setAssignModal] = useState<string | null>(null)
  const [pendingBuyers, setPendingBuyers] = useState<string[]>([])
  const [savingAssign, setSavingAssign] = useState(false)

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  function getAgentBuyers(agentId: string) {
    return assignments.filter(a => a.agent_id === agentId).map(a => a.buyer_id)
  }

  function getAgentStats(agentId: string) {
    const agentBuyers = getAgentBuyers(agentId)
    const agentOrders = orders.filter(o => {
      if (!agentBuyers.includes(o.media_buyer_id)) return false
      const d = o.created_at?.slice(0, 10)
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    })
    const total = agentOrders.length
    const processed = agentOrders.filter(o => STATUS_PROCESSED.includes(o.status)).length
    const confirmed = agentOrders.filter(o => ['confirmed', 'delivered', 'returned'].includes(o.status)).length
    const delivered = agentOrders.filter(o => o.status === 'delivered')
    const confirmRate = processed > 0 ? (confirmed / processed) * 100 : 0
    const agent = agents.find(a => a.id === agentId)
    const rate = agent?.commission_rate || 10

    const commission = delivered.reduce((sum, o) => {
      const np = o.selling_price - o.product_cost - o.packaging_cost - o.delivery_cost - o.call_center_cost - (o.ad_spend || 0)
      return np > 0 ? sum + (np * rate / 100) : sum
    }, 0)

    const deliveryNoAnswer = agentOrders.filter(o => o.status === 'delivery_no_answer').length
    const lead = agentOrders.filter(o => o.status === 'lead').length

    return { total, processed, confirmed, delivered: delivered.length, confirmRate, commission, deliveryNoAnswer, lead }
  }

  async function handleCreate() {
    setSaving(true)
    const res = await fetch('/api/admin/create-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { alert('Erreur: ' + data.error); setSaving(false); return }
    if (data.profile) setAgents(prev => [...prev, data.profile as Profile])
    setSaving(false)
    setShowForm(false)
    setForm({ full_name: '', email: '', password: '', commission_rate: 10 })
  }

  function openAssignModal(agentId: string) {
    setPendingBuyers(getAgentBuyers(agentId))
    setAssignModal(agentId)
  }

  async function saveAssignments() {
    if (!assignModal) return
    setSavingAssign(true)
    const res = await fetch('/api/admin/agent-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: assignModal, buyer_ids: pendingBuyers }),
    })
    if (res.ok) {
      setAssignments(prev => [
        ...prev.filter(a => a.agent_id !== assignModal),
        ...pendingBuyers.map(bid => ({ agent_id: assignModal, buyer_id: bid })),
      ])
      setAssignModal(null)
    }
    setSavingAssign(false)
  }

  async function handleUpdateCommission(agentId: string, rate: number) {
    const supabase = createClient(serviceUrl, serviceAnon)
    await supabase.from('profiles').update({ commission_rate: rate }).eq('id', agentId)
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, commission_rate: rate } : a))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Agents de Confirmation</h1>
          <p className="text-slate-400 text-sm">{agents.length} agents</p>
        </div>
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
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500" />
          <span className="text-slate-500 text-sm">→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-700">✕</button>
          )}
          <Button onClick={() => setShowForm(true)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvel agent
          </Button>
        </div>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="font-semibold text-white">Nouvel Agent de Confirmation</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div><Label>Nom complet</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Prenom Nom" /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="agent@domain.com" /></div>
              <div><Label>Mot de passe</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimum 8 caracteres" /></div>
              <div><Label>Commission sur livraisons (%)</Label><Input type="number" min="0" max="100" step="0.5" value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: Number(e.target.value) }))} /></div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={handleCreate} disabled={saving || !form.full_name || !form.email}>{saving ? 'Creation...' : 'Creer'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Assign buyers modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h2 className="font-semibold text-white">Assigner des Media Buyers</h2>
                <p className="text-xs text-slate-400 mt-0.5">{agents.find(a => a.id === assignModal)?.full_name}</p>
              </div>
              <button onClick={() => setAssignModal(null)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-2">
              <p className="text-xs text-slate-400 mb-3">L'agent verra tous les leads des media buyers selectionnes.</p>
              {mediaBuyers.map(b => (
                <label key={b.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={pendingBuyers.includes(b.id)}
                    onChange={e => setPendingBuyers(prev => e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id))}
                    className="w-4 h-4 rounded accent-indigo-500"
                  />
                  <span className="text-sm text-slate-200">{b.full_name}</span>
                </label>
              ))}
              {mediaBuyers.length === 0 && <p className="text-slate-500 text-sm text-center py-4">Aucun media buyer</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <Button variant="secondary" onClick={() => setAssignModal(null)}>Annuler</Button>
              <Button onClick={saveAssignments} disabled={savingAssign}>{savingAssign ? 'Sauvegarde...' : 'Enregistrer'}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map(agent => {
          const stats = getAgentStats(agent.id)
          const assignedBuyers = getAgentBuyers(agent.id)
          return (
            <Card key={agent.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-semibold">
                      {agent.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{agent.full_name}</p>
                      <p className="text-xs text-slate-500">{agent.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="w-14 text-center text-sm bg-slate-700 border border-slate-600 rounded text-white py-1 focus:outline-none focus:border-indigo-500"
                      value={agent.commission_rate}
                      min={0} max={100} step={0.5}
                      onChange={e => handleUpdateCommission(agent.id, Number(e.target.value))}
                    />
                    <span className="text-slate-400 text-sm">%</span>
                  </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-3 gap-2 text-sm mb-4">
                  <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <p className="text-slate-500 text-xs">En attente</p>
                    <p className="text-yellow-400 font-bold text-lg">{stats.lead}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <p className="text-slate-500 text-xs">Traites</p>
                    <p className="text-white font-bold text-lg">{stats.processed}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <p className="text-slate-500 text-xs">Taux confirm.</p>
                    <p className="text-blue-400 font-bold">{formatPercent(stats.confirmRate)}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <p className="text-slate-500 text-xs">Livres</p>
                    <p className="text-green-400 font-bold text-lg">{stats.delivered}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <p className="text-slate-500 text-xs">Pas rep. livr.</p>
                    <p className="text-amber-400 font-bold text-lg">{stats.deliveryNoAnswer}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <p className="text-slate-500 text-xs">Commission</p>
                    <p className="text-indigo-400 font-bold text-sm">{formatCurrency(stats.commission)}</p>
                  </div>
                </div>

                {/* Assigned buyers */}
                <div className="border-t border-slate-700 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Media Buyers assignes</p>
                    <button
                      onClick={() => openAssignModal(agent.id)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                    >
                      Modifier
                    </button>
                  </div>
                  {assignedBuyers.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {assignedBuyers.map(bid => {
                        const buyer = mediaBuyers.find(b => b.id === bid)
                        return buyer ? (
                          <span key={bid} className="text-xs bg-indigo-600/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-600/30">
                            {buyer.full_name}
                          </span>
                        ) : null
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 italic">Aucun buyer assigne — cliquez Modifier</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {agents.length === 0 && (
          <div className="col-span-2 text-center py-16 text-slate-500">Aucun agent de confirmation cree</div>
        )}
      </div>
    </div>
  )
}
