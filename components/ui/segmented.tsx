'use client'

import { cn } from '@/lib/utils'

interface SegmentedOption<T extends string | number> {
  label: string
  value: T
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function Segmented<T extends string | number>({ options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div role="group" className={cn('inline-flex items-center p-[3px] bg-secondary/80 rounded-[10px]', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative h-[26px] px-3 text-[12px] rounded-[8px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 after:absolute after:inset-x-0 after:-inset-y-[9px] md:after:hidden',
            value === o.value
              ? 'bg-card text-foreground shadow-pb-1'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
