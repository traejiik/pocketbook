import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(path, 'utf8')
const resolver = source('components/import/CategoryResolver.tsx')
const txReview = source('components/import/TransactionImportReview.tsx')
const ruleReview = source('components/import/RecurringImportReview.tsx')

// The review's rows must stay uniform: a file repeats the same unknown category
// on every row that uses it, and per-row sentences plus per-row buttons made
// every row a different height with nothing to scan. Decisions live above the
// list, one per category, and the list itself is a fixed grid.
describe('import review layout', () => {
  /** The "New" list only — duplicates and errors are prose by design. */
  function newList(review: string): string {
    const start = review.indexOf('label="New"')
    const end = review.indexOf('label="Duplicates', start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    return review.slice(start, end)
  }

  it.each([
    ['transactions', txReview],
    ['recurring rules', ruleReview],
  ])('%s: rows carry no prose or buttons that could change their height', (_name, review) => {
    expect(review).toContain('<CategoryResolver')
    const rows = newList(review)
    expect(rows).not.toContain('text-warning">{')
    expect(rows).not.toMatch(/messages/)
    expect(rows).not.toMatch(/<Button/)
    expect(rows).toContain("'Needs a category'")
  })

  it('both reviews use the same row grid', () => {
    const grid = /md:grid-cols-\[20px_(?:72px_)?minmax\(0,1fr\)_190px_112px\]/
    expect(txReview).toMatch(grid)
    expect(ruleReview).toMatch(grid)
  })

  it('resolves one decision per category, applied to every row that used it', () => {
    expect(resolver).toContain('Each choice applies to every {noun} in the file that used that name.')
    expect(txReview).toContain('for (const line of lines) next[line] = { include: true, categoryId }')
    expect(ruleReview).toContain('for (const line of lines) next[line] = { include: true, categoryId }')
  })

  it('keeps the pickers aligned whether or not a gap can be created', () => {
    expect(resolver).toContain('grid-cols-[minmax(0,1fr)_88px] sm:grid-cols-[190px_88px]')
    expect(resolver).toContain('<span aria-hidden />')
  })

  it('summarises unknown recurring rules once instead of per row', () => {
    expect(txReview).toContain('Those transactions import without a link.')
    expect(txReview).toContain('<ImportNotices')
  })
})
