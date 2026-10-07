'use client'

import type { CSSProperties } from 'react'
import { fmtAnchor } from '@/lib/format'

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

export function TimelineStrip({ events, horizon, anchorCurrency = 'HUF' }: TimelineStripProps) {
  return (
    <div className="calm-card p-6">
      <div className="text-[11px] mono uppercase tracking-[0.12em] text-muted-foreground mb-5">
        Cash-out timeline
      </div>
      <div className="relative h-14">
        <div className="absolute top-7 left-0 right-0 h-px bg-border" />
        {events.map((e) => {
          const pct = Math.min(98, Math.max(0, (e.daysAway / horizon) * 100))
          return (
            // A full-width track moved by transform (a % of the track, unlike `left`
            // on the marker, which cannot be composited), so switching the horizon
            // slides every marker to its rescaled day. Hovered tracks lift above
            // their neighbours so the tooltip is never painted under the next one.
            <div
              key={e.id}
              className="motion-track absolute inset-0 pointer-events-none hover:z-10"
              style={{ transform: `translateX(${pct}%)` }}
            >
            <div
              className="motion-bar-label absolute left-0 top-0 -translate-x-1/2 group pointer-events-auto"
              style={{ '--bar-base': '240ms', '--i': Math.round(pct / 10) } as CSSProperties}
            >
              <div className="w-0.5 bg-border h-3 mx-auto" />
              <div
                className="w-2.5 h-2.5 rounded-full mx-auto"
                style={{
                  background: e.categoryColor,
                  boxShadow: '0 0 0 3px hsl(var(--card))',
                }}
              />
              <div className="text-[9.5px] text-muted-foreground mono text-center mt-1 whitespace-nowrap absolute left-1/2 -translate-x-1/2 group-hover:text-foreground">
                {e.daysAway}d
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-2 py-1 text-[11px] whitespace-nowrap shadow-pb-2 z-10">
                {e.name} · {fmtAnchor(e.hufEquivalent, anchorCurrency)}
              </div>
            </div>
            </div>
          )
        })}
        <div className="absolute -bottom-0.5 left-0 text-[10px] text-muted-foreground mono">Today</div>
        <div className="absolute -bottom-0.5 right-0 text-[10px] text-muted-foreground mono">+{horizon}d</div>
      </div>
    </div>
  )
}
