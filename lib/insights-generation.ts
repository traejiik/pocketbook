import { prisma } from './prisma'
import { monthKeyOf } from './format'
import { collectInsightSnapshot } from './insights-data'
import { buildPromptFromSnapshot } from './insights-prompt'
import { streamGenerate, type OllamaOptions } from './ollama'

/**
 * Shared by both generation paths (the monthly cron and the on-demand SSE route)
 * so a note never depends on which one produced it.
 *
 * `temperature` was 0.4, which reliably picked the blandest available phrasing and
 * was a large part of why every month's note read the same. `numCtx` is not
 * optional polish: Ollama defaults most models to a 2048-token context and
 * truncates from the front, so without it the widened prompt would quietly lose
 * its opening — which is where the output rules live.
 */
export const INSIGHT_MODEL_OPTIONS: OllamaOptions = {
  temperature: 0.7,
  topP: 0.9,
  repeatPenalty: 1.15,
  numCtx: 8192,
  numPredict: 800,
}

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
    options: INSIGHT_MODEL_OPTIONS,
  })) {
    content += chunk.response
    if (chunk.done) break
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
