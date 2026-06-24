'use client'
import { useRouter } from 'next/navigation'
import { format, subDays } from 'date-fns'

const today     = () => format(new Date(), 'yyyy-MM-dd')
const daysAgo   = (n: number) => format(subDays(new Date(), n), 'yyyy-MM-dd')
const yesterday = () => daysAgo(1)

const PRESETS = [
  { label: "Auj.",  from: () => today(),      to: () => today()      },
  { label: 'Hier',  from: () => yesterday(),   to: () => yesterday()  },
  { label: '7j',    from: () => daysAgo(6),    to: () => today()      },
  { label: '30j',   from: () => daysAgo(29),   to: () => today()      },
]

export function AdminDateFilter({ activeFrom, activeTo }: { activeFrom: string; activeTo: string }) {
  const router = useRouter()

  const apply = (from: string, to: string) => {
    router.push(`/admin?from=${from}&to=${to}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => {
        const from = p.from()
        const to   = p.to()
        const active = activeFrom === from && activeTo === to
        return (
          <button key={p.label} onClick={() => apply(from, to)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              active ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}>
            {p.label}
          </button>
        )
      })}
      <input type="date" value={activeFrom}
        onChange={e => apply(e.target.value, activeTo)}
        className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
      />
      <span className="text-slate-500 text-sm">→</span>
      <input type="date" value={activeTo}
        onChange={e => apply(activeFrom, e.target.value)}
        className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
      />
    </div>
  )
}
