// Recurring rules — list of subscriptions and recurring incomes.

const Recurring = ({ onAddRule }) => {
  const { recurring, fxRates, fmtCur, fmtHUF, fmtDate, catBy } = PB_DATA;
  const [tab, setTab] = React.useState('expense');

  const list = recurring.filter(r => r.kind === tab).sort((a, b) => a.next.localeCompare(b.next));

  const hufVal = (r) => r.cur === 'USD' ? r.amt * fxRates.HUF_per_USD : r.cur === 'EUR' ? r.amt * fxRates.HUF_per_EUR : r.amt;
  const monthlyTotal = recurring.filter(r => r.kind === 'expense' && r.cycle === 'monthly').reduce((s, r) => s + hufVal(r), 0);
  const annualTotal = recurring.filter(r => r.kind === 'expense' && r.cycle === 'annual').reduce((s, r) => s + hufVal(r), 0);
  const incomeMonthly = recurring.filter(r => r.kind === 'income' && r.cycle === 'monthly').reduce((s, r) => s + hufVal(r), 0);

  return (
    <div className="px-8 py-6 space-y-5 max-w-[1240px] mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Recurring rules</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">Subscriptions, installments, and recurring income.</div>
        </div>
        <Button size="md" icon="plus" onClick={onAddRule}>New rule</Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Monthly outflow</div>
          <div className="mt-1.5"><AmountDisplay value={monthlyTotal} tone="expense" size="lg" /></div>
          <div className="text-[11px] text-muted-foreground mt-1">10 monthly rules</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Annual outflow</div>
          <div className="mt-1.5"><AmountDisplay value={annualTotal} tone="expense" size="lg" /></div>
          <div className="text-[11px] text-muted-foreground mt-1">3 annual rules</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Annualised total</div>
          <div className="mt-1.5"><AmountDisplay value={monthlyTotal*12 + annualTotal} tone="neutral" size="lg" /></div>
          <div className="text-[11px] text-muted-foreground mt-1">All subscriptions / 12 mo</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Monthly income</div>
          <div className="mt-1.5"><AmountDisplay value={incomeMonthly} tone="income" size="lg" /></div>
          <div className="text-[11px] text-muted-foreground mt-1">2 recurring sources</div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Segmented
          options={[
            {label:`Expenses · ${recurring.filter(r=>r.kind==='expense').length}`, value:'expense'},
            {label:`Income · ${recurring.filter(r=>r.kind==='income').length}`, value:'income'},
          ]}
          value={tab} onChange={setTab}
        />
        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <Icon name="filter" className="w-3.5 h-3.5" />
          <span>Sort by next due</span>
        </div>
      </div>

      {/* Grid of recurring cards */}
      <div className="grid grid-cols-3 gap-3">
        {list.map(r => {
          const huf = hufVal(r);
          const today = new Date('2026-05-18');
          const days = Math.round((new Date(r.next+'T00:00') - today) / 86400000);
          const inst = r.installment;
          return (
            <Card key={r.id} className="p-4 group cursor-pointer hover:border-ring/40 transition-colors" hover>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-md border border-border flex items-center justify-center flex-shrink-0"
                       style={{ background: `${catBy[r.cat].color}18`, color: catBy[r.cat].color }}>
                    <Icon name={r.cycle === 'annual' ? 'calendar' : 'repeat'} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium truncate">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">{r.cycle} · {catBy[r.cat].name}</div>
                  </div>
                </div>
                <button className="text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100">
                  <Icon name="more" className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <AmountDisplay value={r.amt} currency={r.cur} tone={r.kind === 'income' ? 'income' : 'expense'} size="md" />
                {r.cur !== 'HUF' && (
                  <div className="text-[10.5px] text-muted-foreground tabular">≈ {fmtHUF(huf)}</div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  <Icon name="calendar" className="w-3 h-3" />
                  Next · {fmtDate(r.next, {short:true})}
                </span>
                <span className={cn('mono', days <= 7 ? 'text-amber-400' : 'text-muted-foreground')}>
                  in {days}d
                </span>
              </div>

              {inst && (
                <div className="mt-3 p-2.5 rounded-md bg-amber-500/8 border border-amber-500/20">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-amber-400 font-medium inline-flex items-center gap-1.5"><Icon name="alert" className="w-3 h-3" />Installment plan</span>
                    <span className="mono text-amber-400">{inst.paid}/{inst.total}</span>
                  </div>
                  <div className="h-1.5 bg-amber-500/15 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(inst.paid/inst.total)*100}%` }} />
                  </div>
                  <div className="text-[10.5px] text-amber-400/80 mt-1.5">Ends {fmtDate(inst.endsOn)} · {inst.total - inst.paid} payments left</div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

window.Recurring = Recurring;
