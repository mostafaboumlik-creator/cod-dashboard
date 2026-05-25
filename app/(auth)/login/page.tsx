'use client'

import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(`Erreur login: ${error.message}`)
      setLoading(false)
      return
    }

    if (!authData.user) {
      setError('Aucun utilisateur retourné')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (profileError) {
      setError(`Erreur profil: ${profileError.message}`)
      setLoading(false)
      return
    }

    if (profile?.role === 'admin') window.location.href = '/admin'
    else if (profile?.role === 'confirmation_agent') window.location.href = '/agent'
    else window.location.href = '/buyer'
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email) { setError('Entrez votre email d\'abord'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) { setError('Erreur lors de l\'envoi. Vérifiez l\'email.'); return }
    setResetSent(true)
  }

  return (
    <div className="bg-[#1e293b] rounded-2xl p-8 border border-slate-700 shadow-2xl">
      {resetSent ? (
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-white font-medium">Email envoyé!</p>
          <p className="text-slate-400 text-sm mt-1">Vérifiez votre boîte mail et cliquez sur le lien.</p>
          <button onClick={() => { setResetSent(false); setShowReset(false) }} className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm underline">
            Retour à la connexion
          </button>
        </div>
      ) : showReset ? (
        <>
          <h2 className="text-lg font-semibold text-white mb-6">Réinitialiser le mot de passe</h2>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-[#0f172a] border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="votre@email.com"
              />
            </div>
            <button type="submit" disabled={loading} className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-medium rounded-lg transition-colors">
              {loading ? 'Envoi...' : 'Envoyer le lien'}
            </button>
          </form>
          <button onClick={() => { setShowReset(false); setError('') }} className="mt-4 w-full text-slate-400 hover:text-slate-300 text-sm text-center">
            ← Retour à la connexion
          </button>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-white mb-6">Connexion</h2>

          {(error || searchParams.get('error')) && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error || 'Erreur d\'authentification. Réessayez.'}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-[#0f172a] border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="votre@email.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-300">Mot de passe</label>
                <button type="button" onClick={() => { setShowReset(true); setError('') }} className="text-xs text-indigo-400 hover:text-indigo-300">
                  Mot de passe oublié?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-[#0f172a] border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-medium rounded-lg transition-colors mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connexion...
                </span>
              ) : 'Se connecter'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">COD Dashboard</h1>
          <p className="text-slate-400 mt-1">E-commerce Maroc — Suivi de rentabilité</p>
        </div>
        <Suspense fallback={<div className="bg-[#1e293b] rounded-2xl p-8 border border-slate-700" />}>
          <LoginForm />
        </Suspense>
        <p className="text-center text-slate-500 text-sm mt-6">
          COD Dashboard v1.0 — Beta
        </p>
      </div>
    </div>
  )
}
