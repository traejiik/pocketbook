import { prisma } from './prisma'
import { logger } from './logger'
import { monthKeyOf } from './format'
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
 * opening of the prompt — where the output rules live. 4096 is deliberate rather
 * than generous: the fullest prompt measures ~1200 tokens and ~2000 including a
 * full-length note, so this is roughly double the worst case. A larger window
 * costs real time on CPU inference for no benefit.
 *
 * There is deliberately no `numPredict`. A 800-token cap here produced empty
 * notes on a thinking model: reasoning is billed against the same budget, so the
 * cap was exhausted before any prose was emitted (`done_reason: length`, zero
 * response tokens). Even with reasoning disabled a full note measured ~750
 * tokens, so any cap in that range risks truncating mid-sentence. The request
 * timeout in `streamGenerate` is the runaway backstop instead.
 */
export const INSIGHT_MODEL_OPTIONS: OllamaOptions = {
  temperature: 0.7,
  topP: 0.9,
  repeatPenalty: 1.15,
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
 */
export async function buildInsightPrompt(
  monthCovered?: string,
): Promise<{ system: string; prompt: string }> {
  const monthKey = monthCovered ?? monthKeyOf(new Date())
  return buildPromptFromSnapshot(await collectInsightSnapshot(monthKey))
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
  const { system, prompt } = await buildInsightPrompt(options.monthCovered)
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

  content = stripThinkTags(content)

  // A run that produced no prose must not be persisted. The write path has no
  // other signal for failure, so an empty note used to save as a normal row:
  // the UI reads "a row exists" as "a note exists", suppresses its empty state,
  // and renders zero paragraphs — a card with a heading and nothing under it,
  // indistinguishable from a successful generation and blocking the month until
  // something replaces it.
  if (!content) {
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
      content,
    },
  })

  // One insight per month: the freshly generated note replaces any earlier
  // (e.g. mid-month) notes for the same month.
  const replaced = await prisma.aiInsight.deleteMany({
    where: { monthCovered: options.monthCovered, id: { not: record.id } },
  })

  // At debug only: enough of the note to see *how* the model is behaving —
  // wrong currency, amounts spelled as words — without reading the database.
  log.debug('note preview', { month: options.monthCovered, preview: content.slice(0, 200) })
  timer.ok({ id: record.id, chars: content.length, replaced: replaced.count })
  return record
}
