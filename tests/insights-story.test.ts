import { describe, expect, it } from 'vitest'
import type { InsightSnapshot } from '@/lib/insights-data'
import { findInventedFigures } from '@/lib/insights-figures'
import { buildPromptFromSnapshot } from '@/lib/insights-prompt'
import { pickStory, RENEWAL_WINDOW_DAYS } from '@/lib/insights-story'
import { august } from './fixtures/insight-august-2026'

type Detail = InsightSnapshot['categoryDetail'][number]

/** August with some categories and their details replaced. */
function withCategories(
  categories: InsightSnapshot['categories'],
  over: Partial<InsightSnapshot> = {},
): InsightSnapshot {
  return { ...august, categories, ...over }
}

function detail(category: string, amount: number, over: Partial<Detail['largest']> = {}, count = 5): Detail {
  return {
    category,
    count,
    largest: { description: `${category} purchase`, amount, date: '2026-08-12T00:00:00.000Z', recurring: false, ...over },
  }
}

describe('pickStory', () => {
  describe('the August 2026 ledger', () => {
    const story = pickStory(august)!

    // No model reading the full prompt found this: they chased Fitness's 2385%.
    it('headlines the largest move by amount, not by percentage', () => {
      expect(story.headline?.name).toBe('Other Expense')
      expect(story.headline?.change).toBe(112_771)
    })

    it('sees that one purchase explains most of it', () => {
      expect(story.headline?.explainedBy).toBe('one-purchase')
      expect(story.headline?.largest?.description).toBe('AirPods Pro 3')
    })

    it('keeps the second largest move as the supporting line', () => {
      expect(story.also?.name).toBe('Food & Groceries')
      expect(story.also?.change).toBe(47_218)
    })

    it('recommends leaving the one-off alone, with its figure', () => {
      expect(story.action).toEqual({ kind: 'leave-alone', description: 'AirPods Pro 3', amount: 89_897 })
    })
  })

  describe('what explains a rise', () => {
    it('calls a recurring charge a commitment, not a one-off to leave alone', () => {
      const s = {
        ...august,
        categoryDetail: [detail('Other Expense', 89_897, { description: 'New lease', recurring: true })],
      }
      const story = pickStory(s)!
      expect(story.headline?.explainedBy).toBe('recurring-charge')
      expect(story.action.kind).not.toBe('leave-alone')
    })

    it('calls a rise with no dominant expense a spread', () => {
      const s = { ...august, categoryDetail: [detail('Other Expense', 20_000, {}, 11)] }
      expect(pickStory(s)!.headline?.explainedBy).toBe('many')
    })

    it('says nothing about a fall', () => {
      const s = withCategories([{ name: 'Housing', value: 50_000, prevValue: 150_000 }], {
        categoryDetail: [detail('Housing', 50_000)],
      })
      const story = pickStory(s)!
      expect(story.headline?.change).toBe(-100_000)
      expect(story.headline?.explainedBy).toBeNull()
    })
  })

  describe('the action', () => {
    // Food & Groceries becomes the headline once Other Expense is flat; its
    // largest expense (Spar, 22 201 Ft) is under half the 47 218 Ft rise.
    const foodMonth = (upcoming: InsightSnapshot['upcoming']) =>
      withCategories(
        august.categories.map((c) => (c.name === 'Other Expense' ? { ...c, prevValue: c.value } : c)),
        { upcoming },
      )

    it('watches a spread-out rise when nothing in it can be cancelled', () => {
      expect(pickStory(foodMonth([]))!.action).toEqual({
        kind: 'watch',
        category: 'Food & Groceries',
        value: 86_165,
        prevValue: 38_947,
      })
    })

    it('prefers a renewal in that category due soon', () => {
      const story = pickStory(
        foodMonth([{ name: 'Grocery box', category: 'Food & Groceries', daysAway: 6, amount: 12_990 }]),
      )!
      expect(story.action).toEqual({ kind: 'renewal', name: 'Grocery box', amount: 12_990, daysAway: 6 })
    })

    it('ignores renewals beyond the window, without an amount, or in other categories', () => {
      const story = pickStory(
        foodMonth([
          { name: 'Later box', category: 'Food & Groceries', daysAway: RENEWAL_WINDOW_DAYS + 1, amount: 9_000 },
          { name: 'No rate', category: 'Food & Groceries', daysAway: 3, amount: null },
          { name: 'Rent', category: 'Housing', daysAway: 2, amount: 150_000 },
        ]),
      )!
      expect(story.action.kind).toBe('watch')
    })

    // The loophole the fixed prompt opened: two of three notes recommended paying
    // the rent. Rent is only in scope when Housing is the story.
    it('never recommends a bill from a category that did not move', () => {
      const story = pickStory({
        ...august,
        upcoming: [{ name: 'Rent', category: 'Housing', daysAway: 2, amount: 150_000 }],
      })!
      expect(JSON.stringify(story.action)).not.toContain('Rent')
    })
  })

  describe('ranking', () => {
    const mixed = [
      { name: 'Travel', value: 20_000, prevValue: 120_000 },
      { name: 'Groceries', value: 90_000, prevValue: 50_000 },
    ]

    it('lets a steady month headline a fall', () => {
      const story = pickStory(withCategories(mixed, { verdict: 'steady' }))!
      expect(story.headline?.name).toBe('Travel')
    })

    it('counts only rises in a deficit month — they are what spent the money', () => {
      const story = pickStory(withCategories(mixed, { verdict: 'deficit' }))!
      expect(story.headline?.name).toBe('Groceries')
    })

    it('finds nothing to headline when no move clears the floor', () => {
      const flat = august.categories.map((c) => ({ ...c, prevValue: c.value - 1_000 }))
      const story = pickStory(withCategories(flat))!
      expect(story.headline).toBeNull()
      expect(story.action).toEqual({ kind: 'no-change', category: 'Housing', value: 150_000 })
    })
  })

  it('has no story for a sparse month or one with nothing to compare against', () => {
    expect(pickStory({ ...august, verdict: 'sparse' })).toBeNull()
    expect(pickStory({ ...august, prev: null })).toBeNull()
  })
})

describe('the story prompt', () => {
  const full = buildPromptFromSnapshot(august, { story: false }).prompt
  const brief = buildPromptFromSnapshot(august).prompt

  it('is on by default, and `false` restores the full prompt for control runs', () => {
    expect(brief).toContain('WHAT MOVED')
    expect(full).toContain('SPENDING BY CATEGORY')
    expect(full).not.toContain('WHAT MOVED')
  })

  it('replaces the data dump with what moved and the recommendation', () => {
    expect(brief).toContain('WHAT MOVED')
    expect(brief).toContain('WHAT TO RECOMMEND')
    expect(brief).toContain('Other Expense: 120 734 Ft, up 112 771 Ft (1416%) from 7963 Ft last month.')
    expect(brief).toContain('Most of that rise was one purchase: AirPods Pro 3, 89 897 Ft on 2026-08-22.')
    expect(brief).toContain('Recommend leaving the AirPods Pro 3 purchase (89 897 Ft) as it is')
    for (const gone of ['SPENDING BY CATEGORY', 'NET BY MONTH', 'DUE IN THE NEXT 30 DAYS', 'COMMITTED VERSUS ACTUAL']) {
      expect(brief).not.toContain(gone)
    }
  })

  it('keeps the month in figures and the stated direction', () => {
    expect(brief).toContain('THE MONTH IN FIGURES')
    expect(brief).toContain('income exceeded expenses by this much, so the month did not overspend')
  })

  // With all seven lines, two of three probe notes recited them and ran long.
  it('trims the figures to what a steady frame needs', () => {
    expect(brief).toContain('Income: 585 140 Ft')
    expect(brief).toContain('Expenses: 468 482 Ft')
    for (const gone of ['Savings rate', 'Expense transactions recorded', 'Net after savings', 'Savings put aside']) {
      expect(brief).not.toContain(gone)
    }
  })

  it('keeps the savings lines when the frame is a strong month', () => {
    const strong = buildPromptFromSnapshot({ ...august, verdict: 'strong' }, { story: true }).prompt
    expect(strong).toContain('Savings put aside: 50 000 Ft')
    expect(strong).toContain('Net after savings: 66 658 Ft')
    expect(strong).toContain('Savings rate: 9% of income')
    expect(strong).not.toContain('Expense transactions recorded')
  })

  // Two of three probe notes opened "The story of August 2026…" under headings
  // named THE STORY and THE ACTION.
  it('never names what it is writing as a story or an action', () => {
    expect(brief).not.toMatch(/\bstory\b/i)
    expect(brief).not.toMatch(/\baction\b/i)
    expect(brief).toContain('The capitalised headings are labels for you: do not repeat them or refer to them.')
  })

  it('forbids causes and derived figures', () => {
    expect(brief).toContain('offer no cause of your own')
    expect(brief).toContain('none worked out from them')
  })

  // The brief is also the figure check's data: a note can only quote what the
  // story put in front of it.
  it('narrows what the figure check accepts to what the story gives', () => {
    const faithful =
      'Other Expense rose 112 771 Ft to 120 734 Ft, and 89 897 Ft of it was the AirPods Pro 3. Food & Groceries was up 47 218 Ft.'
    expect(findInventedFigures(faithful, brief)).toEqual([])
    expect(findInventedFigures('Fitness reached 29 570 Ft.', brief)).toEqual(['29 570 Ft'])
  })

  it('opens a deficit story with the shortfall', () => {
    const deficit = buildPromptFromSnapshot(
      { ...august, verdict: 'deficit', kpis: { ...august.kpis, operatingNet: -40_000 } },
      { story: true },
    ).prompt
    expect(deficit).toContain('Open with the shortfall and its size')
    expect(deficit).toContain('expenses exceeded income by 40 000 Ft')
  })

  it('says plainly when nothing cleared the floor', () => {
    const flat = august.categories.map((c) => ({ ...c, prevValue: c.value - 1_000 }))
    const prompt = buildPromptFromSnapshot({ ...august, categories: flat }, { story: true }).prompt
    expect(prompt).toContain('No category changed by more than 23 424 Ft (5% of this month')
    expect(prompt).toContain('Nothing needs changing')
  })

  it('falls back to the full prompt for a sparse month', () => {
    const sparse = buildPromptFromSnapshot({ ...august, verdict: 'sparse' }, { story: true }).prompt
    expect(sparse).not.toContain('WHAT MOVED')
    expect(sparse).toContain('There is very little data for this month')
  })
})
