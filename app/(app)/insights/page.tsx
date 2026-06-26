export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma';
import { InsightCardClient } from '@/components/insights/InsightCardClient';

export default async function AiInsightsPage() {
  const [settings, history] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.aiInsight.findMany({ orderBy: { generatedAt: 'desc' }, take: 60 }),
  ]);

  const ollamaUrl = settings?.ollamaUrl ?? 'http://ollama:11434';
  const ollamaModel = settings?.ollamaModel ?? 'llama3.1:8b';

  const currentMonth = new Date().toISOString().slice(0, 7);

  // Serialise dates for client
  const serialisedHistory = history.map((h: (typeof history)[number]) => ({
    ...h,
    generatedAt: h.generatedAt.toISOString(),
  }));

  return (
    <div className="px-4 lg:px-7 pb-9 pt-1 max-w-[860px] mx-auto">
      <InsightCardClient
        ollamaUrl={ollamaUrl}
        ollamaModel={ollamaModel}
        history={serialisedHistory}
        currentMonth={currentMonth}
      />
    </div>
  );
}
