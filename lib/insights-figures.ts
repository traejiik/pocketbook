import { PRIOR_OPENINGS_HEADING } from './insights-prompt'

/**
 * Digit grouping as a model may write it: the ledger's own space, a comma, or the
 * no-break spaces a locale formatter would produce. A grouped run must be followed
 * by exactly three digits per group, so "2026 2 203 Ft" reads as "2 203 Ft".
 */
const GROUPED = String.raw`\d{1,3}(?:[   ,]\d{3})+|\d+`

/**
 * An amount with the symbol after it — "150 000 Ft", "89,897 Ft", "2203 Ft". The
 * lookbehind keeps a match from starting in the middle of a longer number or a
 * decimal; a leading minus sign is allowed and ignored.
 */
const SUFFIXED_AMOUNT = new RegExp(String.raw`(?<![\d.,])(${GROUPED})(\.\d+)?\s?Ft\b`, 'g')

/** An amount with the symbol before it, the way USD, EUR and GBP are formatted. */
const PREFIXED_AMOUNT = new RegExp(String.raw`[$€£]\s?(${GROUPED})(\.\d+)?`, 'g')

/** A percentage — "121%", "8.5 %". */
const PERCENTAGE = /(?<![\d.,])(\d+(?:\.\d+)?)\s?%/g

type Figure = { key: string; text: string }

/**
 * Every amount and percentage in a text, keyed by kind and absolute value so that
 * "2 203 Ft", "2203 Ft", "2,203 Ft" and "−2203 Ft" are the same figure. Whether a
 * figure is *formatted* correctly is `finaliseNote`'s other job; this one only asks
 * whether it exists.
 */
function figuresIn(text: string): Figure[] {
  const figures: Figure[] = []
  const amount = (whole: string, fraction = '') =>
    Math.abs(Number(whole.replace(/[   ,]/g, '') + fraction))

  for (const m of text.matchAll(SUFFIXED_AMOUNT)) {
    figures.push({ key: `amount:${amount(m[1], m[2])}`, text: m[0] })
  }
  for (const m of text.matchAll(PREFIXED_AMOUNT)) {
    figures.push({ key: `amount:${amount(m[1], m[2])}`, text: m[0] })
  }
  for (const m of text.matchAll(PERCENTAGE)) {
    figures.push({ key: `percent:${Number(m[1])}`, text: m[0] })
  }
  return figures
}

/**
 * The prompt without its block of recent note openings. Those are earlier notes,
 * not ledger data — and some of their figures were invented when they were
 * written, so accepting them here would launder one month's mistake into the next.
 * The block runs from its heading to the next blank line.
 */
function dataOf(prompt: string): string {
  const start = prompt.indexOf(PRIOR_OPENINGS_HEADING)
  if (start === -1) return prompt
  const end = prompt.indexOf('\n\n', start)
  return prompt.slice(0, start) + (end === -1 ? '' : prompt.slice(end))
}

/**
 * The amounts and percentages a note states that appear nowhere in the data it was
 * given, as written in the note and without repeats.
 *
 * Nearly every serious error in the notes read by hand was one of these — a total
 * nobody computed ("24 742 Ft remaining"), a share the prompt never gave ("1.7% of
 * your income"), a history that does not exist ("40 000 Ft in July"). The prompt
 * forbids all of them and a small model writes them anyway, so they have to be
 * caught after the fact. Only the user prompt counts as data: the system prompt's
 * worked examples ("150 000 Ft", "24%") are illustrations, and a note that quotes
 * them has invented a figure.
 *
 * Dates, day counts and transaction counts are deliberately not checked. They carry
 * no currency or percent sign, so telling "22 days" from "22 January" or "2026"
 * would mean guessing, and the errors that mattered were never among them.
 */
export function findInventedFigures(note: string, prompt: string): string[] {
  const known = new Set(figuresIn(dataOf(prompt)).map((f) => f.key))
  const invented = new Map<string, string>()
  for (const f of figuresIn(note)) {
    if (!known.has(f.key) && !invented.has(f.key)) invented.set(f.key, f.text.trim())
  }
  return [...invented.values()]
}
