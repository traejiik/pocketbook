'use client'

import { useState, type CSSProperties } from 'react'
import { fmtAnchor } from '@/lib/format'
import { cn } from '@/lib/utils'

interface TimelineEvent {
  id: string
  name: string
  daysAway: number
  categoryColor: string
  hufEquivalent: number
}

interface TimelineStripProps {
  events: TimelineEvent[]
  horizon: number
  anchorCurrency?: string
}

/** What a marker says to a screen reader, and what its tooltip shows. */
export function timelineMarkerLabel(e: TimelineEvent, anchorCurrency: string): string {
  const when = e.daysAway === 0 ? 'today' : e.daysAway === 1 ? 'in 1 day' : `in ${e.daysAway} days`
  return `${e.name}, ${when}, ${fmtAnchor(e.hufEquivalent, anchorCurrency)}`
}

export function TimelineStrip({ events, horizon, anchorCurrency = 'HUF' }: TimelineStripProps) {
  // Tap toggles a marker's details (touch has no hover); hover and keyboard focus
  // show them through CSS. Escape dismisses them until focus leaves the marker,
  // so details shown by focus can be closed too (WCAG 1.4.13).
  const [openId, setOpenId] = useState<string | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  return (
    <div className="calm-card p-6">
      <div className="text-[11px] mono uppercase tracking-[0.12em] text-muted-foreground mb-5">
        Cash-out timeline
      </div>
      <div className="relative h-14">
        <div className="absolute top-7 left-0 right-0 h-px bg-border" />
        {events.map((e) => {
          const pct = Math.min(98, Math.max(0, (e.daysAway / horizon) * 100))
          const open = openId === e.id
          const dismissed = dismissedId === e.id
          return (
            // A full-width track moved by transform (a % of the track, unlike `left`
            // on the marker, which cannot be composited), so switching the horizon
            // slides every marker to its rescaled day. Hovered, focused or open tracks
            // lift above their neighbours so the tooltip is never painted under the next one.
            <div
              key={e.id}
              className={cn(
                'motion-track absolute inset-0 pointer-events-none hover:z-10 focus-within:z-10',
                open && 'z-10',
              )}
              style={{ transform: `translateX(${pct}%)` }}
            >
            <button
              type="button"
              aria-label={timelineMarkerLabel(e, anchorCurrency)}
              aria-expanded={open}
              onClick={() => { setDismissedId(null); setOpenId(open ? null : e.id) }}
              onBlur={() => {
                if (open) setOpenId(null)
                if (dismissed) setDismissedId(null)
              }}
              onKeyDown={(ev) => {
                if (ev.key !== 'Escape') return
                setOpenId(null)
                setDismissedId(e.id)
              }}
              className="motion-bar-label absolute left-0 top-0 -translate-x-1/2 group pointer-events-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 after:absolute after:-inset-x-2 after:-inset-y-1"
              style={{ '--bar-base': '240ms', '--i': Math.round(pct / 10) } as CSSProperties}
            >
              <span className="block w-0.5 bg-border h-3 mx-auto" />
              <span
                className="block w-2.5 h-2.5 rounded-full mx-auto"
                style={{
                  background: e.categoryColor,
                  boxShadow: '0 0 0 3px hsl(var(--card))',
                }}
              />
              <span
                aria-hidden
                className={cn(
                  'block text-[9.5px] text-muted-foreground mono text-center mt-1 whitespace-nowrap absolute left-1/2 -translate-x-1/2 group-hover:text-foreground group-focus-visible:text-foreground',
                  open && 'text-foreground',
                )}
              >
                {e.daysAway}d
              </span>
              <span
                aria-hidden
                className={cn(
                  'block transition-opacity absolute -top-12 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-2 py-1 text-[11px] whitespace-nowrap shadow-pb-2 z-10 pointer-events-none',
                  dismissed ? 'opacity-0' : open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                )}
              >
                {e.name} · {fmtAnchor(e.hufEquivalent, anchorCurrency)}
              </span>
            </button>
            </div>
          )
        })}
        <div className="absolute -bottom-0.5 left-0 text-[10px] text-muted-foreground mono">Today</div>
        <div className="absolute -bottom-0.5 right-0 text-[10px] text-muted-foreground mono">+{horizon}d</div>
      </div>
    </div>
  )
}
