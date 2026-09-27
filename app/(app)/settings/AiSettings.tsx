'use client';

import { useState, useTransition, useId } from 'react';
import { Sparkles } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { notify } from '@/lib/ui-notify';
import { cn } from '@/lib/utils';
import { setAutoInsights, setOllamaModel } from '@/server-actions/settings';

type Props = {
  ollamaUrl: string;
  ollamaConnected: boolean;
  ollamaModel: string;
  ollamaModels: Array<{ name: string; size: number }>;
  autoInsightsMonthly: boolean;
};

function formatModelSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

export function AiSettings({
  ollamaUrl,
  ollamaConnected,
  ollamaModel: initialModel,
  ollamaModels,
  autoInsightsMonthly: initialAutoInsights,
}: Props) {
  const modelLabelId = useId();
  const [model, setModel] = useState(initialModel);
  const [autoInsights, setAutoInsightsState] = useState(initialAutoInsights);
  const [, startTransition] = useTransition();

  const handleModelChange = (m: string) => {
    setModel(m);
    startTransition(async () => {
      await setOllamaModel(m);
      notify.success(`Default model set to ${m}`);
    });
  };

  const handleAutoInsightsToggle = (val: boolean) => {
    setAutoInsightsState(val);
    startTransition(async () => { await setAutoInsights(val); });
  };

  return (
    <div className="motion-stagger space-y-7">
      {/* ── AI Insights ───────────────────────────────────────────── */}
      <section id="ai-insights">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold tracking-tight">AI insights</h2>
        </div>
        <div className="calm-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium">Ollama endpoint</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5 mono">{ollamaUrl}</div>
            </div>
            <Badge className={cn(
              'text-[11px] flex items-center gap-1.5',
              ollamaConnected ? 'bg-income/10 text-income border-income/30' : 'bg-destructive/10 text-destructive border-destructive/30',
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', ollamaConnected ? 'bg-income' : 'bg-destructive')} />
              {ollamaConnected ? 'Connected' : 'Unreachable'}
            </Badge>
          </div>
          <div className="h-px bg-border" />
          {ollamaConnected ? (
            <div>
              <Label id={modelLabelId}>Default model</Label>
              <div role="radiogroup" aria-labelledby={modelLabelId} className="space-y-2 mt-2">
                {ollamaModels.map(m => (
                  <button
                    key={m.name}
                    role="radio"
                    aria-checked={model === m.name}
                    onClick={() => handleModelChange(m.name)}
                    className={cn(
                      'w-full text-left p-3 rounded-md border transition-colors flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      model === m.name ? 'border-ring/60 bg-accent/40' : 'border-border bg-transparent hover:bg-accent/30',
                    )}
                  >
                    <span className={cn(
                      'w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0',
                      model === m.name ? 'border-primary' : 'border-border',
                    )}>
                      {model === m.name && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-medium mono">{m.name}</span>
                        <span className="text-[11px] text-muted-foreground">· {formatModelSize(m.size)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground py-3 px-4 rounded-md bg-secondary/60 border border-border">
              Ollama is unreachable — connect it to browse available models.
            </p>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-[12px] text-muted-foreground inline-flex items-center gap-2">
              <Switch checked={autoInsights} onCheckedChange={handleAutoInsightsToggle} />
              Auto-generate on the 1st of each month
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
