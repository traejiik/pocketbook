import { describe, expect, it } from 'vitest'
import { finaliseNote } from '@/lib/insights-generation'

// A regenerated July note came back with "forty thousand four hundred fifty-five
// Ft", "eleven hundreds Ft", "fifteen zero K forint", "seventy percent", and every
// grouped amount collapsed to "289708 Ft". The prompt already forbade all of it.
// What the write path lacked was a deterministic repair for the lossless case
// (the grouping) and a signal in the logs for everything else.
describe('finaliseNote', () => {
  describe('amount grouping under a HUF anchor', () => {
    it('restores the thousands grouping the prompt used', () => {
      const { content, repaired } = finaliseNote(
        'July left you short by −2203 Ft because expenses rose to 289708 Ft.',
        'HUF',
      )
      expect(content).toBe(
        'July left you short by −2203 Ft because expenses rose to 289 708 Ft.',
      )
      // hu-HU leaves four-digit numbers ungrouped, so −2203 Ft was already right.
      expect(repaired).toBe(1)
    })

    it('leaves correctly grouped amounts untouched', () => {
      const { content, repaired } = finaliseNote('Rent stayed at 150 000 Ft.', 'HUF')
      expect(content).toBe('Rent stayed at 150 000 Ft.')
      expect(repaired).toBe(0)
    })

    it('replaces English comma grouping with the ledger form', () => {
      expect(finaliseNote('Groceries cost 38,947 Ft.', 'HUF').content).toBe(
        'Groceries cost 38 947 Ft.',
      )
    })

    it('does not touch years, dates or numbers that are not amounts', () => {
      const text = 'Paid on 10 July 2026, the 2026 total covered 1500 items.'
      expect(finaliseNote(text, 'HUF').content).toBe(text)
    })

    it('does nothing for anchors the ledger does not group', () => {
      expect(finaliseNote('Rent was $1234.56 again.', 'USD').content).toBe(
        'Rent was $1234.56 again.',
      )
    })
  })

  it('strips inline reasoning before anything else', () => {
    expect(finaliseNote('<think>hmm</think>\n\nGroceries rose 40%.', 'HUF').content).toBe(
      'Groceries rose 40%.',
    )
  })

  describe('defect report', () => {
    it('counts amounts and percentages spelled out in words', () => {
      const { defects, defectCount } = finaliseNote(
        'Phone Plan hit forty thousand four hundred fifty-five Ft, seventy percent of commitments.',
        'HUF',
      )
      expect(defects.spelledNumbers).toBe(3)
      expect(defectCount).toBe(3)
    })

    it('counts a currency that is not the anchor', () => {
      const { defects } = finaliseNote('you set aside half an extra thousand pounds', 'HUF')
      expect(defects.foreignCurrency).toBe(1)
      expect(defects.spelledNumbers).toBe(1)
    })

    it('counts the anchor written out by name instead of its symbol', () => {
      const { defects } = finaliseNote('a twenty-thousand forint tariff bill', 'HUF')
      expect(defects.renamedCurrency).toBe(1)
    })

    it('judges foreign and renamed against the anchor actually in use', () => {
      const { defects } = finaliseNote('Rent was $1200, about 430 000 Ft in dollars.', 'USD')
      expect(defects.foreignCurrency).toBe(1)
      expect(defects.renamedCurrency).toBe(1)
    })

    it('reports nothing for a note that copied its figures', () => {
      const { defects, defectCount } = finaliseNote(
        'Rent stayed at 150 000 Ft, 52% of income. Only one item is looming: the two subscriptions due in ten days.',
        'HUF',
      )
      expect(defects).toEqual({ spelledNumbers: 0, foreignCurrency: 0, renamedCurrency: 0 })
      expect(defectCount).toBe(0)
    })
  })
})
