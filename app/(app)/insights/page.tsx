export const dynamic = 'force-dynamic'

import { Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { InsightCardClient } from '@/components/insights/InsightCardClient';

export default async function AiInsightsPage() {
  const [settings, history] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.aiInsight.findMany({ orderBy: { generatedAt: 'desc' }, take: 12 }),
  ]);

  const ollamaUrl = settings?.ollamaUrl ?? 'http://ollama:11434';
  const ollamaModel = settings?.ollamaModel ?? 'llama3.1:8b';
  const autoInsights = settings?.autoInsightsMonthly ?? false;

  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Serialise dates for client
  const serialisedHistory = history.map((h: (typeof history)[number]) => ({
    ...h,
    generatedAt: h.generatedAt.toISOString(),
  }));

  return (
    <div className="px-4 lg:px-7 pb-9 pt-1 max-w-[860px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-[12.5px] text-muted-foreground">
          Conversational commentary on {monthLabel} · generated locally
        </div>
        <Button variant="outline" size="sm">
          <Calendar className="w-3.5 h-3.5 mr-1.5" />
          {monthLabel}
        </Button>
      </div>

      <InsightCardClient
        ollamaUrl={ollamaUrl}
        ollamaModel={ollamaModel}
        history={serialisedHistory}
      />
    </div>
  );
}
