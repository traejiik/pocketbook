import { describe, expect, it } from 'vitest'
import { fmtCompact } from '@/lib/format'

// Chart labels have ~64px to live in, so amounts collapse to thousands/millions.
// The sign still has to be the typographic minus the rest of the ledger uses.
describe('fmtCompact', () => {
  it('rounds to thousands and millions, and leaves small amounts alone', () => {
    expect(fmtCompact(142_400, 'HUF')).toBe('142k')
    expect(fmtCompact(1_240_000, 'HUF')).toBe('1.2M')
    expect(fmtCompact(999_700, 'HUF')).toBe('1M')   // not "1000k"
    expect(fmtCompact(850, 'HUF')).toBe('850')
    expect(fmtCompact(0, 'HUF')).toBe('0')
  })

  it('uses U+2212 for negatives and an explicit plus only when asked', () => {
    expect(fmtCompact(-38_000, 'HUF')).toBe('−38k')
    expect(fmtCompact(38_000, 'HUF')).toBe('38k')
    expect(fmtCompact(38_000, 'HUF', { signed: true })).toBe('+38k')
    expect(fmtCompact(0, 'HUF', { signed: true })).toBe('0')
  })

  it('prefixes the symbol for non-HUF anchors', () => {
    expect(fmtCompact(1_240, 'USD')).toBe('$1k')
    expect(fmtCompact(-2_600_000, 'EUR')).toBe('−€2.6M')
    expect(fmtCompact(410, 'GBP')).toBe('£410')
  })
})
