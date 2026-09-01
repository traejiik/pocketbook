export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma';
import { monthKeyOf } from '@/lib/format';
import { InsightCardClient } from '@/components/insights/InsightCardClient';

export default async function AiInsightsPage() {
  const [settings, history] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.aiInsight.findMany({ orderBy: { generatedAt: 'desc' }, take: 60 }),
  ]);

  const ollamaUrl = settings?.ollamaUrl ?? 'http://ollama:11434';
  const ollamaModel = settings?.ollamaModel ?? 'llama3.1:8b';

  // The month the picker opens on, and the one it asks the stream route to
  // generate. `toISOString()` reports the UTC month, which is still the previous
  // one between local midnight and the UTC rollover (AGENTS.md §13).
  const currentMonth = monthKeyOf(new Date());

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
