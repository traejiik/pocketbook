import { auth } from '@/lib/auth';
import { buildInsightPrompt } from '@/lib/insights-generation';
import { streamGenerate } from '@/lib/ollama';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorised', { status: 401 });

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  if (!settings) return new Response('Settings not found', { status: 500 });

  // Optional ?month=YYYY-MM to generate for a specific month (the insights
  // month picker). Falls back to the current month for on-demand generation.
  const requested = new URL(req.url).searchParams.get('month');
  const monthCovered = /^\d{4}-\d{2}$/.test(requested ?? '')
    ? (requested as string)
    : new Date().toISOString().slice(0, 7);

  const prompt = await buildInsightPrompt(monthCovered);

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
          prompt,
        })) {
          full += chunk.response;
          tokenCount++;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ delta: chunk.response, done: chunk.done })}\n\n`),
          );
          if (chunk.done) break;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const user = await prisma.user.findFirst();
        let savedId: string | undefined;
        if (user) {
          const record = await prisma.aiInsight.create({
            data: {
              userId: user.id,
              monthCovered,
              modelUsed: settings.ollamaModel,
              content: full,
            },
          });
          savedId = record.id;
          // One insight per month: replace any earlier note for this month.
          await prisma.aiInsight.deleteMany({
            where: { monthCovered, id: { not: record.id } },
          });
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, saved: true, id: savedId, tokens: tokenCount, elapsed })}\n\n`,
          ),
        );
      } catch (err) {
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
