import { fmtAnchor } from './format'
import type { InsightSnapshot, MonthVerdict } from './insights-data'

/**
 * Persona and the rules that do not change month to month. Sent as Ollama's
 * `system` field rather than pasted at the top of the prompt — the model's chat
 * template gives that slot more weight, which is what makes an 8B model actually
 * honour the bans below.
 *
 * The action's figure must be copied, not derived. The rule used to allow "what
 * changes if they act", a number the data never contains, so it asked for exactly
 * what the invention ban forbids — and none of the thirteen notes measured produced a
 * passing action. Those that tried priced a saving from nothing ("cancelling
 * would save 29 570 Ft", for a renewal that does not exist).
 */
export const INSIGHT_SYSTEM_PROMPT = `You are the analyst behind a personal finance ledger, writing the monthly note its owner reads. You have their real figures in front of you. Write like someone who has read them, not like someone filling in a template.

OUTPUT SHAPE
Plain prose paragraphs separated by a single blank line. Nothing else: no headings, no bullet points, no numbered lists, no markdown, no emoji, no exclamation marks. Address the owner as "you". Use past tense for the month under review.

NEVER OPEN WITH
"Here is", "Based on", "Overall", "Looking at", "This month saw", "In summary", or any restatement of what you were asked to do. Start with the finding itself.

BANNED PHRASES
"it's worth noting", "financial health", "keep up the good work", "stay on track", "moving forward", "at the end of the day", "as always", "a mixed picture".

AMOUNTS (THE STRICTEST RULE HERE)
Every amount is given to you already formatted. Copy it character for character.
Do not convert it to another currency. Do not rename the currency. Do not rescale it into thousands or millions. Do not round it. Do not spell any number out in words.
Write "150 000 Ft", never "one hundred fifty thousand forint", never "150 thousand", never "150,000 pounds".
Keep the space between digit groups: "289 708 Ft", never "289708 Ft" and never "289,708 Ft".
Percentages are digits too: write "70%" or "24%", never "seventy percent" or "twenty-four percent".
The only currency that exists in this note is the one in the figures below. If you catch yourself typing the name of any other currency, you have made an error.

EVERY PARAGRAPH EARNS ITS PLACE
Each one must carry at least one figure from the data, attached to something you name: a category, a recurring rule, or a specific transaction. A paragraph with no named specific is a paragraph to delete. Never invent a figure, a category, a merchant or a trend that is not in the data given to you — if the data does not support a claim, do not make it.

THE LAST PARAGRAPH IS AN ACTION
End with exactly one recommendation. It must name a real category, recurring rule or transaction from the data, carry a figure copied from the data above, and be something they could do in the next week or two. Quote what the thing costs now; do not work out a new figure for what they would save or spend instead. Generic advice is a failure: "consider budgeting", "track your spending", "review your subscriptions", "build an emergency fund" and anything of that kind are not acceptable endings. If the data supports no change worth making, say which specific thing you are recommending they leave alone, and why.`

/**
 * The month-specific directive. Chosen by `classifyMonth`, not by the model, so a
 * bad month cannot be written up as a reassuring one just because reassurance is
 * the likeliest next token.
 *
 * `steady` once asked for "the sharpest departure from the six-month pattern", but
 * the only six-month figures in the prompt are net totals. Applied to a category
 * that comparison has nothing behind it, and three measured notes invented a
 * category history to answer it ("relatively stable", "from 38 947 Ft in June to
 * 40 000 Ft in July"). It now says outright that category history is one month deep.
 */
const VERDICT_DIRECTIVES: Record<MonthVerdict, string> = {
  deficit: `This month spent more than it took in. That is the note.

Open with the shortfall and its size in the first sentence — not with context, not with anything that went well. Name the two categories most responsible and give their figures. Say whether the cause was one large purchase or a broad drift, and the data tells you which: check the largest single expenses against the category totals.

Do not soften this. Do not call the overspend slight, minor or modest. Do not open with reassurance and do not close the note on an upbeat note that the figures do not support. Do not mention savings or anything positive until the shortfall has been stated plainly. Write four or five paragraphs.`,

  tight: `The month stayed positive, but barely.

Say by how much in the first sentence, then identify what would have tipped it negative — the specific category or single expense that consumed the margin. Be concrete about how little room there was. Do not present this as comfortable. Write about four paragraphs.`,

  strong: `The month ran a real surplus and the savings rate was healthy.

State that plainly, once, in the first sentence, then move on — the rest of the note belongs to whatever is still drifting: a category that grew, a commitment that is climbing, a renewal that is about to land. Do not congratulate, do not dwell, do not repeat the good news in the closing paragraph.

If the net figure is negative, that is the savings transfer, not overspending. Say so explicitly and early so the number is not misread. Write three or four paragraphs.`,

  steady: `Nothing dramatic happened this month.

Do not manufacture drama and do not pad. Find the one thing that actually moved — usually the biggest category change against last month — and follow it properly instead of touring every category in turn. Category figures go back one month only: the six-month history is net totals, so compare a category with last month and say nothing about how it behaved before that. A short note about one real thing beats a long note about nothing. Write three or four paragraphs.`,

  sparse: `There is very little data for this month. It is probably early in the month rather than a month where nothing happened.

Say so plainly in the first sentence and keep the note short. Report only what is actually recorded.

Do not narrate the absence of data as if it were an event: there was no collapse, no pause, no silence, no abrupt end, and nothing "dropped to zero" — the month simply has not happened yet. Do not compare these empty figures against last month; a 100% fall from a month that has barely started is an artefact, not a finding. Do not extrapolate a trend, a rate or a habit, and do not call the month good or bad. If the spending data cannot support a recommendation, make the closing action about what is due next. Write two paragraphs.`,
}

/**
 * Prompt shapes the probe can toggle. `stateVerdict` is on by default because it
 * earned it; the other two are experiments, off unless a caller opts in.
 * `pnpm insights:probe` sets them from flags; nothing else passes this argument.
 *
 * Each one exists because every model tested on the August 2026 prompt — qwen3.5:4b,
 * granite4.2:3b and a third model under two runtimes — failed in the same two ways,
 * which points at the prompt rather than the model. See `other/docs/memory.md`.
 */
export type PromptVariants = {
  /**
   * Give each category delta its absolute size, not just a percentage. Ranking the
   * month's real movements currently requires subtracting six pairs of numbers, and
   * no model tested has found Other Expense's +112 771 Ft — they reach for the
   * largest *percentage* (Fitness, 2385%, worth only +28 380 Ft) or the most
   * familiar category instead.
   */
  absoluteDeltas?: boolean
  /**
   * Say which direction the operating net runs. On unless set to `false`. The old
   * line put the word "overspent" beside the figure without stating its sign, and
   * three of the seven runs that reached prose called August 2026's surplus an
   * overspend — two lifting 116 658 Ft verbatim as the shortfall. In the llama3.2 A/B
   * on 2026-09-18 two of three notes with the direction stated repeated it correctly;
   * none of three without it mentioned the direction at all. `false` restores the old
   * wording for control runs.
   */
  stateVerdict?: boolean
  /**
   * Include the do-not-repeat block. On by default, because varying the opening is
   * why it exists. Worth turning off to test the opposite risk: it is the only
   * fully-formed example sentence in the prompt, and one granite run reproduced
   * July's "overspent by X, a shortfall driven primarily by…" skeleton verbatim,
   * importing July's verdict along with its phrasing.
   */
  priorOpenings?: boolean
}

/** `up 34% from 120 000 Ft`, `down 8% from …`, `new this month`, or empty. */
function deltaOf(
  current: number,
  previous: number | null,
  anchor: string,
  absolute = false,
): string {
  if (previous === null) return ' (not present last month)'
  if (previous === 0) return ' (new this month)'
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100)
  if (pct === 0) return ` (flat vs ${fmtAnchor(previous, anchor)} last month)`
  const direction = pct > 0 ? 'up' : 'down'
  const size = absolute ? `${fmtAnchor(Math.abs(current - previous), anchor)}, ` : ''
  return ` (${direction} ${size}${Math.abs(pct)}% from ${fmtAnchor(previous, anchor)} last month)`
}

function section(title: string, lines: string[], empty: string): string {
  return `${title}\n${lines.length ? lines.join('\n') : `  ${empty}`}`
}

export function buildPromptFromSnapshot(
  s: InsightSnapshot,
  variants: PromptVariants = {},
): { system: string; prompt: string } {
  const money = (n: number) => fmtAnchor(n, s.anchor)
  const { kpis } = s
  const delta = (current: number, previous: number | null) =>
    deltaOf(current, previous, s.anchor, variants.absoluteDeltas)

  // State which side of zero the month fell on rather than leaving the sign for
  // the model to read off the figure. The old wording is kept for control runs.
  const operatingNetNote =
    variants.stateVerdict === false
      ? `this is the figure that says whether the month overspent`
      : kpis.operatingNet > 0
        ? `income exceeded expenses by this much, so the month did not overspend`
        : kpis.operatingNet < 0
          ? `expenses exceeded income by ${money(Math.abs(kpis.operatingNet))}, so the month overspent`
          : `income exactly covered expenses, so the month did not overspend`

  // With no savings the two net figures are identical, and spelling out the
  // savings caveat there just invites the model to explain a distinction the
  // month does not contain.
  const netLines =
    kpis.savings > 0
      ? [
          `  Income minus expenses: ${money(kpis.operatingNet)} — ${operatingNetNote}`,
          `  Net after savings: ${money(kpis.net)} — savings are subtracted here, so this can be negative in a month that spent well within its income`,
        ]
      : [
          `  Income minus expenses: ${money(kpis.operatingNet)} — ${operatingNetNote}`,
          `  Net after savings: ${money(kpis.net)} — the same figure, because nothing was put aside this month`,
        ]

  const headline = [
    `  Income: ${money(kpis.income)}${s.prev ? delta(kpis.income, s.prev.income) : ''}`,
    `  Expenses: ${money(kpis.expense)}${s.prev ? delta(kpis.expense, s.prev.expense) : ''}`,
    `  Savings put aside: ${money(kpis.savings)}${s.prev ? delta(kpis.savings, s.prev.savings) : ''}`,
    ...netLines,
    `  Savings rate: ${kpis.savingsRate}% of income`,
    `  Expense transactions recorded: ${s.expenseCount}`,
  ]

  const categories = s.categories.map(
    (c) => `  - ${c.name}: ${money(c.value)}${delta(c.value, c.prevValue)}`,
  )

  const trendNets = s.trend.map((t) => t.net)
  const average = trendNets.length
    ? Math.round(trendNets.reduce((a, b) => a + b, 0) / trendNets.length)
    : 0
  const negativeMonths = trendNets.filter((n) => n < 0).length
  const trendLines = [
    ...s.trend.map((t) => `  - ${t.month}: ${money(t.net)}`),
    `  Six-month average net: ${money(average)}; ${negativeMonths} of ${trendNets.length} months were negative.`,
  ]

  const largest = s.largest.map(
    (t) => `  - ${t.description} (${t.category}): ${money(t.amount)} on ${t.date.slice(0, 10)}`,
  )

  const committedShare =
    kpis.income > 0 ? Math.round((s.committed.monthlyExpenses / kpis.income) * 100) : null
  const committedLines = [
    `  - Fixed monthly commitments: ${money(s.committed.monthlyExpenses)}${
      committedShare !== null ? ` (${committedShare}% of this month's income)` : ''
    }`,
    `  - Actual expenses this month: ${money(kpis.expense)}, so ${money(
      Math.max(kpis.expense - s.committed.monthlyExpenses, 0),
    )} was discretionary or one-off spending`,
    ...(s.committed.hasNormalisedAnnuals
      ? ['  - Annual commitments are divided by twelve in the figure above.']
      : []),
  ]

  const upcoming = s.upcoming.map(
    (u) =>
      `  - ${u.name}: due in ${u.daysAway} day(s), ${
        u.amount === null ? 'amount unavailable (no exchange rate)' : money(u.amount)
      }`,
  )

  const installments = s.installments.map((i) => {
    const ends = i.endsOn ? `, ends ${i.endsOn.slice(0, 10)}` : ''
    const amount = i.monthlyAmount === null ? '' : `, ${money(i.monthlyAmount)} per cycle`
    return `  - ${i.name}: ${i.paid}/${i.total} paid${amount}${ends}`
  })

  const caveat =
    kpis.unconvertibleCount > 0
      ? `\nINCOMPLETE FIGURES\n  ${kpis.unconvertibleCount} transaction(s) had no exchange rate available and are missing from every total above. Say so once, briefly, and treat the totals as a floor rather than exact.\n`
      : ''

  const priorNotes = s.priorNotes.length && variants.priorOpenings !== false
    ? `\nYOU ALREADY WROTE THESE\nThese are the openings of your recent notes. Do not reuse their opening line, their framing, or their structure — find a different way in this month.\n${s.priorNotes
        .map((n) => `  ${n.monthName}: "${n.opening}"`)
        .join('\n')}\n`
    : ''

  const prompt = `Monthly note for ${s.monthName}. All amounts are in ${s.anchor} and are already formatted — reproduce them exactly as written.

THE MONTH IN FIGURES
${headline.join('\n')}

${section('SPENDING BY CATEGORY (largest first)', categories, '(no expenses recorded)')}

${section('NET BY MONTH (six months ending with this one)', trendLines, '(no history)')}

${section('LARGEST SINGLE EXPENSES', largest, '(none)')}

${section('COMMITTED VERSUS ACTUAL', committedLines, '(no recurring rules)')}

${section('DUE IN THE NEXT 30 DAYS', upcoming, '(nothing due)')}

${section('INSTALLMENT PLANS', installments, '(none)')}
${caveat}
HOW TO WRITE THIS MONTH'S NOTE
${VERDICT_DIRECTIVES[s.verdict]}
${priorNotes}
Write the note now. Plain paragraphs, no headings, and close with the one concrete action. Copy every amount exactly as written above — same digits, same currency, never spelled out in words.`

  return { system: INSIGHT_SYSTEM_PROMPT, prompt }
}
