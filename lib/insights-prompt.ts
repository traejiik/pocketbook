import { fmtAnchor } from './format'
import type { InsightSnapshot, MonthVerdict } from './insights-data'

/**
 * Persona and the rules that do not change month to month. Sent as Ollama's
 * `system` field rather than pasted at the top of the prompt — the model's chat
 * template gives that slot more weight, which is what makes an 8B model actually
 * honour the bans below.
 */
export const INSIGHT_SYSTEM_PROMPT = `You are the analyst behind a personal finance ledger, writing the monthly note its owner reads. You have their real figures in front of you. Write like someone who has read them, not like someone filling in a template.

OUTPUT SHAPE
Plain prose paragraphs separated by a single blank line. Nothing else: no headings, no bullet points, no numbered lists, no markdown, no emoji, no exclamation marks. Address the owner as "you". Use past tense for the month under review.

NEVER OPEN WITH
"Here is", "Based on", "Overall", "Looking at", "This month saw", "In summary", or any restatement of what you were asked to do. Start with the finding itself.

BANNED PHRASES
"it's worth noting", "financial health", "keep up the good work", "stay on track", "moving forward", "at the end of the day", "as always", "a mixed picture".

EVERY PARAGRAPH EARNS ITS PLACE
Each one must carry at least one figure from the data, attached to something you name: a category, a recurring rule, or a specific transaction. A paragraph with no named specific is a paragraph to delete. Never invent a figure, a category, a merchant or a trend that is not in the data given to you — if the data does not support a claim, do not make it. Reproduce amounts exactly as they are formatted for you, including the currency symbol.

THE LAST PARAGRAPH IS AN ACTION
End with exactly one recommendation. It must name a real category, recurring rule or transaction from the data, carry a figure (what it costs now, or what changes if they act), and be something they could do in the next week or two. Generic advice is a failure: "consider budgeting", "track your spending", "review your subscriptions", "build an emergency fund" and anything of that kind are not acceptable endings. If the data supports no change worth making, say which specific thing you are recommending they leave alone, and why.`

/**
 * The month-specific directive. Chosen by `classifyMonth`, not by the model, so a
 * bad month cannot be written up as a reassuring one just because reassurance is
 * the likeliest next token.
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

Do not manufacture drama and do not pad. Find the one thing that actually moved — the biggest category change against last month, or the sharpest departure from the six-month pattern — and follow it properly instead of touring every category in turn. A short note about one real thing beats a long note about nothing. Write three or four paragraphs.`,

  sparse: `There is very little data for this month.

Say that plainly in the first sentence and keep the note short. Do not extrapolate a trend, a rate or a habit from this few transactions, and do not describe the month as good or bad. Report only what is actually recorded, and let the closing recommendation be about the ledger itself if the spending data cannot support one. Write two paragraphs.`,
}

/** `up 34% from 120 000 Ft`, `down 8% from …`, `new this month`, or empty. */
function deltaOf(current: number, previous: number | null, anchor: string): string {
  if (previous === null) return ' (not present last month)'
  if (previous === 0) return ' (new this month)'
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100)
  if (pct === 0) return ` (flat vs ${fmtAnchor(previous, anchor)} last month)`
  const direction = pct > 0 ? 'up' : 'down'
  return ` (${direction} ${Math.abs(pct)}% from ${fmtAnchor(previous, anchor)} last month)`
}

function section(title: string, lines: string[], empty: string): string {
  return `${title}\n${lines.length ? lines.join('\n') : `  ${empty}`}`
}

export function buildPromptFromSnapshot(s: InsightSnapshot): { system: string; prompt: string } {
  const money = (n: number) => fmtAnchor(n, s.anchor)
  const { kpis } = s

  // With no savings the two net figures are identical, and spelling out the
  // savings caveat there just invites the model to explain a distinction the
  // month does not contain.
  const netLines =
    kpis.savings > 0
      ? [
          `  Income minus expenses: ${money(kpis.operatingNet)} — this is the figure that says whether the month overspent`,
          `  Net after savings: ${money(kpis.net)} — savings are subtracted here, so this can be negative in a month that spent well within its income`,
        ]
      : [
          `  Income minus expenses: ${money(kpis.operatingNet)} — this is the figure that says whether the month overspent`,
          `  Net after savings: ${money(kpis.net)} — the same figure, because nothing was put aside this month`,
        ]

  const headline = [
    `  Income: ${money(kpis.income)}${s.prev ? deltaOf(kpis.income, s.prev.income, s.anchor) : ''}`,
    `  Expenses: ${money(kpis.expense)}${s.prev ? deltaOf(kpis.expense, s.prev.expense, s.anchor) : ''}`,
    `  Savings put aside: ${money(kpis.savings)}${s.prev ? deltaOf(kpis.savings, s.prev.savings, s.anchor) : ''}`,
    ...netLines,
    `  Savings rate: ${kpis.savingsRate}% of income`,
    `  Expense transactions recorded: ${s.expenseCount}`,
  ]

  const categories = s.categories.map(
    (c) => `  - ${c.name}: ${money(c.value)}${deltaOf(c.value, c.prevValue, s.anchor)}`,
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

  const priorNotes = s.priorNotes.length
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
Write the note now. Plain paragraphs, no headings, and close with the one concrete action.`

  return { system: INSIGHT_SYSTEM_PROMPT, prompt }
}
