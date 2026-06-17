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
  /** `sm` (default) = 32px desktop pill; `lg` = 40px touch pill for tablet/mobile. */
  size?: 'sm' | 'lg'
  /** Stretch the control to fill its container with equal-width buttons. */
  fullWidth?: boolean
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  size = 'sm',
  fullWidth = false,
}: SegmentedProps<T>) {
  // `sm` keeps the canonical h-[26px] desktop sizing; `lg` is the 40px touch variant.
  const btnSize = size === 'lg' ? 'h-[34px] text-[12.5px] rounded-[9px]' : 'h-[26px] text-[12px] rounded-[8px]'
  return (
    <div
      role="group"
      className={cn(
        'items-center p-[3px] bg-secondary/80',
        size === 'lg' ? 'rounded-[12px]' : 'rounded-[10px]',
        fullWidth ? 'flex w-full' : 'inline-flex',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 after:absolute after:inset-x-0 after:-inset-y-[9px] md:after:hidden',
            btnSize,
            fullWidth && 'flex-1',
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
