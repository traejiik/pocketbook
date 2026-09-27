'use client'

import { useLayoutEffect, useRef } from 'react'
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
  const groupRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)

  // The selected pill is one shared element that slides between options, so a
  // change reads as movement rather than two buttons swapping backgrounds. It is
  // placed by writing to the DOM (no state, no extra render). Until the first
  // measurement the active button paints its own background, so server HTML and
  // no-JS render correctly; `data-ready` hands the job to the indicator, and
  // `data-animate` turns the slide on only after that first placement so the
  // pill never sweeps in from the left edge on mount.
  const activeIndex = options.findIndex((o) => o.value === value)
  useLayoutEffect(() => {
    const group = groupRef.current
    const indicator = indicatorRef.current
    if (!group || !indicator) return
    const place = () => {
      const btn = group.children[activeIndex + 1] as HTMLElement | undefined
      if (!btn) {
        delete group.dataset.ready
        return
      }
      indicator.style.width = `${btn.offsetWidth}px`
      indicator.style.transform = `translateX(${btn.offsetLeft}px)`
      group.dataset.ready = ''
    }
    place()
    const frame = requestAnimationFrame(() => {
      group.dataset.animate = ''
    })
    // Labels can reflow (font load, fullWidth resize), so keep the pill glued.
    const ro = new ResizeObserver(place)
    ro.observe(group)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [activeIndex])

  // `sm` keeps the canonical h-[26px] desktop sizing; `lg` is the 40px touch variant.
  const btnSize = size === 'lg' ? 'h-[34px] text-[12.5px] rounded-[9px]' : 'h-[26px] text-[12px] rounded-[8px]'
  return (
    <div
      ref={groupRef}
      role="group"
      className={cn(
        'segmented group/seg relative items-center p-[3px] bg-secondary/80',
        size === 'lg' ? 'rounded-[12px]' : 'rounded-[10px]',
        fullWidth ? 'flex w-full' : 'inline-flex',
        className,
      )}
    >
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className={cn(
          'segmented-indicator absolute left-0 top-[3px] bottom-[3px] bg-card shadow-pb-1 opacity-0 group-data-[ready]/seg:opacity-100',
          size === 'lg' ? 'rounded-[9px]' : 'rounded-[8px]',
        )}
      />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-[1] px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 after:absolute after:inset-x-0 after:-inset-y-[9px] md:after:hidden',
            btnSize,
            fullWidth && 'flex-1',
            value === o.value
              ? 'bg-card text-foreground shadow-pb-1 group-data-[ready]/seg:bg-transparent group-data-[ready]/seg:shadow-none'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
