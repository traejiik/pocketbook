// AI Insights — conversational note from local LLM via Ollama.

const INSIGHTS_TEXT = `May has been your strongest month since February. Net is sitting at +109,500 Ft with a 34% savings rate — about 9 percentage points above your six-month average.

Your subscription footprint is the thing worth looking at. You're paying for both ChatGPT Plus and Claude Pro at the same time — that's roughly 14,300 Ft per month for two tools doing the same job. If you've settled on one, dropping the other claws back ~172,000 Ft per year.

Apple Music (1,990 Ft) and Spotify Family (2,490 Ft) are also doubled up. The Spotify family plan only pays off if you're sharing it; if not, you can collapse to one and save another 1,990 Ft monthly.

The mobile installment ends in July. From August onwards that's 20,045 Ft monthly that you can either let flow into savings or redirect — at current rates, six months of redirected installments puts you over the 200k Ft emergency-fund mark.

Eating out is up 22% vs April. Not alarming yet, but it's the only expense category trending the wrong way; everything else is flat or down. Worth watching one more month before deciding if it's a habit or a fluke.

One small note: your plasma donation income is consistent (3 visits = 36,000 Ft) and you've been treating it as variable income. Stable enough to model as recurring at this point.`;

const Insights = () => {
  const [state, setState] = React.useState('ready'); // ready | loading | streamed | done
  const [streamed, setStreamed] = React.useState('');

  const generate = () => {
    setState('loading');
    setStreamed('');
    setTimeout(() => {
      setState('streamed');
      let i = 0;
      const id = setInterval(() => {
        i += 14;
        setStreamed(INSIGHTS_TEXT.slice(0, i));
        if (i >= INSIGHTS_TEXT.length) { clearInterval(id); setState('done'); }
      }, 28);
    }, 1100);
  };

  React.useEffect(() => { generate(); /* eslint-disable-next-line */ }, []);

  const paragraphs = streamed.split('\n\n');

  return (
    <div className="px-8 py-6 max-w-[920px] mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight flex items-center gap-2">
            <Icon name="sparkles" className="w-5 h-5 text-primary" />
            AI Insights
          </h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            Conversational commentary on May 2026 · generated locally
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" icon="repeat" onClick={generate} disabled={state==='loading'||state==='streamed'}>Regenerate</Button>
          <Button variant="outline" size="md" icon="calendar">May 2026</Button>
        </div>
      </div>

      {/* Generation status bar */}
      <Card className="p-3 mb-4 flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-2.5">
          <span className={cn(
            'w-2 h-2 rounded-full',
            state === 'loading' && 'bg-amber-400 animate-pulse',
            state === 'streamed' && 'bg-primary animate-pulse',
            state === 'done' && 'bg-income'
          )} />
          <span className="text-muted-foreground">
            {state === 'loading' && 'Connecting to Ollama at homelab.local:11434…'}
            {state === 'streamed' && 'Streaming response from llama3.1:8b'}
            {state === 'done' && 'Generated · 1,128 tokens · 11.4s'}
          </span>
        </div>
        <div className="mono text-muted-foreground/70 text-[11px]">
          llama3.1:8b · temp 0.4
        </div>
      </Card>

      {/* The note */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-50"
             style={{ background: 'radial-gradient(50% 30% at 15% 0%, hsl(var(--primary) / 0.10), transparent 60%)' }} />

        <div className="relative p-7">
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <Icon name="sparkles" className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="text-[13px] font-medium">May summary</div>
              <div className="text-[11.5px] text-muted-foreground">A note from your finance assistant · 18 May 2026, 19:42</div>
            </div>
          </div>

          {state === 'loading' && (
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

          {state !== 'loading' && (
            <div className="space-y-4 text-[14px] leading-[1.7] text-foreground/90" style={{ textWrap: 'pretty' }}>
              {paragraphs.map((p, i) => (
                <p key={i}>
                  {p}
                  {state === 'streamed' && i === paragraphs.length - 1 && (
                    <span className="inline-block w-[7px] h-[16px] bg-primary/80 align-middle ml-0.5 animate-pulse" />
                  )}
                </p>
              ))}
            </div>
          )}

          {state === 'done' && (
            <div className="mt-7 pt-5 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" icon="check">Helpful</Button>
                <Button variant="ghost" size="sm" icon="x">Not useful</Button>
              </div>
              <div className="text-[11px] text-muted-foreground">Saved to <span className="mono">/insights/2026-05.md</span></div>
            </div>
          )}
        </div>
      </Card>

      {/* History */}
      <div className="mt-6">
        <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2">Previous notes</div>
        <Card className="divide-y divide-border">
          {[
            {m:'April 2026', d:'14 Apr · 21:02', sum:'Subscription review caught a forgotten DAZN trial. Net flat vs March.'},
            {m:'March 2026', d:'12 Mar · 19:14', sum:'Eating out dropped 38%. Plasma income consistent for the first time.'},
            {m:'February 2026', d:'10 Feb · 18:55', sum:'First note. Established baseline categories and three savings rules.'},
          ].map(n => (
            <button key={n.m} className="w-full text-left px-5 py-3 hover:bg-accent/40 transition-colors flex items-center gap-4">
              <div className="text-[13px] font-medium w-[140px] flex-shrink-0">{n.m}</div>
              <div className="text-[12px] text-muted-foreground flex-1 truncate">{n.sum}</div>
              <div className="text-[11px] text-muted-foreground/70 mono flex-shrink-0">{n.d}</div>
              <Icon name="chevron-right" className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
};

window.Insights = Insights;
