import dynamic from 'next/dynamic';
import { Sparkles, Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';

const InsightCard = dynamic(
  () => import('@/components/insights/InsightCard').then(m => m.InsightCard),
  { ssr: false }
);
import { Button } from '@/components/ui/button';

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
    <div className="px-8 py-6 max-w-[920px] mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Insights
          </h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            Conversational commentary on {monthLabel} · generated locally
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            {monthLabel}
          </Button>
        </div>
      </div>

      <InsightCard
        ollamaUrl={ollamaUrl}
        ollamaModel={ollamaModel}
        history={serialisedHistory}
        autoGenerate={autoInsights && history.length === 0}
      />
    </div>
  );
}
