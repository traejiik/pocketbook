import type { InsightSnapshot } from './insights-data'

/**
 * Deciding what a monthly note is about, in code, so the model only has to say it.
 *
 * Sixteen notes read by hand showed a 3B model reliably copies figures and reliably
 * fails to *choose* among them: it headlined the category with the biggest
 * percentage instead of the biggest amount, attached real figures to the wrong
 * rows, and invented causes and savings to satisfy the prompt's rules. Every
 * choice here is arithmetic on the snapshot — which category moved most, whether
 * one purchase explains it, what can be done about it — so the brief the model
 * receives is already the note's content, true by construction.
 *
 * What code cannot know is *why* anything moved, and the story never says. The one
 * explanation it offers — "most of it was one purchase" — is a comparison of two
 * figures, not a guess.
 */

/** A move smaller than this share of the month's expenses is not a headline. */
export const HEADLINE_FLOOR_SHARE = 0.05

/** A rise at least this much explained by one expense is called a single purchase. */
export const ONE_PURCHASE_SHARE = 0.5

/** A renewal this close in the headline's category is worth deciding about now. */
export const RENEWAL_WINDOW_DAYS = 14

export type CategoryMove = {
  name: string
  value: number
  /** Last month's total, or null when the category had no spending then. */
  prevValue: number | null
  /** `value − prevValue`, with a missing last month counted as zero. */
  change: number
  /** Expense rows in the category this month. */
  count: number | null
  /** The largest of them. */
  largest: { description: string; amount: number; date: string; recurring: boolean } | null
  /**
   * What the data says about a rise — never why it happened:
   * - `one-purchase`: the largest expense covers at least half the rise and no
   *   recurring rule generated it — a one-off.
   * - `recurring-charge`: the same, but a recurring rule generated it. A raised
   *   rent or a new subscription is a commitment, and "it won't recur" would be false.
   * - `many`: no single expense covers half of it.
   * - `null`: a fall, or no detail to tell.
   */
  explainedBy: 'one-purchase' | 'recurring-charge' | 'many' | null
}

export type StoryAction =
  /** A one-off does not recur; the advice is not to chase it. */
  | { kind: 'leave-alone'; description: string; amount: number }
  /** A renewal in the category that moved lands soon; it can still be changed. */
  | { kind: 'renewal'; name: string; amount: number; daysAway: number }
  /** Spread across many expenses, with nothing to cancel: the figure to watch. */
  | { kind: 'watch'; category: string; value: number; prevValue: number | null }
  /** Nothing moved enough to act on; the note names the largest category instead. */
  | { kind: 'no-change'; category: string; value: number }
  /**
   * A deficit or tight month: the advice is about the gap, never "leave it alone".
   * `gap` is the shortfall (deficit) or the margin left (tight), both from the
   * operating net the prompt already states. `category` is the lever: the headline
   * move, or the largest category when nothing moved. `purchase` / `renewal` name a
   * concrete handle inside it when the data has one.
   */
  | {
      kind: 'close-gap'
      verdict: 'deficit' | 'tight'
      gap: number
      category: string
      value: number
      prevValue: number | null
      purchase: { description: string; amount: number } | null
      renewal: { name: string; amount: number; daysAway: number } | null
    }

export type Story = {
  /** The one thing the note is about, or null when nothing cleared the floor. */
  headline: CategoryMove | null
  /** A second move worth one sentence, if one cleared the floor. */
  also: CategoryMove | null
  action: StoryAction
}

function moveOf(s: InsightSnapshot, c: InsightSnapshot['categories'][number]): CategoryMove {
  const detail = s.categoryDetail.find((d) => d.category === c.name)
  const change = c.value - (c.prevValue ?? 0)
  const largest = detail?.largest ?? null
  const explainedBy =
    change <= 0 || !largest
      ? null
      : largest.amount < change * ONE_PURCHASE_SHARE
        ? 'many'
        : largest.recurring
          ? 'recurring-charge'
          : 'one-purchase'
  return {
    name: c.name,
    value: c.value,
    prevValue: c.prevValue,
    change,
    count: detail?.count ?? null,
    largest,
    explainedBy,
  }
}

function renewalIn(s: InsightSnapshot, category: string) {
  // Only renewals in the category that moved. This is what keeps "pay your rent"
  // out of the note: rent can only come up when Housing itself is the story.
  const r = s.upcoming
    .filter((u) => u.category === category && u.amount !== null)
    .filter((u) => u.daysAway >= 0 && u.daysAway <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.daysAway - b.daysAway)[0]
  return r ? { name: r.name, amount: r.amount as number, daysAway: r.daysAway } : null
}

function actionFor(s: InsightSnapshot, headline: CategoryMove | null, gapAction: boolean): StoryAction {
  // A month that overspent, or nearly did, is advised about the gap. The earlier
  // rules below could tell a deficit month to "leave spending as it is" whenever
  // its biggest rise was a one-off — July 2026 ran 2203 Ft short and was told
  // exactly that.
  if (gapAction && (s.verdict === 'deficit' || s.verdict === 'tight')) {
    const lever = headline ?? moveOf(s, s.categories[0])
    return {
      kind: 'close-gap',
      verdict: s.verdict,
      gap: Math.abs(s.kpis.operatingNet),
      category: lever.name,
      value: lever.value,
      prevValue: lever.prevValue,
      purchase:
        headline?.explainedBy === 'one-purchase' && headline.largest
          ? { description: headline.largest.description, amount: headline.largest.amount }
          : null,
      renewal: renewalIn(s, lever.name),
    }
  }
  if (!headline) {
    const biggest = s.categories[0]
    return { kind: 'no-change', category: biggest.name, value: biggest.value }
  }
  if (headline.explainedBy === 'one-purchase' && headline.largest) {
    return {
      kind: 'leave-alone',
      description: headline.largest.description,
      amount: headline.largest.amount,
    }
  }
  const renewal = renewalIn(s, headline.name)
  if (renewal) return { kind: 'renewal', ...renewal }
  return { kind: 'watch', category: headline.name, value: headline.value, prevValue: headline.prevValue }
}

/**
 * Choose the note's content, or return null when there is no story to tell: a
 * sparse month (nothing has happened yet) or no previous month to compare with.
 *
 * Deficit, tight and strong months rank rises only — they are what consumed the
 * money, or what is still drifting. A steady month ranks by size either way, so a
 * category that fell sharply can be the thing that moved. Ranking is by amount,
 * never percentage: Fitness's 2385% was 28 380 Ft; Other Expense's 1416% was
 * 112 771 Ft.
 *
 * Only the categories the snapshot carries are ranked (the month's six largest),
 * so a category that fell to nothing is not considered.
 *
 * `gapAction: false` restores the pre-2.19.3 advice (no `close-gap`), for the
 * probe's lean-story control arm.
 */
export function pickStory(s: InsightSnapshot, opts: { gapAction?: boolean } = {}): Story | null {
  if (s.verdict === 'sparse' || s.prev === null || s.categories.length === 0) return null

  const floor = s.kpis.expense * HEADLINE_FLOOR_SHARE
  const risesOnly = s.verdict !== 'steady'
  const ranked = s.categories
    .map((c) => moveOf(s, c))
    .filter((m) => (risesOnly ? m.change > 0 : m.change !== 0))
    .filter((m) => Math.abs(m.change) >= floor)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

  const headline = ranked[0] ?? null
  return { headline, also: ranked[1] ?? null, action: actionFor(s, headline, opts.gapAction !== false) }
}
