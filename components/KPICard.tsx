import { cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  trend?: number
  color?: 'indigo' | 'green' | 'amber' | 'red' | 'blue' | 'purple'
}

const COLOR_MAP = {
  indigo: 'bg-indigo-500/10 text-indigo-400',
  green:  'bg-green-500/10 text-green-400',
  amber:  'bg-amber-500/10 text-amber-400',
  red:    'bg-red-500/10 text-red-400',
  blue:   'bg-blue-500/10 text-blue-400',
  purple: 'bg-purple-500/10 text-purple-400',
}

export function KPICard({ title, value, subtitle, icon, trend, color = 'indigo' }: KPICardProps) {
  return (
    <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', COLOR_MAP[color])}>
          {icon}
        </div>
        {trend !== undefined && (
          <span className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full',
            trend >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          )}>
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
      <div className="text-sm font-medium text-slate-400">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  )
}
