import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-slate-700 text-slate-300': variant === 'default',
          'bg-green-500/10 text-green-400 border border-green-500/20': variant === 'success',
          'bg-amber-500/10 text-amber-400 border border-amber-500/20': variant === 'warning',
          'bg-red-500/10 text-red-400 border border-red-500/20': variant === 'danger',
          'bg-blue-500/10 text-blue-400 border border-blue-500/20': variant === 'info',
          'bg-purple-500/10 text-purple-400 border border-purple-500/20': variant === 'purple',
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
