// Categories — small management screen with color swatches.

const Categories = () => {
  const { categories, transactions, fxRates } = PB_DATA;
  const [editing, setEditing] = React.useState(null);

  // Count tx per category
  const counts = transactions.reduce((acc, t) => { acc[t.cat] = (acc[t.cat]||0)+1; return acc; }, {});
  const totals = transactions.reduce((acc, t) => {
    const huf = t.cur === 'USD' ? t.amt * fxRates.HUF_per_USD : t.cur === 'EUR' ? t.amt * fxRates.HUF_per_EUR : t.amt;
    acc[t.cat] = (acc[t.cat]||0) + Math.abs(huf);
    return acc;
  }, {});

  const groups = ['income', 'expense', 'savings'];
  const kindLabels = { income: 'Income', expense: 'Expense', savings: 'Savings' };
  const kindTone = { income: 'income', expense: 'expense', savings: 'savings' };

  return (
    <div className="px-8 py-6 max-w-[960px] mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Categories</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">{categories.length} categories · 3 kinds</div>
        </div>
        <Button size="md" icon="plus">New category</Button>
      </div>

      {groups.map(g => {
        const list = categories.filter(c => c.kind === g);
        return (
          <div key={g}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: `hsl(var(--${kindTone[g]}))` }} />
              <h2 className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground font-medium">{kindLabels[g]}</h2>
              <span className="mono text-[11px] text-muted-foreground/70">{list.length}</span>
              <div className="flex-1 h-px bg-border ml-2" />
            </div>
            <Card className="divide-y divide-border overflow-hidden">
              {list.map(c => (
                <div key={c.id} className="grid grid-cols-[44px_1fr_120px_140px_80px] items-center px-4 py-3 group hover:bg-accent/40 transition-colors">
                  <div className="flex items-center">
                    <span className="w-7 h-7 rounded-md border border-border flex items-center justify-center" style={{ background: `${c.color}1f` }}>
                      <span className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                    </span>
                  </div>
                  <div>
                    <div className="text-[13.5px] font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground mono">{c.color.toUpperCase()}</div>
                  </div>
                  <div className="text-[12px] text-muted-foreground">{counts[c.id] || 0} txns</div>
                  <div className="text-right tabular text-[12.5px] text-foreground/85">
                    {totals[c.id] ? Math.round(totals[c.id]).toLocaleString('hu-HU').replace(/,/g,' ') + ' Ft' : <span className="text-muted-foreground">—</span>}
                  </div>
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"><Icon name="edit" className="w-3.5 h-3.5" /></button>
                    <button className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Icon name="trash" className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-2.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition cursor-pointer flex items-center gap-2">
                <Icon name="plus" className="w-3.5 h-3.5" />
                Add {kindLabels[g].toLowerCase()} category
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
};

window.Categories = Categories;
