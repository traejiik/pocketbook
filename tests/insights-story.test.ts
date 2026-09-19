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

  it('says plainly when nothing cleared the floor, naming the small moves instead of the floor', () => {
    const flat = august.categories.map((c) => ({ ...c, prevValue: c.value - 1_000 }))
    const prompt = buildPromptFromSnapshot({ ...august, categories: flat }, { story: true }).prompt
    expect(prompt).toContain('Nothing moved much: no category changed enough to single out.')
    expect(prompt).toContain('up 1000 Ft')
    // July 2026's model read the floor figure as "Housing increased by 14 485 Ft".
    expect(prompt).not.toContain('23 424 Ft')
    expect(prompt).toContain('Nothing needs changing')
    // The lean control keeps the v2.19.2 wording.
    const lean = buildPromptFromSnapshot({ ...august, categories: flat }, { leanStory: true }).prompt
    expect(lean).toContain('No category changed by more than 23 424 Ft (5% of this month')
  })

  it('falls back to the full prompt for a sparse month', () => {
    const sparse = buildPromptFromSnapshot({ ...august, verdict: 'sparse' }, { story: true }).prompt
    expect(sparse).not.toContain('WHAT MOVED')
    expect(sparse).toContain('There is very little data for this month')
  })
})

describe('month carry-over in the prompt', () => {
  const withBalance: InsightSnapshot = { ...august, balance: { carriedIn: 330_000, closing: 710_000 } }

  it('adds one running-balance line to both prompt shapes, framed as brought forward', () => {
    for (const variants of [{}, { story: false }]) {
      const { prompt } = buildPromptFromSnapshot(withBalance, variants)
      const line = prompt.split('\n').filter((l) => l.includes('Running balance'))
      expect(line).toHaveLength(1)
      expect(line[0]).toContain('330 000')
      expect(line[0]).toContain('710 000')
      expect(line[0]).toContain("not this month's income")
    }
  })

  it('lets a note quote the balance without tripping the figure checker', () => {
    const { prompt } = buildPromptFromSnapshot(withBalance)
    expect(findInventedFigures('You closed the month at 710 000 Ft.', prompt)).toEqual([])
  })

  it('leaves the prompt untouched when the balance is unavailable', () => {
    expect(buildPromptFromSnapshot({ ...august, balance: null }).prompt).toBe(
      buildPromptFromSnapshot(august).prompt,
    )
  })
})

describe('advice in a month that overspent or nearly did', () => {
  // July 2026 ran 2203 Ft short, its biggest rise was one purchase, and the note
  // told the owner to "leave spending as it is".
  const deficit: InsightSnapshot = {
    ...august,
    verdict: 'deficit',
    kpis: { ...august.kpis, income: 287_505, expense: 289_708, savings: 0, net: -2_203, operatingNet: -2_203, savingsRate: 0 },
  }

  it('closes the gap instead of leaving a one-off alone', () => {
    const { action } = pickStory(deficit)!
    expect(action).toMatchObject({
      kind: 'close-gap',
      verdict: 'deficit',
      gap: 2_203,
      category: 'Other Expense',
      purchase: { description: 'AirPods Pro 3', amount: 89_897 },
    })
    const prompt = buildPromptFromSnapshot(deficit).prompt
    expect(prompt).toContain('Expenses ran 2203 Ft over income')
    expect(prompt).not.toContain('leaving the AirPods Pro 3 purchase')
    expect(prompt).not.toContain('leaving spending as it is')
  })

  it('names a renewal due in the category that moved as the lever', () => {
    const s = { ...deficit, upcoming: [{ name: 'Gadget plan', category: 'Other Expense', daysAway: 4, amount: 3_990 }] }
    expect(pickStory(s)!.action).toMatchObject({ kind: 'close-gap', renewal: { name: 'Gadget plan', amount: 3_990, daysAway: 4 } })
  })

  describe('when nothing moved enough to headline', () => {
    // July 2026 on the live ledger: every change under the floor, rent flat. The
    // first v2.20.0 brief told it to "bring Housing back toward last month's
    // 150 000 Ft; it was 150 000 Ft this month".
    const byName = (rises: Record<string, number>) =>
      deficit.categories.map((c) => ({ ...c, prevValue: c.value - (rises[c.name] ?? 0) }))

    it('closes the gap in the day-to-day category that rose most, never a fixed cost', () => {
      const s = { ...deficit, categories: byName({ Housing: 9_000, 'Food & Groceries': 6_000, Fitness: -3_000 }) }
      const { headline, action } = pickStory(s)!
      expect(headline).toBeNull()
      expect(action).toMatchObject({ kind: 'close-gap', category: 'Food & Groceries', rose: true })
      const prompt = buildPromptFromSnapshot(s).prompt
      expect(prompt).toContain("Recommend bringing Food & Groceries back toward last month's")
      expect(prompt).not.toContain('bringing Housing')
    })

    it('trims the largest day-to-day category when none rose', () => {
      const s = { ...deficit, categories: byName({}) }
      const { action } = pickStory(s)!
      expect(action).toMatchObject({ kind: 'close-gap', category: 'Other Expense', rose: false })
      const prompt = buildPromptFromSnapshot(s).prompt
      expect(prompt).toContain('Recommend trimming Other Expense, the largest day-to-day category at 120 734 Ft this month, by 2203 Ft next month.')
      expect(prompt).not.toContain('back toward')
      expect(prompt).toContain('Nothing moved: every category was the same as last month.')
    })

    it('advises on day-to-day spending as a whole when every category is a fixed cost', () => {
      const s = {
        ...deficit,
        categories: byName({}),
        categoryDetail: deficit.categoryDetail.map((d) => ({ ...d, largest: { ...d.largest, recurring: true } })),
      }
      expect(pickStory(s)!.action).toMatchObject({ kind: 'close-gap', category: null })
      expect(buildPromptFromSnapshot(s).prompt).toContain('Recommend trimming 2203 Ft from day-to-day spending next month, not from fixed costs.')
    })
  })

  it('advises on the margin in a tight month', () => {
    const tight = { ...august, verdict: 'tight' as const, kpis: { ...august.kpis, operatingNet: 30_000 } }
    expect(pickStory(tight)!.action).toMatchObject({ kind: 'close-gap', verdict: 'tight', gap: 30_000 })
    expect(buildPromptFromSnapshot(tight).prompt).toContain('The month kept only 30 000 Ft of its income')
  })

  it('leaves surplus months on the earlier rules', () => {
    expect(pickStory(august)!.action.kind).toBe('leave-alone')
  })

  it('restores the earlier advice for the lean control arm', () => {
    expect(pickStory(deficit, { gapAction: false })!.action.kind).toBe('leave-alone')
  })
})

describe('the context block', () => {
  const brief = buildPromptFromSnapshot(august).prompt

  it('adds up to three background lines between what moved and the recommendation', () => {
    const block = brief.slice(brief.indexOf('FOR CONTEXT'), brief.indexOf('WHAT TO RECOMMEND'))
    expect(brief.indexOf('WHAT MOVED')).toBeLessThan(brief.indexOf('FOR CONTEXT'))
    expect(block).toContain('Put aside for savings: 50 000 Ft (9% of income).')
    expect(block).toContain('Six-month average net after savings: 22 207 Ft; this month, after savings: 66 658 Ft.')
    expect(block).toContain('Fixed monthly commitments: 200 871 Ft')
    expect(block.trim().split('\n').length - 1).toBeLessThanOrEqual(3)
  })

  it('never offers the month\'s largest expense, which is usually rent', () => {
    expect(brief).not.toContain('Largest single expense')
  })

  it('keeps the note short and the context out of the advice', () => {
    expect(brief).toContain('Write three short paragraphs.')
    expect(brief).toContain('do not present them as the cause of what moved or recommend anything from them')
  })

  it('lets a note quote the context figures without tripping the figure checker', () => {
    const note = 'You put aside 50 000 Ft, against a six-month average of 22 207 Ft after savings.'
    expect(findInventedFigures(note, brief)).toEqual([])
  })

  it('is absent from the lean control arm', () => {
    const lean = buildPromptFromSnapshot(august, { leanStory: true }).prompt
    expect(lean).not.toContain('FOR CONTEXT')
    expect(lean).toContain('Write two or three paragraphs.')
  })
})
