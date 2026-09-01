import { prisma } from './prisma'
import { monthKeyOf } from './format'
import { collectInsightSnapshot } from './insights-data'
import { buildPromptFromSnapshot } from './insights-prompt'
import { streamGenerate, stripThinkTags, type OllamaOptions } from './ollama'

/**
 * Shared by both generation paths (the monthly cron and the on-demand SSE route)
 * so a note never depends on which one produced it.
 *
 * `temperature` was 0.4, which reliably picked the blandest available phrasing and
 * was a large part of why every month's note read the same. `numCtx` is not
 * optional polish: Ollama defaults most models to a 2048-token context and
 * truncates from the front, so without it the widened prompt would quietly lose
 * its opening — which is where the output rules live.
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
  numCtx: 8192,
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
  const { system, prompt } = await buildInsightPrompt(options.monthCovered)
  let content = ''

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

  content = stripThinkTags(content)

  // A run that produced no prose must not be persisted. The write path has no
  // other signal for failure, so an empty note used to save as a normal row:
  // the UI reads "a row exists" as "a note exists", suppresses its empty state,
  // and renders zero paragraphs — a card with a heading and nothing under it,
  // indistinguishable from a successful generation and blocking the month until
  // something replaces it.
  if (!content) {
    throw new Error('Ollama returned no text — nothing was saved')
  }

  const user = await prisma.user.findFirst()
  if (!user) throw new Error('No user found')

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
  await prisma.aiInsight.deleteMany({
    where: { monthCovered: options.monthCovered, id: { not: record.id } },
  })

  return record
}
