// Spec view — visual identity, design tokens, component map, interaction notes.

const Swatch = ({ name, hsl, varName, dark }) => (
  <div className={cn('flex items-center gap-3 p-2.5 rounded-md border border-border', dark ? 'bg-[hsl(232,9%,8.5%)]' : 'bg-white')}>
    <div className="w-10 h-10 rounded-md border border-black/10 flex-shrink-0" style={{ background: `hsl(${hsl})` }} />
    <div className="min-w-0">
      <div className={cn('text-[12px] font-medium truncate', dark ? 'text-white' : 'text-zinc-900')}>{name}</div>
      <div className={cn('text-[10.5px] mono truncate', dark ? 'text-zinc-400' : 'text-zinc-500')}>{varName}</div>
      <div className={cn('text-[10.5px] mono truncate', dark ? 'text-zinc-500' : 'text-zinc-400')}>hsl({hsl})</div>
    </div>
  </div>
);

const SectionHeading = ({ children, num, sub }) => (
  <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-border">
    <span className="mono text-[11px] text-muted-foreground">{num}</span>
    <h2 className="text-[18px] font-semibold tracking-tight">{children}</h2>
    {sub && <span className="text-[12.5px] text-muted-foreground">— {sub}</span>}
  </div>
);

const SpecView = () => {
  // Color tokens for both themes
  const darkTokens = [
    { name: 'background',   hsl: '230 10% 6%',   v: '--background' },
    { name: 'foreground',   hsl: '0 0% 96%',     v: '--foreground' },
    { name: 'card',         hsl: '232 9% 8.5%',  v: '--card' },
    { name: 'muted',        hsl: '232 8% 13%',   v: '--muted' },
    { name: 'border',       hsl: '232 8% 16%',   v: '--border' },
    { name: 'primary',      hsl: '220 95% 66%',  v: '--primary' },
    { name: 'secondary',    hsl: '232 8% 13%',   v: '--secondary' },
    { name: 'accent',       hsl: '232 8% 14%',   v: '--accent' },
    { name: 'destructive',  hsl: '6 80% 60%',    v: '--destructive' },
    { name: 'success',      hsl: '152 60% 50%',  v: '--success' },
  ];
  const lightTokens = [
    { name: 'background',   hsl: '30 14% 97%',   v: '--background' },
    { name: 'foreground',   hsl: '240 8% 10%',   v: '--foreground' },
    { name: 'card',         hsl: '0 0% 100%',    v: '--card' },
    { name: 'muted',        hsl: '240 5% 94%',   v: '--muted' },
    { name: 'border',       hsl: '240 6% 88%',   v: '--border' },
    { name: 'primary',      hsl: '220 90% 56%',  v: '--primary' },
    { name: 'secondary',    hsl: '240 5% 94%',   v: '--secondary' },
    { name: 'accent',       hsl: '240 5% 92%',   v: '--accent' },
    { name: 'destructive',  hsl: '6 78% 50%',    v: '--destructive' },
    { name: 'success',      hsl: '145 55% 38%',  v: '--success' },
  ];
  const semantic = [
    { name: 'income',  dark: '152 60% 52%', light: '152 55% 38%', v: '--income' },
    { name: 'expense', dark: '14 85% 64%',  light: '14 80% 50%',  v: '--expense' },
    { name: 'savings', dark: '220 95% 66%', light: '220 90% 56%', v: '--savings' },
    { name: 'neutral', dark: '232 6% 60%',  light: '240 4% 42%',  v: '--neutral' },
  ];

  const type = [
    { name: 'text-xs',   px: 12, weight: 400, lh: 16, use: 'micro labels, mono captions' },
    { name: 'text-sm',   px: 13, weight: 500, lh: 18, use: 'UI controls, button text' },
    { name: 'text-base', px: 14, weight: 400, lh: 22, use: 'body, insights paragraph' },
    { name: 'text-lg',   px: 15, weight: 600, lh: 22, use: 'card titles' },
    { name: 'text-xl',   px: 18, weight: 600, lh: 24, use: 'section headers' },
    { name: 'text-2xl',  px: 22, weight: 600, lh: 28, use: 'screen titles' },
    { name: 'text-3xl',  px: 28, weight: 600, lh: 34, use: 'KPI numerics, hero amounts' },
  ];

  const shadcnComps = [
    'Button', 'Card', 'Input', 'Label', 'Form', 'Select', 'Switch', 'Toggle Group',
    'Tabs', 'Dialog', 'Sheet', 'Drawer', 'Popover', 'Dropdown Menu', 'Tooltip',
    'Table', 'Badge', 'Skeleton', 'Toast (Sonner)', 'Calendar', 'Command (⌘K)', 'Separator',
  ];
  const customComps = [
    { name: 'CurrencyInput',     desc: 'Amount + currency selector with live HUF equivalent.' },
    { name: 'AmountDisplay',     desc: 'Tabular-numeric amount, signed, currency-aware, tone-colored.' },
    { name: 'KpiCard',           desc: 'Dashboard metric tile with delta arrow and accent dot column.' },
    { name: 'CategoryBadge',     desc: 'Pill with color dot pulled from the category record.' },
    { name: 'RecurringRuleCard', desc: 'Subscription card with cycle icon, next-due, installment progress.' },
    { name: 'TimelineStrip',     desc: 'Horizontal time axis with renewal markers (renewals screen).' },
    { name: 'CategoryBar',       desc: 'Bar row with category dot, gradient fill, value + percent.' },
    { name: 'Segmented',         desc: 'Compact two-three-segment control for view switches.' },
    { name: 'InsightCard',       desc: 'Conversational note container with streaming caret state.' },
    { name: 'AppShell',          desc: 'Sidebar + main with theme toggle and quick-add affordance.' },
  ];

  return (
    <div className="bg-background text-foreground p-10 dark">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2.5 mb-2">
            <Icon name="logo" className="w-6 h-6" />
            <div className="text-[14px] font-semibold tracking-tight">Pocketbook</div>
            <span className="mono text-[11px] text-muted-foreground ml-1">design system v0.4</span>
          </div>
          <h1 className="text-[34px] font-semibold tracking-tight leading-tight mt-3">A self-hosted ledger that reads like Linear and rests like Things.</h1>
        </div>

        {/* 1. Visual identity */}
        <section className="mb-12">
          <SectionHeading num="01" sub="The vibe in one sentence">Visual identity</SectionHeading>
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-5 col-span-2">
              <div className="text-[12.5px] text-muted-foreground leading-relaxed" style={{textWrap:'pretty'}}>
                Pocketbook is a quiet, dark-first money instrument — precision-engineered hairlines, tabular numerics, and a single electric-blue accent doing all the lifting. The vibe is <span className="text-foreground">Linear's surgical density</span> meeting <span className="text-foreground">Things 3's calm restraint</span>: an app that looks at home in a homelab terminal next to <span className="mono">btop</span>, but polished enough to put in a portfolio. The emotional register is <span className="text-foreground">serious, calm, and confident</span> — never austere, never decorative. Numbers are the protagonists; chrome is the stage hand.
              </div>
            </Card>
            <Card className="p-5">
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">References</div>
              <ul className="mt-2 space-y-1.5 text-[12.5px]">
                <li className="flex justify-between"><span>Linear</span><span className="text-muted-foreground text-[11px]">density, command bar</span></li>
                <li className="flex justify-between"><span>Things 3</span><span className="text-muted-foreground text-[11px]">restraint, list rhythm</span></li>
                <li className="flex justify-between"><span>Stripe Dashboard</span><span className="text-muted-foreground text-[11px]">numeric hierarchy</span></li>
                <li className="flex justify-between"><span>Wise</span><span className="text-muted-foreground text-[11px]">multi-currency cues</span></li>
              </ul>
              <div className="mt-4 pt-3 border-t border-border text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Register</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['calm','serious','dense','precise','quiet'].map(t => <Badge key={t}>{t}</Badge>)}
                {['playful','decorative','airy'].map(t => <span key={t} className="text-[11px] text-muted-foreground/50 line-through">{t}</span>)}
              </div>
            </Card>
          </div>
        </section>

        {/* 2. Tokens */}
        <section className="mb-12">
          <SectionHeading num="02" sub="HSL · shadcn convention">Tokens</SectionHeading>

          {/* Color tokens */}
          <div className="grid grid-cols-2 gap-5 mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2.5">Dark theme · default</div>
              <div className="grid grid-cols-2 gap-2">
                {darkTokens.map(t => <Swatch key={t.name} dark name={t.name} hsl={t.hsl} varName={t.v} />)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2.5">Light theme</div>
              <div className="grid grid-cols-2 gap-2">
                {lightTokens.map(t => <Swatch key={t.name} name={t.name} hsl={t.hsl} varName={t.v} />)}
              </div>
            </div>
          </div>

          {/* Semantic finance */}
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2.5">Semantic · finance</div>
            <Card className="p-4">
              <table className="w-full text-[12px]">
                <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  <tr><th className="text-left font-medium pb-2">token</th><th className="text-left font-medium pb-2">dark</th><th className="text-left font-medium pb-2">light</th><th className="text-left font-medium pb-2">use</th></tr>
                </thead>
                <tbody className="mono">
                  {semantic.map(s => (
                    <tr key={s.name} className="border-t border-border">
                      <td className="py-2.5 text-foreground flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{background:`hsl(${s.dark})`}}/>{s.name}</td>
                      <td className="py-2.5 text-muted-foreground">{s.dark}</td>
                      <td className="py-2.5 text-muted-foreground">{s.light}</td>
                      <td className="py-2.5 text-muted-foreground/80 not-mono" style={{fontFamily:'Geist'}}>
                        {s.name === 'income' && 'positive deltas, income tx, success ring'}
                        {s.name === 'expense' && 'negative deltas, expense tx, warning'}
                        {s.name === 'savings' && 'savings tx, savings goal ring, also default primary'}
                        {s.name === 'neutral' && 'non-signed monetary text, "no change"'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <div className="text-[11.5px] text-muted-foreground mt-2">
              <strong className="text-foreground">Why finance gets its own tokens.</strong> <code className="mono">primary</code> is for action affordances and shouldn't slide into "things are positive" semantics. <code className="mono">destructive</code> is for delete/danger, not for money you legitimately spent. The split keeps deltas honest.
            </div>
          </div>

          {/* Type */}
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2.5">Typography · Geist + Geist Mono</div>
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border text-[11.5px] text-muted-foreground flex items-center justify-between">
                <span>Geist Sans for UI · <span className="mono">Geist Mono</span> for figures, dates, model IDs, file paths</span>
                <span className="mono">tnum 1 · ss01 1</span>
              </div>
              <table className="w-full text-[12px]">
                <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground bg-secondary/15">
                  <tr><th className="text-left font-medium px-4 py-2">name</th><th className="text-left font-medium py-2">size</th><th className="text-left font-medium py-2">weight</th><th className="text-left font-medium py-2">leading</th><th className="text-left font-medium py-2">sample</th></tr>
                </thead>
                <tbody>
                  {type.map(t => (
                    <tr key={t.name} className="border-t border-border">
                      <td className="px-4 py-2.5 mono text-muted-foreground">{t.name}</td>
                      <td className="py-2.5 mono">{t.px}/{t.lh}</td>
                      <td className="py-2.5 mono">{t.weight}</td>
                      <td className="py-2.5 text-muted-foreground">{t.use}</td>
                      <td className="py-2.5 pr-4" style={{fontSize: t.px, lineHeight: `${t.lh}px`, fontWeight: t.weight}}>+321 000 Ft</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Spacing / Radius / Shadow */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2">Spacing</div>
              <div className="text-[12.5px] mb-2">Tailwind default scale.</div>
              <div className="text-[11.5px] text-muted-foreground">No override. The 4px-multiple grid maps cleanly onto our dense-but-not-cramped rhythm (8/12/16/20 covers 90% of cases).</div>
              <div className="mt-3 flex items-end gap-1">
                {[1,2,3,4,6,8,10,12].map(s => (
                  <div key={s} className="flex flex-col items-center gap-1">
                    <div className="bg-primary/30 rounded-sm" style={{ width: 8, height: s*4 }} />
                    <div className="text-[9.5px] text-muted-foreground mono">{s}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2">Radius</div>
              <div className="text-[12.5px] mb-3"><span className="mono">--radius: 0.625rem</span> · 10px base</div>
              <div className="flex gap-2 items-end">
                <div className="w-12 h-12 bg-secondary border border-border" style={{borderRadius:'2px'}}/>
                <div className="w-12 h-12 bg-secondary border border-border" style={{borderRadius:'6px'}}/>
                <div className="w-12 h-12 bg-secondary border border-border" style={{borderRadius:'10px'}}/>
                <div className="w-12 h-12 bg-secondary border border-border" style={{borderRadius:'9999px'}}/>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground mono mt-1.5">
                <span>sm 6</span><span>md 8</span><span>lg 10</span><span>full</span>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2">Shadows</div>
              <div className="text-[12.5px] mb-3">3 levels, dark-mode-tuned.</div>
              <div className="space-y-2">
                <div className="bg-card border border-border rounded-md p-2 text-[11.5px] shadow-pb-1">shadow-pb-1 · hairline lift</div>
                <div className="bg-card border border-border rounded-md p-2 text-[11.5px] shadow-pb-2">shadow-pb-2 · hover, popovers</div>
                <div className="bg-card border border-border rounded-md p-2 text-[11.5px] shadow-pb-3">shadow-pb-3 · sheets, modals</div>
              </div>
            </Card>
          </div>
        </section>

        {/* 3. Component map */}
        <section className="mb-12">
          <SectionHeading num="03" sub="shadcn primitives + custom components">Component map</SectionHeading>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2.5">shadcn · base layer</div>
              <Card className="p-4 flex flex-wrap gap-1.5">
                {shadcnComps.map(c => (
                  <span key={c} className="inline-flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 py-1 text-[11.5px] mono">
                    <Icon name="check" className="w-3 h-3 text-income" />{c}
                  </span>
                ))}
              </Card>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2.5">custom · finance-specific</div>
              <Card className="divide-y divide-border overflow-hidden">
                {customComps.map(c => (
                  <div key={c.name} className="px-4 py-2.5">
                    <div className="text-[12.5px] mono text-foreground">{c.name}</div>
                    <div className="text-[11.5px] text-muted-foreground mt-0.5">{c.desc}</div>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        </section>

        {/* 5. Interaction notes */}
        <section>
          <SectionHeading num="05" sub="The half-page that decides whether it feels right">Interaction notes</SectionHeading>
          <Card className="p-6 space-y-5 text-[13px] leading-[1.65] text-foreground/90" style={{textWrap:'pretty'}}>
            <div>
              <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-1.5">Add transaction</div>
              <p>The most-used form. Opens as a right-side <span className="mono">Sheet</span> instead of a modal so the table behind it stays anchored — you can scan the day's existing entries while typing. Hitting <span className="mono">N</span> anywhere opens it; <span className="mono">⌘↵</span> submits. Type segmented control is colour-coded so the form changes register before you read it. Currency conversion is shown in muted mono under the amount field — never as a popover, never as a tooltip.</p>
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-1.5">AI Insights loading</div>
              <p>Three states. First, a connection line at the top with a pulsing amber dot ("Connecting to Ollama…") and a skeleton paragraph below — this lasts ~1s. Then the dot flips to primary-blue and the model streams text in token-by-token with a blinking caret at the tail of the latest paragraph. When complete, the dot turns green and a footer slides in with helpful / not-useful + a saved-to-disk path. No spinner, no typewriter gimmick on a pre-canned string.</p>
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-1.5">Installment hits zero</div>
              <p>The amber installment block on the recurring card animates the progress bar to 100%, then collapses into a one-line confirmation: "Mobile contract — finished July 2026 · 300 675 Ft total paid." The rule itself flips to <span className="mono">archived</span>, drops out of upcoming renewals, but stays searchable. A subtle toast appears on the dashboard the first time you load it post-completion.</p>
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-1.5">Switching months on the dashboard</div>
              <p>KPI cards crossfade with a 180ms ease-out — the numerals tween between values rather than hard-cut, which makes deltas readable at a glance. Bar chart re-orders (sort by value) with a FLIP animation so the eye tracks "this category moved up". Trend strip slides one bar to the left and adds the new month from the right.</p>
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-1.5">Empty states</div>
              <p>No illustrations. A single muted icon in a circle, a tight title, a one-line body, and a primary action. The app launches with seeded categories so true empty states only happen on Transactions (until you log your first) and AI Insights (first month).</p>
            </div>
          </Card>
        </section>

        <div className="mt-10 pt-6 border-t border-border text-center">
          <div className="text-[11px] text-muted-foreground mono">end of spec · prototype follows below</div>
          <div className="mt-1 text-muted-foreground/60">↓</div>
        </div>
      </div>
    </div>
  );
};

window.SpecView = SpecView;
