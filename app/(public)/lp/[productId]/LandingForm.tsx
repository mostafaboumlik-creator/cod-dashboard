'use client'

import { useState } from 'react'

const CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tanger', 'Agadir',
  'Meknes', 'Oujda', 'Kenitra', 'Tetouan', 'Nador', 'Safi',
  'El Jadida', 'Beni Mellal', 'Khouribga', 'Settat', 'Mohammedia',
  'Laayoune', 'Khenifra', 'Berrechid', 'Taza', 'Khemisset',
  'Larache', 'Guelmim', 'Ifrane', 'Tiznit', 'Taroudant', 'Autre',
]

interface Props {
  product: { id: string; name: string; selling_price: number }
  buyerId: string | null
}

export function LandingForm({ product, buyerId }: Props) {
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', city: '' })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer_name.trim() || !form.customer_phone.trim() || !form.city) {
      setError('Veuillez remplir tous les champs.')
      return
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/leads/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        buyer_id: buyerId,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        city: form.city,
      }),
    })
    if (res.ok) {
      setSubmitted(true)
    } else {
      const d = await res.json()
      setError(d.error || 'Une erreur est survenue. Reessayez.')
    }
    setLoading(false)
  }

  const price = product.selling_price.toLocaleString('fr-MA') + ' MAD'

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Commande recue!</h2>
          <p className="text-gray-500">
            Notre equipe va vous contacter dans les <strong>24 heures</strong> pour confirmer votre commande de <strong>{product.name}</strong>.
          </p>
          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-400">Numero de telephone enregistre:</p>
            <p className="font-semibold text-gray-700 mt-1">{form.customer_phone}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-6 pt-8 pb-10 text-white text-center">
          <span className="inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4 tracking-wide uppercase">
            Paiement a la livraison
          </span>
          <h1 className="text-2xl font-bold leading-tight mb-3">{product.name}</h1>
          <div className="text-4xl font-extrabold">{price}</div>
          <p className="text-indigo-200 text-sm mt-2">Livraison partout au Maroc</p>
        </div>

        {/* Form */}
        <div className="px-6 py-6">
          <p className="text-center text-gray-500 text-sm mb-5">
            Remplissez le formulaire et nous vous appelons pour confirmer
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
              <input
                type="text"
                value={form.customer_name}
                onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                placeholder="Votre nom et prenom"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numero de telephone</label>
              <input
                type="tel"
                value={form.customer_phone}
                onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                placeholder="06 XX XX XX XX"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
              <select
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              >
                <option value="">Selectionnez votre ville</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-4 rounded-xl text-base transition-colors mt-2"
            >
              {loading ? 'Envoi en cours...' : 'Commander maintenant'}
            </button>
          </form>
        </div>

        {/* Trust signals */}
        <div className="border-t border-gray-100 px-6 py-4">
          <div className="flex justify-around text-center">
            <div>
              <p className="text-lg">🚚</p>
              <p className="text-xs text-gray-400 mt-1">Livraison rapide</p>
            </div>
            <div>
              <p className="text-lg">💰</p>
              <p className="text-xs text-gray-400 mt-1">Paiement livraison</p>
            </div>
            <div>
              <p className="text-lg">✅</p>
              <p className="text-xs text-gray-400 mt-1">100% garanti</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
