import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { TimelineStrip, timelineMarkerLabel } from '@/components/finance/TimelineStrip'

const netflix = { id: 'r1', name: 'Netflix', daysAway: 3, categoryColor: '#C58CFF', hufEquivalent: 1770 }
const rent = { id: 'r2', name: 'Rent', daysAway: 0, categoryColor: '#FF8A65', hufEquivalent: 210000 }

describe('renewal timeline markers are reachable without a mouse', () => {
  it('describes a marker by name, day and amount', () => {
    expect(timelineMarkerLabel(netflix, 'HUF')).toBe('Netflix, in 3 days, 1770 Ft')
    expect(timelineMarkerLabel(rent, 'HUF')).toMatch(/^Rent, today, 210\s000\sFt$/)
    expect(timelineMarkerLabel({ ...netflix, daysAway: 1, hufEquivalent: 4.99 }, 'EUR')).toBe('Netflix, in 1 day, €4.99')
  })

  it('renders each marker as a labelled, focusable button', () => {
    const html = renderToStaticMarkup(createElement(TimelineStrip, { events: [netflix, rent], horizon: 30 }))
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toContain('type="button"')
    expect(buttons[0]).toContain('aria-label="Netflix, in 3 days, 1770 Ft"')
    expect(buttons[0]).toContain('aria-expanded="false"')
  })

  it('shows details on keyboard focus as well as hover, and hides the visual copy from screen readers', () => {
    const html = renderToStaticMarkup(createElement(TimelineStrip, { events: [netflix], horizon: 30 }))
    expect(html).toContain('group-focus-visible:opacity-100')
    // The tooltip repeats the button's label; screen readers get it once, from the label.
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>Netflix · 1770 Ft<\/span>/)
    // Only phrasing content inside a button.
    const inside = html.slice(html.indexOf('<button'), html.indexOf('</button>'))
    expect(inside).not.toContain('<div')
  })
})

describe('FX auto rates do not pulse', () => {
  it('labels automatic rates statically', () => {
    const settings = readFileSync(path.resolve(__dirname, '../app/(app)/settings/GeneralSettings.tsx'), 'utf8')
    expect(settings).not.toContain('animate-pulse')
    expect(settings).not.toMatch(/>\s*Live\s*</)
    expect(settings.match(/Auto-updated/g)).toHaveLength(2)
  })
})
