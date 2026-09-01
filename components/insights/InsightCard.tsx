'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Sparkles, ChevronRight, ThumbsUp, ThumbsDown, RefreshCw, Calendar, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaginationControls } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { setInsightFeedback } from '@/server-actions/insights';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format';

type GenState = 'loading' | 'streaming' | 'done' | 'error';

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
  currentMonth: string; // YYYY-MM — the calendar month, always offered
  defaultMonth: string; // YYYY-MM — where the picker opens (newest month with data)
};

// "2026-06" -> "June 2026"
function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function InsightCard({ ollamaUrl, ollamaModel, history, currentMonth, defaultMonth }: Props) {
  const [items, setItems] = useState<HistoryItem[]>(history);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [model] = useState(ollamaModel);

  // A single in-flight (or just-finished) generation, tied to one month.
  const [gen, setGen] = useState<{
    month: string;
    state: GenState;
    text: string;
    id: string | null;
    tokens: number;
    elapsed: string;
    errorMsg: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const savedForSelected = useMemo(
    () => items.find(i => i.monthCovered === selectedMonth) ?? null,
    [items, selectedMonth],
  );

  // Months offered in the picker: every month with a note, plus the calendar month
  // and the default. The calendar month stays selectable even when it holds no data
  // and is not where the picker opens.
  const pickerMonths = useMemo(() => {
    const set = new Set(items.map(i => i.monthCovered));
    set.add(currentMonth);
    set.add(defaultMonth);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [items, currentMonth, defaultMonth]);

  const isLive = gen?.month === selectedMonth;
  const busy = gen?.state === 'loading' || gen?.state === 'streaming';

  const generate = useCallback((month: string) => {
    setFeedback(null);
    setGen({ month, state: 'loading', text: '', id: null, tokens: 0, elapsed: '', errorMsg: '' });

    const es = new EventSource(`/api/insights/stream?month=${month}`);
    let fullText = '';

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.error) {
        setGen(g => g && g.month === month ? { ...g, state: 'error', errorMsg: data.error } : g);
        es.close();
        return;
      }

      if (data.delta !== undefined) {
        fullText += data.delta;
        setGen(g => g && g.month === month
          ? { ...g, state: 'streaming', text: fullText }
          : g);
      }

      if (data.done && data.saved) {
        setGen(g => g && g.month === month
          ? { ...g, state: 'done', id: data.id ?? null, tokens: data.tokens, elapsed: data.elapsed }
          : g);
        // Reflect the new note in the in-page history (replace any same-month entry).
        setItems(prev => [
          { id: data.id ?? month, monthCovered: month, content: fullText, modelUsed: model, generatedAt: new Date().toISOString(), feedback: null },
          ...prev.filter(p => p.monthCovered !== month),
        ]);
        es.close();
      }
    };

    es.onerror = () => {
      setGen(g => g && g.month === month
        ? { ...g, state: 'error', errorMsg: 'Could not connect to the streaming endpoint.' }
        : g);
      es.close();
    };
  }, [model]);

  const handleFeedback = async (value: 'helpful' | 'not-useful') => {
    if (gen?.id) await setInsightFeedback(gen.id, value);
    setFeedback(value);
  };

  // Resolve what to render for the selected month.
  const showLive = isLive && gen;
  const displayText = showLive ? gen.text : (savedForSelected?.content ?? '');
  const paragraphs = displayText.split('\n\n').filter(Boolean);

  const hasNote = showLive ? gen.state !== 'error' : !!savedForSelected;
  const generateLabel = hasNote ? 'Regenerate' : 'Generate';
  const GenerateIcon = hasNote ? RefreshCw : Sparkles;

  // Status line + dot
  const statusDot =
    gen?.state === 'loading' && isLive ? 'bg-warning animate-pulse'
    : gen?.state === 'streaming' && isLive ? 'bg-primary animate-pulse'
    : gen?.state === 'done' && isLive ? 'bg-income'
    : gen?.state === 'error' && isLive ? 'bg-destructive'
    : savedForSelected ? 'bg-income'
    : 'bg-muted-foreground/40';

  const statusText =
    isLive && gen?.state === 'loading' ? `Connecting to Ollama at ${ollamaUrl}…`
    : isLive && gen?.state === 'streaming' ? `Streaming response from ${model}`
    : isLive && gen?.state === 'done' ? `Generated · ${gen.tokens.toLocaleString()} tokens · ${gen.elapsed}s`
    : isLive && gen?.state === 'error' ? gen.errorMsg
    : savedForSelected ? `Viewing ${monthLabel(selectedMonth)} · ${fmtDate(savedForSelected.generatedAt)}`
    : `No insight for ${monthLabel(selectedMonth)} yet`;

  const generatedAt = showLive && gen.state === 'done' ? new Date()
    : savedForSelected?.generatedAt ?? null;

  const previousNotes = items.filter(i => i.monthCovered !== selectedMonth);

  // Paginate the history list, 5 per page; reset when the list shifts beneath us.
  const NOTES_PER_PAGE = 5;
  const [notesPage, setNotesPage] = useState(1);
  useEffect(() => { setNotesPage(1); }, [selectedMonth, items]);
  const notesTotalPages = Math.max(1, Math.ceil(previousNotes.length / NOTES_PER_PAGE));
  const notesPg = Math.min(notesPage, notesTotalPages);
  const pagedNotes = previousNotes.slice((notesPg - 1) * NOTES_PER_PAGE, notesPg * NOTES_PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[12.5px] text-muted-foreground text-balance">
          Conversational commentary on {monthLabel(selectedMonth)} · generated locally
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generate(selectedMonth)}
            disabled={busy}
          >
            <GenerateIcon className="w-3.5 h-3.5 mr-1.5" />
            {generateLabel}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              {monthLabel(selectedMonth)}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {pickerMonths.map(m => (
                <DropdownMenuItem key={m} onClick={() => setSelectedMonth(m)}>
                  <Check className={cn('w-3.5 h-3.5 mr-1.5', m === selectedMonth ? 'opacity-100' : 'opacity-0')} />
                  {monthLabel(m)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Status bar */}
      <div className="calm-card p-3 flex items-center justify-between gap-3 text-[12px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn('w-2 h-2 rounded-full shrink-0', statusDot)} />
          <span className="text-muted-foreground truncate">{statusText}</span>
        </div>
        <div className="mono text-muted-foreground text-[11px] shrink-0">{model}</div>
      </div>

      {/* Main note card */}
      <div className="calm-card relative overflow-hidden">
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
              <div className="text-[13px] font-medium">{monthLabel(selectedMonth)} summary</div>
              <div className="text-[11.5px] text-muted-foreground">
                A note from your finance assistant
                {generatedAt && ` · generated ${fmtDate(generatedAt)}`}
              </div>
            </div>
          </div>

          {/* Loading state — skeletons */}
          {isLive && gen?.state === 'loading' && (
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
          {!hasNote && !(isLive && gen?.state === 'loading') && !(isLive && gen?.state === 'error') && (
            <div className="py-8 text-center text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-[13px]">No insight generated yet for this month.</p>
              <p className="text-[12px] mt-1">Click Generate to analyse your finances.</p>
            </div>
          )}

          {/* Streamed / saved text */}
          {paragraphs.length > 0 && (
            <div
              className="space-y-4 text-[14px] leading-[1.7] text-foreground/90"
              style={{ textWrap: 'pretty' } as React.CSSProperties}
            >
              {paragraphs.map((p, i) => (
                <p key={i}>
                  {p}
                  {showLive && gen.state === 'streaming' && i === paragraphs.length - 1 && (
                    <span className="inline-block w-[7px] h-[16px] bg-primary/80 align-middle ml-0.5 animate-pulse" />
                  )}
                </p>
              ))}
            </div>
          )}

          {/* Error state */}
          {isLive && gen?.state === 'error' && (
            <div className="py-6 text-center">
              <p className="text-[13px] text-destructive">{gen.errorMsg}</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Make sure Ollama is running at <span className="mono">{ollamaUrl}</span>
              </p>
            </div>
          )}

          {/* Done footer — feedback on a freshly generated note */}
          {showLive && gen.state === 'done' && (
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
                {feedback ? 'Feedback saved' : `Saved to /insights/${selectedMonth}`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      {previousNotes.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2">
            Previous notes
          </div>
          <div className="calm-card divide-y divide-border/40 overflow-hidden">
            {pagedNotes.map(item => (
              <button
                key={item.id}
                type="button"
                className="w-full text-left px-5 py-3 hover:bg-accent/40 transition-colors flex items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
                onClick={() => setSelectedMonth(item.monthCovered)}
              >
                <div className="text-[13px] font-medium w-[140px] shrink-0">{item.monthCovered}</div>
                <div className="text-[12px] text-muted-foreground flex-1 truncate">
                  {item.content.slice(0, 100)}…
                </div>
                <div className="text-[11px] text-muted-foreground mono shrink-0">
                  {fmtDate(item.generatedAt)}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
          <PaginationControls page={notesPg} totalPages={notesTotalPages} onChange={setNotesPage} className="mt-3" />
        </div>
      )}
    </div>
  );
}
