// Dashboard — redesigned in a card-rich layout inspired by reference screenshot.
// Keeps Pocketbook's existing palette + content (HUF income/expenses/savings, renewals, AI insights),
// adds a new "Income used" half-circle gauge meter.

const Dashboard = ({ onNavigate, onAddTx, onGenerateInsights }) => {
  const { kpis, byCategory, recurring, trend6mo, transactions, catBy, fmtHUF, fmtCur, fmtDate, fxRates } = PB_DATA;
  const [chartView, setChartView] = React.useState('cat');

  // The new "Income used" gauge — % of income that's been spent or auto-saved this month.
  const incomeUsedPct = Math.round(((kpis.expense + kpis.savings) / kpis.income) * 100);

  // Upcoming renewals (next 30d)
  const today = new Date('2026-05-18');
  const upcoming = recurring
    .filter(r => r.kind === 'expense')
    .map(r => ({ ...r, daysAway: Math.round((new Date(r.next + 'T00:00') - today) / 86400000) }))
    .filter(r => r.daysAway >= 0 && r.daysAway <= 30)
    .sort((a, b) => a.daysAway - b.daysAway);
  const nextRenewal = upcoming[0];
  const upcomingTotalHUF = upcoming.reduce((s, r) => s + (r.cur === 'USD' ? r.amt * fxRates.HUF_per_USD : r.cur === 'EUR' ? r.amt * fxRates.HUF_per_EUR : r.amt), 0);

  // Recent transactions (last 4)
  const recentTx = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  // Bars
  const maxCat = Math.max(...byCategory.map(b => b.value));
  const topCat = byCategory[0];

  // Trend
  const trendMax = Math.max(...trend6mo.map(t => t.net));

  return (
    <div className="px-6 py-5 space-y-5 max-w-[1280px] mx-auto">
      {/* Body header — page title + subtitle + actions (date now lives in the top header) */}
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight leading-none">Dashboard</h1>
          <div className="text-[13px] text-muted-foreground mt-2.5">Your finances at a glance.</div>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={onAddTx} className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-primary text-primary-foreground font-medium text-[13.5px] shadow-pb-2 hover:opacity-90 transition">
            <Icon name="plus" className="w-4 h-4" /> Add transaction
          </button>
          <button onClick={() => onNavigate('transactions')} className="inline-flex items-center h-11 px-5 rounded-full border border-border bg-card text-foreground font-medium text-[13.5px] hover:bg-accent transition">
            Import data
          </button>
        </div>
      </div>

      {/* KPI row — all matching white cards now; Income value is the green one */}
      <div className="grid grid-cols-4 gap-4">
        <KpiBig label="Income"   value={kpis.income}  tone="income"   deltaPct="+4.2%" footnote="Increased from last month" />
        <KpiBig label="Expenses" value={kpis.expense} tone="expense"  deltaPct="−2.8%" footnote="Decreased from last month" />
        <KpiBig label="Net"      value={kpis.net}     tone="income"   deltaPct="+9.1%" footnote="Increased from last month" />
        <KpiBig label="Savings"  value={kpis.savings} tone="savings"  deltaPct="On auto" footnote="Emergency Fund · weekly" />
      </div>

      {/* Row 2 — Expenses chart (col-7)  +  Upcoming list (col-5, no longer squashed) */}
      <div className="grid grid-cols-12 gap-4">
        {/* Expenses by category — pill bars */}
        <div className="col-span-7 bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Expenses by category</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">May 2026 · {fmtHUF(kpis.expense)} total</div>
            </div>
            <Segmented
              options={[{ label: 'Categories', value: 'cat' }, { label: 'Net trend', value: 'trend' }]}
              value={chartView}
              onChange={setChartView}
            />
          </div>

          {chartView === 'cat' ? (
            <div>
              <div className="grid grid-cols-7 gap-3 h-[210px] items-end px-1">
                {byCategory.slice(0, 7).map((b, i) => {
                  const pct = (b.value / maxCat);
                  const h = 30 + pct * 170;
                  const isMax = b.cat === topCat.cat;
                  const variant = i === 1 || i === 4 ? 'soft' : i === 2 ? 'mid' : 'solid';
                  return (
                    <div key={b.cat} className="flex flex-col items-center gap-2.5 min-w-0">
                      <div className="relative w-full flex justify-center" style={{ height: h }}>
                        {isMax && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-card border border-border rounded-full px-2 py-0.5 shadow-pb-1 mono text-[10.5px] text-foreground whitespace-nowrap z-10">
                            {Math.round(b.value/kpis.expense*100)}%
                          </div>
                        )}
                        <PillBar height={h} color={b.color} variant={isMax ? 'solid' : variant} />
                      </div>
                      <div className="text-[10.5px] text-muted-foreground uppercase mono tracking-wider truncate w-full text-center">{shortLabel(b.name)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 pt-4 border-t border-border flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: topCat.color }} />
                  <span className="font-medium text-foreground">{topCat.name}</span>
                  <span>leads · {fmtHUF(topCat.value)}</span>
                </div>
                <div className="ml-auto text-[11px] text-muted-foreground">7 of {byCategory.length} categories · <button onClick={() => onNavigate('categories')} className="text-foreground hover:underline">See all</button></div>
              </div>
            </div>
          ) : (
            <div className="h-[210px] flex items-end justify-around gap-3">
              {trend6mo.map((t, i) => {
                const h = 30 + (t.net / trendMax) * 170;
                return (
                  <div key={t.m} className="flex flex-col items-center gap-2 flex-1">
                    <div className="relative w-full flex justify-center" style={{ height: h }}>
                      {i === trend6mo.length - 1 && (
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-card border border-border rounded-full px-2 py-0.5 shadow-pb-1 mono text-[10.5px] z-10 whitespace-nowrap">
                          {Math.round(t.net/1000)}k
                        </div>
                      )}
                      <PillBar height={h} color="hsl(var(--income))" variant={i === trend6mo.length - 1 ? 'solid' : i === trend6mo.length - 2 ? 'mid' : 'soft'} />
                    </div>
                    <div className="text-[10.5px] text-muted-foreground uppercase mono tracking-wider">{t.m}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming renewals list — now col-5, full breathing room */}
        <div className="col-span-5 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Upcoming renewals</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">Next 30 days · {fmtHUF(upcomingTotalHUF)}</div>
            </div>
            <button onClick={() => onNavigate('renewals')} className="text-[12px] inline-flex items-center gap-1.5 border border-border rounded-full pl-2 pr-2.5 py-1 hover:bg-accent">
              View all <Icon name="chevron-right" className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-border -mx-1">
            {upcoming.slice(0, 6).map(r => {
              const c = catBy[r.cat];
              return (
                <div key={r.id} className="flex items-center gap-3 px-1 py-2.5">
                  <div className="w-9 h-9 rounded-md border border-border bg-secondary/40 flex flex-col items-center justify-center flex-shrink-0">
                    <div className="text-[8.5px] text-muted-foreground uppercase mono leading-none">{new Date(r.next + 'T00:00').toLocaleDateString('en-GB', { month: 'short' })}</div>
                    <div className="text-[12.5px] font-semibold leading-none mt-0.5">{new Date(r.next + 'T00:00').getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                      <span>{c.name}</span>
                      <span className="text-border">·</span>
                      <span>in {r.daysAway} day{r.daysAway === 1 ? '' : 's'}</span>
                      {r.installment && <><span className="text-border">·</span><Badge kind="warning" className="!py-0">{r.installment.paid}/{r.installment.total}</Badge></>}
                    </div>
                  </div>
                  <div className="text-right tabular text-[13px] flex-shrink-0">
                    {fmtCur(r.amt, r.cur)}
                    {r.cur !== 'HUF' && (
                      <div className="text-[10px] text-muted-foreground">≈ {fmtHUF(r.amt * (r.cur === 'USD' ? fxRates.HUF_per_USD : fxRates.HUF_per_EUR))}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Row 3 — Recent activity (col-5) + Income used gauge (col-4) + right col stacked Reminder/AI (col-3) */}

        {/* Recent activity */}
        <div className="col-span-5 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Recent activity</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">Last {recentTx.length} transactions</div>
            </div>
            <button onClick={() => onNavigate('transactions')} className="text-[12px] inline-flex items-center gap-1.5 border border-border rounded-full pl-2 pr-2.5 py-1 hover:bg-accent">
              <Icon name="plus" className="w-3 h-3" /> View all
            </button>
          </div>
          <div className="divide-y divide-border -mx-1">
            {recentTx.map(t => {
              const c = catBy[t.cat];
              return (
                <div key={t.id} className="flex items-center gap-3 px-1 py-2.5">
                  <div className="w-9 h-9 rounded-full border border-border flex items-center justify-center flex-shrink-0" style={{ background: c.color + '20', color: c.color }}>
                    <span className="text-[11px] font-bold mono">{c.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{t.desc}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      <span>{c.name}</span>
                      <span className="mx-1.5 text-border">·</span>
                      <span className="mono">{fmtDate(t.date, { short: true })}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-[13px] font-semibold" style={{ color: t.type === 'income' ? 'hsl(var(--income))' : t.type === 'savings' ? 'hsl(var(--savings))' : 'hsl(var(--foreground))' }}>
                      {t.type === 'income' ? '+' : t.type === 'savings' ? '↓' : '−'}{fmtCur(Math.abs(t.amt), t.cur).replace('−','')}
                    </div>
                    <Badge
                      kind={t.type === 'income' ? 'income' : t.type === 'savings' ? 'savings' : 'expense'}
                      className="!py-0 !text-[10px] mt-0.5"
                    >
                      {t.type === 'income' ? 'Income' : t.type === 'savings' ? 'Saved' : 'Spent'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Income used — GAUGE METER */}
        <div className="col-span-4 bg-card border border-border rounded-2xl p-5 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Income used</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">{fmtHUF(kpis.expense + kpis.savings)} of {fmtHUF(kpis.income)}</div>
            </div>
            <span className="text-[10.5px] mono uppercase tracking-wider text-muted-foreground bg-secondary border border-border rounded-full px-2 py-0.5">May</span>
          </div>
          <div className="flex-1 flex items-center justify-center -my-2">
            <GaugeMeter percent={incomeUsedPct} />
          </div>
          <div className="flex items-center justify-center gap-5 mt-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-income" />
              Used
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-3 h-2.5 rounded-sm" style={{ background: 'repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.35) 0 2px, transparent 2px 5px)', border: '1px solid hsl(var(--border))' }} />
              Remaining
            </span>
          </div>
        </div>

        {/* Right stack: Reminder on top, AI Insights below */}
        <div className="col-span-3 flex flex-col gap-4">
          {/* Reminder — Next renewal */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col">
            <div className="text-[12.5px] text-muted-foreground">Reminder</div>
            <div className="text-[16px] font-semibold tracking-tight leading-tight mt-1">Next renewal</div>
            <div className="mt-3 text-[15px] font-semibold tracking-tight leading-snug text-primary">{nextRenewal.name}</div>
            <div className="text-[11.5px] text-muted-foreground mt-1.5 tabular">
              {fmtDate(nextRenewal.next, { short: true })} · in {nextRenewal.daysAway}d · {fmtCur(nextRenewal.amt, nextRenewal.cur)}
            </div>
            <button onClick={() => onNavigate('renewals')} className="mt-3.5 w-full inline-flex items-center justify-center gap-2 h-9 rounded-full bg-primary text-primary-foreground font-medium text-[12px] hover:opacity-90 transition">
              <Icon name="calendar" className="w-3.5 h-3.5" /> View renewals
            </button>
          </div>

          {/* AI Insights — dark feature card */}
          <div className="rounded-2xl p-5 relative overflow-hidden flex flex-col text-white flex-1" style={{ background: 'linear-gradient(150deg, #0a1a33 0%, #112a55 50%, #0c1f3d 100%)' }}>
            <svg className="absolute inset-0 w-full h-full opacity-55 pointer-events-none" viewBox="0 0 280 280" preserveAspectRatio="xMidYMid slice">
              <defs>
                <radialGradient id="ai-glow" cx="70%" cy="20%" r="80%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.75" />
                  <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
              <rect width="280" height="280" fill="url(#ai-glow)" />
              {[...Array(6)].map((_, i) => (
                <ellipse key={i} cx="220" cy="60" rx={50 + i*18} ry={36 + i*12} fill="none" stroke="hsl(var(--primary))" strokeOpacity={0.22 - i*0.022} strokeWidth="1" transform={`rotate(${-25 + i*3} 220 60)`} />
              ))}
            </svg>
            <div className="relative flex-1 flex flex-col">
              <div className="text-[13.5px] font-medium text-white/85">AI Insights</div>
              <div className="text-[10.5px] mono text-white/55 mt-1">llama3.1:8b</div>
              <div className="mt-auto">
                <div className="text-[24px] font-semibold tabular tracking-tight leading-none">~12s</div>
                <div className="text-[10.5px] text-white/60 mt-1">Last · 14 Apr</div>
                <div className="flex gap-2 mt-3">
                  <button onClick={onGenerateInsights} title="Generate insights" className="w-9 h-9 rounded-full bg-white text-[#0a1a33] flex items-center justify-center hover:scale-105 transition">
                    <Icon name="sparkles" className="w-4 h-4" />
                  </button>
                  <button onClick={() => onNavigate('insights')} title="Open insights" className="w-9 h-9 rounded-full bg-destructive text-white flex items-center justify-center hover:scale-105 transition">
                    <Icon name="arrow-right" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Local components ------------------------------------------------------

// Big KPI card — uniform white card; value text takes the tone color.
const KpiBig = ({ label, value, tone = 'income', deltaPct, footnote }) => {
  const valueAbs = Math.abs(Math.round(value));
  const isNeg = value < 0;
  const valueStr = valueAbs >= 100000
    ? `${Math.round(valueAbs / 1000)}k`
    : valueAbs.toLocaleString('hu-HU').replace(/,/g, ' ');
  const toneColor = tone === 'expense' ? 'hsl(var(--expense))' : tone === 'savings' ? 'hsl(var(--savings))' : 'hsl(var(--income))';
  const deltaDown = deltaPct?.includes('−') || deltaPct?.includes('-');
  const isStatic = deltaPct && !deltaPct.match(/[\d%]/);

  return (
    <div className="rounded-2xl p-5 bg-card border border-border flex flex-col gap-4 min-h-[170px]">
      <div className="flex items-start justify-between">
        <div className="text-[14px] font-medium text-foreground">{label}</div>
        <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground/80">
          <Icon name="arrow-up-right" className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="mt-auto">
        <div className="tabular font-semibold tracking-tight leading-none" style={{ color: toneColor }}>
          <span className="text-[44px]">{isNeg ? '−' : ''}{valueStr}</span>
          <span className="text-[16px] text-muted-foreground font-medium ml-1.5">Ft</span>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <span className="mono text-[10.5px] bg-secondary border border-border rounded-md px-1.5 py-0.5 inline-flex items-center gap-0.5 text-foreground/80">
            {!isStatic && <Icon name={deltaDown ? 'arrow-down' : 'arrow-up'} className="w-2.5 h-2.5" />}
            {deltaPct?.replace('−','').replace('-','')}
          </span>
          <span className="text-[11px] text-muted-foreground">{footnote}</span>
        </div>
      </div>
    </div>
  );
};

// Pill bar — fills a vertical pill with either solid color, mid-opacity, or hatched (unused).
const PillBar = ({ height, color, variant = 'solid' }) => {
  if (variant === 'soft') {
    return (
      <div className="w-full h-full rounded-full border border-border" style={{
        background: 'repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.18) 0 3px, transparent 3px 7px)',
      }} />
    );
  }
  if (variant === 'mid') {
    return <div className="w-full h-full rounded-full" style={{ background: color, opacity: 0.45 }} />;
  }
  return <div className="w-full h-full rounded-full" style={{ background: color }} />;
};

// Half-circle gauge — modelled on the reference's Project Progress meter.
// Filled arc uses brand income color with rounded caps; remaining arc shows diagonal hatch.
const GaugeMeter = ({ percent }) => {
  const p = Math.max(0, Math.min(100, percent));
  const r = 100;
  const cx = 140, cy = 150;
  const start = { x: cx - r, y: cy };
  const end   = { x: cx + r, y: cy };
  const arcLen = Math.PI * r;
  const usedLen = (p / 100) * arcLen;
  const arcD = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-[300px] block">
      <defs>
        <pattern id="gauge-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="hsl(var(--secondary))" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.5" strokeWidth="2.5" />
        </pattern>
        <linearGradient id="gauge-fill" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--income))" />
          <stop offset="100%" stopColor="hsl(152 55% 30%)" />
        </linearGradient>
      </defs>
      {/* Remaining (hatched) - drawn first, full arc */}
      <path d={arcD} fill="none" stroke="url(#gauge-hatch)" strokeWidth="44" strokeLinecap="round" />
      {/* Filled portion - clipped via dash */}
      <path d={arcD} fill="none" stroke="url(#gauge-fill)" strokeWidth="44" strokeLinecap="round"
            strokeDasharray={`${usedLen} ${arcLen + 50}`} />
      {/* Big % */}
      <text x={cx} y={cy - 5} textAnchor="middle" className="fill-foreground" fontFamily="Geist, system-ui" fontSize="44" fontWeight="600" letterSpacing="-1">
        {p}%
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" className="fill-muted-foreground" fontFamily="Geist, system-ui" fontSize="12">
        of income used
      </text>
    </svg>
  );
};

// Friendly short labels for the bar chart's x-axis
const shortLabel = (name) => {
  const map = {
    'Rent Income': 'Rent', 'Food & Groceries': 'Food', 'Eating Out': 'Eat out',
    'Subscriptions': 'Subs', 'Emergency Fund': 'Save', 'Phone Plan': 'Phone'
  };
  return map[name] || name;
};

window.Dashboard = Dashboard;
