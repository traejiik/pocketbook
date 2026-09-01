import { auth } from '@/lib/auth';
import { buildInsightPrompt, finaliseNote, INSIGHT_REQUEST } from '@/lib/insights-generation';
import { monthKeyOf } from '@/lib/format';
import { logger } from '@/lib/logger';
import { streamGenerate } from '@/lib/ollama';
import { prisma } from '@/lib/prisma';

const log = logger('insights');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    log.warn('insight stream refused', { reason: 'unauthorised' });
    return new Response('Unauthorised', { status: 401 });
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    log.error('insight stream refused', { reason: 'settings row missing' });
    return new Response('Settings not found', { status: 500 });
  }

  // Optional ?month=YYYY-MM to generate for a specific month (the insights
  // month picker). Falls back to the current month for on-demand generation.
  const requested = new URL(req.url).searchParams.get('month');
  const monthCovered = /^\d{4}-\d{2}$/.test(requested ?? '')
    ? (requested as string)
    // `toISOString()` reports the UTC month, which is still the previous one
    // between local midnight and the UTC rollover (AGENTS.md §13).
    : monthKeyOf(new Date());

  const { system, prompt, anchor } = await buildInsightPrompt(monthCovered);
  const timer = log.start('insight generation', {
    month: monthCovered,
    model: settings.ollamaModel,
    source: 'on-demand',
    promptChars: prompt.length,
    systemChars: system.length,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let full = '';
      let tokenCount = 0;
      const startTime = Date.now();

      try {
        for await (const chunk of streamGenerate({
          baseUrl: settings.ollamaUrl,
          model: settings.ollamaModel,
          system,
          prompt,
          ...INSIGHT_REQUEST,
        })) {
          full += chunk.response;
          tokenCount++;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ delta: chunk.response, done: chunk.done })}\n\n`),
          );
          if (chunk.done) break;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const note = finaliseNote(full, anchor);
        const content = note.content;

        // A run that produced no prose must not be persisted. Saving it created a
        // row the UI reads as a real note — heading, timestamp, and nothing under
        // it — which also suppressed the "nothing generated yet" state for that
        // month until something replaced it. Fail visibly instead.
        if (!content) {
          timer.fail(new Error('model returned no text'), { chars: full.length, chunks: tokenCount });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error:
                  'The model returned no text. If it is a thinking model, its reasoning may have consumed the whole response budget.',
              })}\n\n`,
            ),
          );
          return;
        }

        const user = await prisma.user.findFirst();
        let savedId: string | undefined;
        if (user) {
          const record = await prisma.aiInsight.create({
            data: {
              userId: user.id,
              monthCovered,
              modelUsed: settings.ollamaModel,
              content,
            },
          });
          savedId = record.id;
          // One insight per month: replace any earlier note for this month.
          await prisma.aiInsight.deleteMany({
            where: { monthCovered, id: { not: record.id } },
          });
        }

        // The prompt forbids every one of these; when they show up anyway the
        // sampling settings or the model have changed, and that should be
        // visible in the log before anyone reads the note.
        if (note.defectCount > 0) {
          log.warn('note re-expressed its figures', { month: monthCovered, ...note.defects });
        }
        // At debug only: enough of the note to see *how* the model is behaving —
        // wrong currency, amounts spelled as words — without reading the database.
        log.debug('note preview', { month: monthCovered, preview: content.slice(0, 200) });
        timer.ok({
          id: savedId,
          chars: content.length,
          chunks: tokenCount,
          repaired: note.repaired,
          elapsedSec: elapsed,
        });

        // `content` is what was saved. It differs from the streamed deltas when
        // grouping was repaired, so the client swaps it in for its live copy.
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, saved: true, id: savedId, content, tokens: tokenCount, elapsed })}\n\n`,
          ),
        );
      } catch (err) {
        timer.fail(err, { chars: full.length, chunks: tokenCount });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
