'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState } from 'react'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'

const PRESETS = [
  { label: "Aujourd'hui", days: 0 },
  { label: '7 jours',     days: 7 },
  { label: '30 jours',    days: 30 },
  { label: 'Ce mois',     days: -1 },
]

export function BuyerDateFilter({ activeFrom, activeTo }: { activeFrom: string; activeTo: string }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [from, setFrom] = useState(activeFrom)
  const [to,   setTo]   = useState(activeTo)

  function apply(f: string, t: string) {
    const params = new URLSearchParams()
    params.set('from', f)
    params.set('to', t)
    router.push(`${pathname}?${params.toString()}`)
  }

  function applyPreset(days: number) {
    const today = new Date()
    if (days === -1) {
      const f = format(startOfMonth(today), 'yyyy-MM-dd')
      const t = format(endOfMonth(today),   'yyyy-MM-dd')
      setFrom(f); setTo(t)
      apply(f, t)
    } else if (days === 0) {
      const f = format(today, 'yyyy-MM-dd')
      setFrom(f); setTo(f)
      apply(f, f)
    } else {
      const f = format(subDays(today, days), 'yyyy-MM-dd')
      const t = format(today, 'yyyy-MM-dd')
      setFrom(f); setTo(t)
      apply(f, t)
    }
  }

  function isActive(days: number) {
    const today = new Date()
    if (days === -1) return activeFrom === format(startOfMonth(today), 'yyyy-MM-dd')
    if (days === 0)  return activeFrom === activeTo && activeFrom === format(today, 'yyyy-MM-dd')
    return activeFrom === format(subDays(today, days), 'yyyy-MM-dd') && activeTo === format(today, 'yyyy-MM-dd')
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => (
        <button
          key={p.label}
          onClick={() => applyPreset(p.days)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isActive(p.days)
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          onBlur={() => from && to && apply(from, to)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"
        />
        <span className="text-slate-500 text-xs">au</span>
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          onBlur={() => from && to && apply(from, to)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"
        />
      </div>
    </div>
  )
}
