// Settings — FX rates, password, default LLM model.

const Settings = () => {
  const { fxRates } = PB_DATA;
  const [anchor, setAnchor] = React.useState('HUF');
  const [currencies, setCurrencies] = React.useState([
    { code: 'USD', name: 'US Dollar',  symbol: '$', rate: fxRates.HUF_per_USD, mode: 'auto',   provider: 'frankfurter.app', updated: '18 May 2026 · 03:00' },
    { code: 'EUR', name: 'Euro',       symbol: '€', rate: fxRates.HUF_per_EUR, mode: 'auto',   provider: 'frankfurter.app', updated: '18 May 2026 · 03:00' },
    { code: 'GBP', name: 'Pound',      symbol: '£', rate: 458.20,              mode: 'manual', provider: null,              updated: '14 May 2026' },
  ]);
  const [model, setModel] = React.useState('llama3.1:8b');
  const [autoSync, setAutoSync] = React.useState(true);

  const ANCHOR_OPTIONS = [
    { code: 'HUF', symbol: 'Ft', name: 'Forint',     flag: '🇭🇺' },
    { code: 'USD', symbol: '$',  name: 'US Dollar',  flag: '🇺🇸' },
    { code: 'EUR', symbol: '€',  name: 'Euro',       flag: '🇪🇺' },
    { code: 'GBP', symbol: '£',  name: 'Pound',      flag: '🇬🇧' },
  ];
  const anchorMeta = ANCHOR_OPTIONS.find(c => c.code === anchor);

  return (
    <div className="px-8 py-6 max-w-[760px] mx-auto space-y-7">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
        <div className="text-[12.5px] text-muted-foreground mt-1">Configure currencies, security, and the local LLM.</div>
      </div>

      {/* Currencies & FX rates */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="currency" className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold tracking-tight">Currencies & exchange rates</h2>
        </div>

        {/* Anchor currency selector */}
        <Card className="p-5 mb-3">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-[13px] font-semibold tracking-tight">Anchor currency</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">Your primary currency. All totals across the app are normalised to this.</div>
            </div>
            <span className="text-[10.5px] mono uppercase tracking-wider text-muted-foreground">Default</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {ANCHOR_OPTIONS.map(c => (
              <button key={c.code} onClick={() => setAnchor(c.code)}
                className={cn('p-3 rounded-lg border text-left transition-colors',
                  anchor === c.code
                    ? 'border-primary/60 bg-primary/8 ring-2 ring-primary/20'
                    : 'border-border bg-transparent hover:bg-accent/40'
                )}>
                <div className="flex items-center justify-between">
                  <span className="text-[20px] leading-none">{c.flag}</span>
                  {anchor === c.code && <Icon name="check" className="w-3.5 h-3.5 text-primary" />}
                </div>
                <div className="mt-2.5 text-[13px] font-semibold mono tracking-tight">{c.code}</div>
                <div className="text-[10.5px] text-muted-foreground mt-0.5">{c.name}</div>
              </button>
            ))}
          </div>
        </Card>

        {/* Tracked currencies */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-1">
            <div>
              <div className="text-[13px] font-semibold tracking-tight">Tracked currencies</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">Rates expressed as 1 unit of currency → {anchorMeta?.code}.</div>
            </div>
            <Button variant="outline" size="sm" icon="plus">Add currency</Button>
          </div>

          <div className="mt-4 -mx-1 divide-y divide-border">
            {currencies.map((c, idx) => (
              <div key={c.code} className="px-1 py-3.5 grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
                {/* Code chip */}
                <div className="w-12 h-12 rounded-lg border border-border bg-secondary/40 flex flex-col items-center justify-center flex-shrink-0">
                  <div className="text-[14px] font-bold mono leading-none">{c.code}</div>
                  <div className="text-[12px] text-muted-foreground leading-none mt-1">{c.symbol}</div>
                </div>
                {/* Name + rate */}
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground mono mt-0.5">
                    1 {c.code} = <span className="tabular text-foreground/80">{c.rate.toFixed(2)}</span> {anchorMeta?.code}
                    <span className="mx-1.5 text-border">·</span>
                    Updated {c.updated}
                  </div>
                </div>
                {/* Mode toggle */}
                <div className="flex items-center gap-1 p-0.5 bg-secondary border border-border rounded-md">
                  {[
                    { id: 'auto',   label: 'Dynamic', icon: 'repeat' },
                    { id: 'manual', label: 'Manual',  icon: 'edit'   },
                  ].map(opt => (
                    <button key={opt.id}
                      onClick={() => setCurrencies(prev => prev.map((p, i) => i === idx ? { ...p, mode: opt.id } : p))}
                      className={cn('h-7 px-2.5 rounded text-[11.5px] font-medium inline-flex items-center gap-1 transition-colors',
                        c.mode === opt.id ? 'bg-card text-foreground shadow-pb-1' : 'text-muted-foreground hover:text-foreground'
                      )}>
                      <Icon name={opt.icon} className="w-3 h-3" />
                      {opt.label}
                    </button>
                  ))}
                </div>
                {/* Manual rate input or dynamic status */}
                <div className="w-[150px]">
                  {c.mode === 'manual' ? (
                    <Input type="number" value={c.rate}
                      onChange={(e) => setCurrencies(prev => prev.map((p, i) => i === idx ? { ...p, rate: parseFloat(e.target.value) || 0 } : p))}
                      suffix={anchorMeta?.code} />
                  ) : (
                    <div className="h-9 rounded-md border border-border bg-secondary/40 px-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-income">
                        <span className="w-1.5 h-1.5 rounded-full bg-income animate-pulse" />
                        Live
                      </span>
                      <span className="text-[10.5px] text-muted-foreground mono truncate ml-2">{c.provider}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-[12px] text-muted-foreground">
              <Switch checked={autoSync} onChange={setAutoSync} />
              Auto-sync dynamic rates daily at 03:00
            </div>
            <div className="text-[11px] text-muted-foreground mono">Provider · frankfurter.app · ECB feed</div>
          </div>
        </Card>

        <div className="mt-3 p-3 rounded-md bg-amber-500/8 border border-amber-500/25 text-[12px] text-foreground/85 flex items-start gap-2.5">
          <Icon name="alert" className="w-3.5 h-3.5 mt-0.5 text-amber-500 flex-shrink-0" />
          <div>Switching anchor or changing manual rates retroactively converts every non-anchor transaction — past totals will shift accordingly.</div>
        </div>
      </section>

      {/* Password */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="lock" className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold tracking-tight">Security</h2>
        </div>
        <Card className="p-5 space-y-4">
          <div>
            <Label>Current password</Label>
            <Input type="password" placeholder="••••••••••••" icon="lock" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>New password</Label>
              <Input type="password" placeholder="At least 12 characters" />
            </div>
            <div>
              <Label>Confirm</Label>
              <Input type="password" placeholder="Repeat new password" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11.5px] text-muted-foreground">
            <span className="flex gap-0.5">
              <span className="w-6 h-1 rounded-full bg-income" />
              <span className="w-6 h-1 rounded-full bg-income" />
              <span className="w-6 h-1 rounded-full bg-income" />
              <span className="w-6 h-1 rounded-full bg-border" />
            </span>
            <span>Strong · estimated crack time: 47 years</span>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm">Cancel</Button>
            <Button size="sm" icon="check">Update password</Button>
          </div>
        </Card>
      </section>

      {/* LLM */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="sparkles" className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold tracking-tight">AI insights</h2>
        </div>
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium">Ollama endpoint</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5 mono">http://homelab.local:11434</div>
            </div>
            <Badge kind="income"><span className="w-1.5 h-1.5 rounded-full bg-income inline-block mr-1" />Connected</Badge>
          </div>
          <div className="h-px bg-border" />
          <div>
            <Label hint="3 models available locally">Default model</Label>
            <div className="space-y-2">
              {[
                { id: 'llama3.1:8b',  size: '4.7 GB', desc: 'Fast, lean. Default for monthly summaries.' },
                { id: 'mistral:7b',   size: '4.1 GB', desc: 'Tight, terse. Good for shorter responses.' },
                { id: 'qwen2.5:14b',  size: '8.7 GB', desc: 'Slower, deeper analysis. Use sparingly.' },
              ].map(m => (
                <button key={m.id} onClick={() => setModel(m.id)}
                  className={cn('w-full text-left p-3 rounded-md border transition-colors flex items-center gap-3',
                    model === m.id ? 'border-ring/60 bg-accent/40' : 'border-border bg-transparent hover:bg-accent/30'
                  )}>
                  <span className={cn('w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0',
                    model === m.id ? 'border-primary' : 'border-border'
                  )}>
                    {model === m.id && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-medium mono">{m.id}</span>
                      <span className="text-[11px] text-muted-foreground">· {m.size}</span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground mt-0.5">{m.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-[12px] text-muted-foreground inline-flex items-center gap-2">
              <Switch checked={true} onChange={() => {}} />
              Auto-generate on the 1st of each month
            </div>
            <Button size="sm" icon="check">Save changes</Button>
          </div>
        </Card>
      </section>

      {/* About */}
      <section>
        <Card className="p-5 grid grid-cols-3 gap-5 text-[12px]">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Version</div>
            <div className="mono text-foreground/85 mt-1">v0.4.2 · 12 May 2026</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Database size</div>
            <div className="mono text-foreground/85 mt-1">2.1 MB · 1,847 rows</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Last backup</div>
            <div className="mono text-foreground/85 mt-1">18 May 03:00 · auto</div>
          </div>
        </Card>
      </section>
    </div>
  );
};

window.Settings = Settings;
