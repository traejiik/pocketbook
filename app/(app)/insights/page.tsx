export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma';
import { getLatestTransactionMonth } from '@/lib/aggregations';
import { monthKeyOf } from '@/lib/format';
import { InsightCardClient } from '@/components/insights/InsightCardClient';

export default async function AiInsightsPage() {
  const [settings, history, latestDataMonth] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.aiInsight.findMany({ orderBy: { generatedAt: 'desc' }, take: 60 }),
    getLatestTransactionMonth(),
  ]);

  const ollamaUrl = settings?.ollamaUrl ?? 'http://ollama:11434';
  const ollamaModel = settings?.ollamaModel ?? 'llama3.1:8b';

  // `toISOString()` reports the UTC month, which is still the previous one between
  // local midnight and the UTC rollover (AGENTS.md §13).
  const currentMonth = monthKeyOf(new Date());

  // The picker opens on the newest month that actually has transactions, not on
  // the calendar month. On the 1st those differ, and a summary of a month with no
  // data is filler — the model narrates the absence instead of reporting. The
  // calendar month stays in the picker, it is just not where you land.
  const defaultMonth = latestDataMonth ?? currentMonth;

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
        defaultMonth={defaultMonth}
      />
    </div>
  );
}
