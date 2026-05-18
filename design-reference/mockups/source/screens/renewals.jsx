// Upcoming Renewals — dedicated view of next 30/60/90 days.

const Renewals = () => {
  const { recurring, fxRates, fmtCur, fmtHUF, fmtDate, catBy } = PB_DATA;
  const [horizon, setHorizon] = React.useState(60);
  const [grouping, setGrouping] = React.useState('week');

  const today = new Date('2026-05-18');
  const hufVal = (r) => r.cur === 'USD' ? r.amt * fxRates.HUF_per_USD : r.cur === 'EUR' ? r.amt * fxRates.HUF_per_EUR : r.amt;

  const upcoming = recurring
    .filter(r => r.kind === 'expense')
    .map(r => ({ ...r, daysAway: Math.round((new Date(r.next+'T00:00') - today) / 86400000) }))
    .filter(r => r.daysAway >= 0 && r.daysAway <= horizon)
    .sort((a, b) => a.daysAway - b.daysAway);

  const total = upcoming.reduce((s, r) => s + hufVal(r), 0);

  // Group by week
  const groupKey = (r) => {
    const d = new Date(r.next+'T00:00');
    if (grouping === 'month') return d.toLocaleDateString('en-GB',{month:'long', year:'numeric'});
    const start = new Date(d); start.setDate(d.getDate() - d.getDay() + 1);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString('en-GB',{day:'2-digit', month:'short'})} – ${end.toLocaleDateString('en-GB',{day:'2-digit', month:'short'})}`;
  };
  const groups = upcoming.reduce((acc, r) => { (acc[groupKey(r)] = acc[groupKey(r)] || []).push(r); return acc; }, {});

  return (
    <div className="px-8 py-6 space-y-5 max-w-[1240px] mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Upcoming renewals</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">{upcoming.length} renewals · {fmtHUF(total)} due in next {horizon} days</div>
        </div>
        <div className="flex items-center gap-2">
          <Segmented options={[{label:'30d', value:30},{label:'60d', value:60},{label:'90d', value:90}]} value={horizon} onChange={setHorizon} />
          <Segmented options={[{label:'By week', value:'week'},{label:'By month', value:'month'}]} value={grouping} onChange={setGrouping} />
        </div>
      </div>

      {/* Timeline strip */}
      <Card className="p-5">
        <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-3 font-medium">Cash-out timeline</div>
        <div className="relative h-14">
          <div className="absolute top-7 left-0 right-0 h-px bg-border" />
          {upcoming.map((r, i) => {
            const pct = (r.daysAway / horizon) * 100;
            const huf = hufVal(r);
            return (
              <div key={r.id} className="absolute -translate-x-1/2 group" style={{ left: `${pct}%`, top: 0 }}>
                <div className="w-0.5 bg-border h-3 mx-auto" />
                <div className="w-2.5 h-2.5 rounded-full mx-auto" style={{ background: catBy[r.cat].color, boxShadow: '0 0 0 3px hsl(var(--background))' }} />
                <div className="text-[9.5px] text-muted-foreground mono text-center mt-1 whitespace-nowrap absolute left-1/2 -translate-x-1/2 group-hover:text-foreground">{r.daysAway}d</div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-2 py-1 text-[11px] whitespace-nowrap shadow-pb-2 z-10">
                  {r.name} · {Math.round(huf).toLocaleString('hu-HU').replace(/,/g,' ')} Ft
                </div>
              </div>
            );
          })}
          <div className="absolute -bottom-0.5 left-0 text-[10px] text-muted-foreground mono">Today</div>
          <div className="absolute -bottom-0.5 right-0 text-[10px] text-muted-foreground mono">+{horizon}d</div>
        </div>
      </Card>

      {/* Grouped list */}
      <div className="space-y-5">
        {Object.entries(groups).map(([k, list]) => {
          const subTotal = list.reduce((s, r) => s + hufVal(r), 0);
          return (
            <div key={k}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold tracking-tight">{k}</h3>
                  <span className="text-[11px] text-muted-foreground">· {list.length} renewals</span>
                </div>
                <div className="text-[12px] tabular text-foreground/85">{fmtHUF(subTotal)}</div>
              </div>
              <Card className="divide-y divide-border overflow-hidden">
                {list.map(r => {
                  const huf = hufVal(r);
                  return (
                    <div key={r.id} className="grid grid-cols-[60px_1fr_140px_140px] items-center px-4 py-3 hover:bg-accent/40 transition-colors">
                      <div className="text-center">
                        <div className="text-[9px] uppercase mono text-muted-foreground leading-none">{new Date(r.next+'T00:00').toLocaleDateString('en-GB',{month:'short'})}</div>
                        <div className="text-[15px] font-semibold tabular leading-tight mt-0.5">{new Date(r.next+'T00:00').getDate()}</div>
                      </div>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: catBy[r.cat].color }} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium truncate">{r.name}</div>
                          <div className="text-[11px] text-muted-foreground capitalize">{r.cycle} · {catBy[r.cat].name}{r.installment ? ` · ${r.installment.paid}/${r.installment.total}` : ''}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <AmountDisplay value={r.amt} currency={r.cur} tone="expense" size="sm" />
                      </div>
                      <div className="text-right">
                        {r.cur !== 'HUF' && (<div className="text-[11.5px] text-muted-foreground tabular">≈ {fmtHUF(huf)}</div>)}
                        <div className="text-[10.5px] text-muted-foreground/70">{r.daysAway === 0 ? 'today' : `in ${r.daysAway}d`}</div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
};

window.Renewals = Renewals;
