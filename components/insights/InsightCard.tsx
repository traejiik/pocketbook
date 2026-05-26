'use client';

import { useState, useCallback, useEffect } from 'react';
import { Sparkles, ChevronRight, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { setInsightFeedback } from '@/server-actions/insights';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format';

type StreamState = 'ready' | 'loading' | 'streaming' | 'done' | 'error';

type HistoryItem = {
  id: string;
  monthCovered: string;
  content: string;
  modelUsed: string;
  generatedAt: Date | string;
  feedback: string | null;
};

type Props = {
  ollamaUrl: string;
  ollamaModel: string;
  history: HistoryItem[];
  autoGenerate?: boolean;
};

export function InsightCard({ ollamaUrl, ollamaModel, history, autoGenerate }: Props) {
  const [state, setState] = useState<StreamState>(autoGenerate ? 'loading' : 'ready');
  const [text, setText] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ tokens: number; elapsed: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeHistory, setActiveHistory] = useState<HistoryItem | null>(null);
  const [model] = useState(ollamaModel);

  const generate = useCallback(async () => {
    setActiveHistory(null);
    setState('loading');
    setText('');
    setSavedId(null);
    setFeedback(null);
    setMeta(null);
    setErrorMsg('');

    const es = new EventSource('/api/insights/stream');

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.error) {
        setErrorMsg(data.error);
        setState('error');
        es.close();
        return;
      }

      if (state === 'loading' || state === 'ready') {
        setState('streaming');
      }

      if (data.delta !== undefined) {
        setState('streaming');
        setText(prev => prev + data.delta);
      }

      if (data.done && data.saved) {
        setMeta({ tokens: data.tokens, elapsed: data.elapsed });
        setState('done');
        es.close();
      }
    };

    es.onerror = () => {
      setErrorMsg('Could not connect to the streaming endpoint.');
      setState('error');
      es.close();
    };
  }, [state]);

  // Auto-generate on mount if requested
  useEffect(() => {
    if (autoGenerate) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFeedback = async (value: 'helpful' | 'not-useful') => {
    if (savedId) {
      await setInsightFeedback(savedId, value);
    }
    setFeedback(value);
  };

  const displayItem = activeHistory ?? null;
  const displayText = displayItem ? displayItem.content : text;
  const paragraphs = displayText.split('\n\n').filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <Card className="p-3 flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-2.5">
          <span className={cn(
            'w-2 h-2 rounded-full shrink-0',
            state === 'loading' && 'bg-warning animate-pulse',
            state === 'streaming' && 'bg-primary animate-pulse',
            state === 'done' && 'bg-income',
            state === 'ready' && 'bg-muted-foreground/40',
            state === 'error' && 'bg-destructive',
          )} />
          <span className="text-muted-foreground">
            {state === 'loading' && `Connecting to Ollama at ${ollamaUrl}…`}
            {state === 'streaming' && `Streaming response from ${model}`}
            {state === 'done' && meta && `Generated · ${meta.tokens.toLocaleString()} tokens · ${meta.elapsed}s`}
            {state === 'done' && !meta && 'Generated'}
            {state === 'ready' && 'Ready to generate'}
            {state === 'error' && errorMsg}
            {displayItem && `Viewing ${displayItem.monthCovered} · ${fmtDate(displayItem.generatedAt)}`}
          </span>
        </div>
        <div className="mono text-muted-foreground/70 text-[11px]">
          {model}
        </div>
      </Card>

      {/* Main note card */}
      <Card className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-50"
          style={{ background: 'radial-gradient(50% 30% at 15% 0%, hsl(var(--primary) / 0.10), transparent 60%)' }}
        />

        <div className="relative p-7">
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[13px] font-medium">
                {displayItem
                  ? `${displayItem.monthCovered} summary`
                  : `${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} summary`}
              </div>
              <div className="text-[11.5px] text-muted-foreground">
                A note from your finance assistant
                {displayItem && ` · generated ${fmtDate(displayItem.generatedAt)}`}
              </div>
            </div>
          </div>

          {/* Loading state — skeletons */}
          {state === 'loading' && !displayItem && (
            <div className="space-y-3">
              <Skeleton className="h-3.5 w-[92%]" />
              <Skeleton className="h-3.5 w-[88%]" />
              <Skeleton className="h-3.5 w-[78%]" />
              <Skeleton className="h-3.5 w-[40%]" />
              <div className="h-2" />
              <Skeleton className="h-3.5 w-[94%]" />
              <Skeleton className="h-3.5 w-[81%]" />
              <Skeleton className="h-3.5 w-[64%]" />
              <div className="text-[11.5px] text-muted-foreground mono mt-6 inline-flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                <span className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: '120ms' }} />
                <span className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: '240ms' }} />
                <span className="ml-1.5">model is warming up</span>
              </div>
            </div>
          )}

          {/* Ready / empty state */}
          {state === 'ready' && !displayItem && (
            <div className="py-8 text-center text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-[13px]">No insight generated yet for this month.</p>
              <p className="text-[12px] mt-1">Click Generate to analyse your finances.</p>
            </div>
          )}

          {/* Streamed / done text */}
          {(state === 'streaming' || state === 'done' || displayItem) && paragraphs.length > 0 && (
            <div
              className="space-y-4 text-[14px] leading-[1.7] text-foreground/90"
              style={{ textWrap: 'pretty' } as React.CSSProperties}
            >
              {paragraphs.map((p, i) => (
                <p key={i}>
                  {p}
                  {state === 'streaming' && i === paragraphs.length - 1 && (
                    <span className="inline-block w-[7px] h-[16px] bg-primary/80 align-middle ml-0.5 animate-pulse" />
                  )}
                </p>
              ))}
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="py-6 text-center">
              <p className="text-[13px] text-destructive">{errorMsg}</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Make sure Ollama is running at <span className="mono">{ollamaUrl}</span>
              </p>
            </div>
          )}

          {/* Done footer */}
          {state === 'done' && !displayItem && (
            <div className="mt-7 pt-5 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFeedback('helpful')}
                  className={cn(feedback === 'helpful' && 'text-income')}
                  disabled={!!feedback}
                >
                  <ThumbsUp className="w-3.5 h-3.5 mr-1.5" />
                  Helpful
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFeedback('not-useful')}
                  className={cn(feedback === 'not-useful' && 'text-destructive')}
                  disabled={!!feedback}
                >
                  <ThumbsDown className="w-3.5 h-3.5 mr-1.5" />
                  Not useful
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {feedback ? 'Feedback saved' : `Saved to /insights/${new Date().toISOString().slice(0, 7)}`}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2">
            Previous notes
          </div>
          <Card className="divide-y divide-border">
            {history.map(item => (
              <button
                key={item.id}
                type="button"
                className="w-full text-left px-5 py-3 hover:bg-accent/40 transition-colors flex items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
                onClick={() => setActiveHistory(activeHistory?.id === item.id ? null : item)}
              >
                <div className="text-[13px] font-medium w-[140px] shrink-0">{item.monthCovered}</div>
                <div className="text-[12px] text-muted-foreground flex-1 truncate">
                  {item.content.slice(0, 100)}…
                </div>
                <div className="text-[11px] text-muted-foreground/70 mono shrink-0">
                  {fmtDate(item.generatedAt)}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            ))}
          </Card>
        </div>
      )}

      {/* Regenerate button for when viewing history or after done */}
      {(state === 'done' || state === 'error' || activeHistory) && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={generate}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Regenerate
          </Button>
        </div>
      )}
    </div>
  );
}
