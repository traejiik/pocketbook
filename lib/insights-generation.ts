import { prisma } from './prisma'
import { logger } from './logger'
import { fmtHUF, monthKeyOf } from './format'
import { collectInsightSnapshot } from './insights-data'
import { buildPromptFromSnapshot } from './insights-prompt'
import { streamGenerate, stripThinkTags, type OllamaOptions } from './ollama'

const log = logger('insights')

/**
 * Shared by both generation paths (the monthly cron and the on-demand SSE route)
 * so a note never depends on which one produced it.
 *
 * `temperature` was 0.4, which reliably picked the blandest available phrasing and
 * was a large part of why every month's note read the same.
 *
 * `numCtx` has to be set at all because Ollama defaults most models to a
 * 2048-token context and truncates from the front, which would quietly eat the
 * opening of the prompt — where the output rules live.
 *
 * 4096 is now measured rather than estimated (corrected 2026-09-02). A real
 * July generation on qwen3.5:4b reported `prompt_eval_count: 1697` for a
 * 5,735-character prompt (3,406 user + 2,329 system) and 381 output tokens —
 * 2,078 of the window, about half. The ratio is the part worth remembering:
 * **3.4 characters per token, not the 4 an English-prose estimate assumes**,
 * because Hungarian number formatting and the `−`/`·`/`Ft` characters tokenise
 * poorly. That is why the earlier `~1200 tokens` figure for this same prompt —
 * derived by dividing characters by four — was 40% low, and why 2048 would
 * silently truncate. A busier month runs higher, but the headroom is real: even
 * a 50% larger prompt plus a full-length note stays inside 4096. Going wider
 * costs real time on CPU inference for no benefit — prompt evaluation on that
 * hardware measured roughly 68 tokens/second.
 *
 * There is deliberately no `numPredict`. A 800-token cap here produced empty
 * notes on a thinking model: reasoning is billed against the same budget, so the
 * cap was exhausted before any prose was emitted (`done_reason: length`, zero
 * response tokens). Even with reasoning disabled a full note measured ~750
 * tokens (the July note came in at 381 tokens for 1,851 characters), so any cap
 * in that range risks truncating mid-sentence. The request timeout in
 * `streamGenerate` is the runaway backstop instead.
 *
 * Both repetition penalties are explicitly *off* (`repeatPenalty: 1`,
 * `presencePenalty: 0`), and that is the fix for amounts coming back as words.
 * A penalty on recently used tokens is the wrong tool for a note whose whole job
 * is to copy figures: Qwen tokenises digits one per character and every amount
 * ends in the same ` Ft` token, so after the first figure the digits, the
 * grouping space and the currency are all "already used" and get pushed down —
 * and the fluent alternatives the model reaches for are exactly the observed
 * defects: "forty thousand four hundred fifty-five Ft", "F"/"forint"/"K" in
 * place of "Ft", "seventy percent", and "289708 Ft" with its grouping dropped.
 * The `repeatPenalty: 1.15` that used to live here was set to fight sameness;
 * sameness is the prompt's job (prior openings, per-verdict directives), not the
 * sampler's. Both knobs must be *sent*: Ollama defaults `repeat_penalty` to 1.1
 * and the library Qwen Modelfiles ship `presence_penalty 1.5`, so leaving either
 * unset keeps a penalty on. Qwen's own guidance is `repetition_penalty 1.0`.
 */
export const INSIGHT_MODEL_OPTIONS: OllamaOptions = {
  temperature: 0.7,
  topP: 0.9,
  repeatPenalty: 1,
  presencePenalty: 0,
  numCtx: 4096,
}

/**
 * The full request shape for a note, kept in one object so the cron and SSE paths
 * cannot drift apart.
 *
 * `think: false` matters twice over. A monthly note is prose, not a puzzle, so
 * reasoning buys nothing — and on modest hardware it is actively unaffordable:
 * reasoning tokens count against the request timeout, and a capped run measured
 * 185–341s producing no output at all where the same prompt with thinking off
 * finished in 105s.
 */
export const INSIGHT_REQUEST = {
  think: false,
  options: INSIGHT_MODEL_OPTIONS,
} as const

/**
 * `monthCovered` is a `YYYY-MM` key. The financial data in the prompt comes from
 * that month, so a cron run on the 1st can summarise the month that just ended
 * instead of the (empty) month that just started. Defaults to the current month on
 * the viewer's calendar for on-demand generation from the insights stream —
 * `toISOString()` would report the UTC month, which is still the previous one
 * between local midnight and the UTC rollover (AGENTS.md §13).
 *
 * The anchor currency comes back alongside the prompt so the write path can
 * check the finished note against the figures it was given (`finaliseNote`).
 */
export async function buildInsightPrompt(
  monthCovered?: string,
): Promise<{ system: string; prompt: string; anchor: string }> {
  const monthKey = monthCovered ?? monthKeyOf(new Date())
  const snapshot = await collectInsightSnapshot(monthKey)
  return { ...buildPromptFromSnapshot(snapshot), anchor: snapshot.anchor }
}

/**
 * How each currency is written in the prompt, and what the model writes when it
 * stops copying and starts re-expressing. Anything from a currency other than the
 * anchor is a hallucination; the anchor's own *name* is a rename of its symbol.
 */
const CURRENCY_MARKERS: Record<string, { symbol: RegExp; name: RegExp }> = {
  HUF: { symbol: /\bFt\b/g, name: /\bforints?\b|\bHUF\b/gi },
  USD: { symbol: /\$/g, name: /\bdollars?\b|\bUSD\b/gi },
  EUR: { symbol: /€/g, name: /\beuros?\b|\bEUR\b/gi },
  GBP: { symbol: /£/g, name: /\bpounds?\b|\bsterling\b|\bGBP\b/gi },
}

/**
 * The vocabulary of a figure that was re-expressed rather than copied. Only the
 * scale words and "percent" are counted: "one", "two" and "ten" are ordinary
 * prose ("the one thing that moved"), and flagging them would drown the signal.
 */
const SPELLED_FIGURE = /\b(?:hundreds?|thousands?|millions?|billions?|per ?cent)\b/gi

/**
 * A bare or comma-grouped digit run sitting directly before the HUF symbol. The
 * negative lookbehinds stop it matching the tail of an already-grouped amount
 * ("289 708 Ft" must not be seen as "708 Ft") or the middle of a longer run.
 */
const UNGROUPED_HUF = /(?<!\d)(?<!\d )(\d{1,3}(?:,\d{3})+|\d{4,})(?= Ft\b)/g

export type NoteDefects = {
  /** Scale words or "percent" — "forty thousand", "seventy percent". */
  spelledNumbers: number
  /** A currency other than the anchor — "pounds" against a HUF ledger. */
  foreignCurrency: number
  /** The anchor written out by name instead of its symbol — "forint" for "Ft". */
  renamedCurrency: number
}

/**
 * Turn raw model output into the note that gets saved, and say how far it strayed
 * from the figures it was given.
 *
 * Two different problems share this function because they have the same cause —
 * the model re-expressing an amount instead of copying it — but only one of them
 * can be repaired without guessing. A digit run directly before the anchor symbol
 * can only be an amount, and its ledger form is fully determined by `fmtHUF`, so
 * "289708 Ft" and "289,708 Ft" are put back to "289 708 Ft" and counted in
 * `repaired`. Everything else — spelled-out numbers, a foreign currency, the
 * anchor renamed — is reported in `defects` for the caller to log, because a
 * rewrite there would be a second model's guess stacked on the first's.
 *
 * Only HUF is regrouped: the other anchors are formatted without grouping
 * (`fmtCur`), so there is nothing to restore.
 */
export function finaliseNote(
  raw: string,
  anchor: string,
): { content: string; repaired: number; defects: NoteDefects; defectCount: number } {
  let content = stripThinkTags(raw)
  let repaired = 0

  if (anchor === 'HUF') {
    content = content.replace(UNGROUPED_HUF, (run) => {
      const ledger = fmtHUF(Number(run.replace(/,/g, ''))).replace(/ Ft$/, '')
      if (ledger !== run) repaired++
      return ledger
    })
  }

  const count = (re: RegExp) => (content.match(re) ?? []).length
  const own = CURRENCY_MARKERS[anchor]
  const defects: NoteDefects = {
    spelledNumbers: count(SPELLED_FIGURE),
    foreignCurrency: Object.entries(CURRENCY_MARKERS)
      .filter(([code]) => code !== anchor)
      .reduce((n, [, m]) => n + count(m.symbol) + count(m.name), 0),
    renamedCurrency: own ? count(own.name) : 0,
  }
  const defectCount = defects.spelledNumbers + defects.foreignCurrency + defects.renamedCurrency

  return { content, repaired, defects, defectCount }
}

export async function generateAndSaveInsight(options: {
  monthCovered: string
  ollamaUrl: string
  ollamaModel: string
}): Promise<{ id: string }> {
  const timer = log.start('insight generation', {
    month: options.monthCovered,
    model: options.ollamaModel,
    source: 'scheduled',
  })
  const { system, prompt, anchor } = await buildInsightPrompt(options.monthCovered)
  log.debug('prompt built', {
    month: options.monthCovered,
    promptChars: prompt.length,
    systemChars: system.length,
  })
  let content = ''

  try {
    for await (const chunk of streamGenerate({
      baseUrl: options.ollamaUrl,
      model: options.ollamaModel,
      system,
      prompt,
      ...INSIGHT_REQUEST,
    })) {
      content += chunk.response
      if (chunk.done) break
    }
  } catch (error) {
    // The scheduler records the job failure, but the note it was generating (and
    // the model it was talking to) only exist here.
    timer.fail(error)
    throw error
  }

  const note = finaliseNote(content, anchor)

  // A run that produced no prose must not be persisted. The write path has no
  // other signal for failure, so an empty note used to save as a normal row:
  // the UI reads "a row exists" as "a note exists", suppresses its empty state,
  // and renders zero paragraphs — a card with a heading and nothing under it,
  // indistinguishable from a successful generation and blocking the month until
  // something replaces it.
  if (!note.content) {
    const error = new Error('Ollama returned no text — nothing was saved')
    timer.fail(error)
    throw error
  }

  const user = await prisma.user.findFirst()
  if (!user) {
    const error = new Error('No user found')
    timer.fail(error)
    throw error
  }

  const record = await prisma.aiInsight.create({
    data: {
      userId: user.id,
      monthCovered: options.monthCovered,
      modelUsed: options.ollamaModel,
      content: note.content,
    },
  })

  // One insight per month: the freshly generated note replaces any earlier
  // (e.g. mid-month) notes for the same month.
  const replaced = await prisma.aiInsight.deleteMany({
    where: { monthCovered: options.monthCovered, id: { not: record.id } },
  })

  // The prompt forbids every one of these; when they show up anyway the sampling
  // settings or the model have changed, and nobody watches the cron — so this is
  // the only place it can be said.
  if (note.defectCount > 0) {
    log.warn('note re-expressed its figures', { month: options.monthCovered, ...note.defects })
  }
  // At debug only: enough of the note to see *how* the model is behaving —
  // wrong currency, amounts spelled as words — without reading the database.
  log.debug('note preview', { month: options.monthCovered, preview: note.content.slice(0, 200) })
  timer.ok({
    id: record.id,
    chars: note.content.length,
    replaced: replaced.count,
    repaired: note.repaired,
  })
  return record
}
