// Transactions — list with filters, search, pagination. Click row → drawer to edit.

const Transactions = ({ onAddTx, onEditTx }) => {
  const { transactions, catBy, fmtCur, fmtDate, fmtHUF, fxRates } = PB_DATA;
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [catFilter, setCatFilter] = React.useState('all');

  const filtered = transactions.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (catFilter !== 'all' && t.cat !== catFilter) return false;
    if (search && !t.desc.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  // group by date
  const groups = filtered.reduce((acc, t) => {
    (acc[t.date] = acc[t.date] || []).push(t);
    return acc;
  }, {});

  const cats = [{id:'all', name:'All categories'}, ...Object.values(catBy)];

  return (
    <div className="px-8 py-6 space-y-5 max-w-[1240px] mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Transactions</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">{filtered.length} transactions · May 2026</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" icon="filter">Export CSV</Button>
          <Button size="md" icon="plus" onClick={onAddTx}>Add transaction</Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="p-3 flex items-center gap-2">
        <Input placeholder="Search transactions…" icon="search" value={search} onChange={(e)=>setSearch(e.target.value)} className="flex-1 max-w-sm" />
        <Segmented
          options={[
            {label:'All', value:'all'},
            {label:'Income', value:'income'},
            {label:'Expense', value:'expense'},
            {label:'Savings', value:'savings'},
          ]}
          value={typeFilter} onChange={setTypeFilter}
        />
        <div className="relative">
          <select
            value={catFilter}
            onChange={(e)=>setCatFilter(e.target.value)}
            className="appearance-none h-8 pl-3 pr-7 bg-secondary border border-border rounded-md text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/60"
          >
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Icon name="chevron-down" className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        </div>
        <Button variant="ghost" size="md" icon="calendar">May 2026</Button>
        <div className="ml-auto text-[11.5px] text-muted-foreground mono">
          Net: <span className="text-foreground font-medium">{fmtHUF(filtered.reduce((s,t)=>{
            const huf = t.cur === 'USD' ? t.amt * fxRates.HUF_per_USD : t.cur === 'EUR' ? t.amt * fxRates.HUF_per_EUR : t.amt;
            return s + huf;
          }, 0), {signed:true})}</span>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[100px_1fr_180px_120px_140px_40px] px-5 py-2.5 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium border-b border-border bg-secondary/30">
          <div>Date</div>
          <div>Description</div>
          <div>Category</div>
          <div className="text-right">Amount</div>
          <div className="text-right">In HUF</div>
          <div></div>
        </div>
        {Object.entries(groups).map(([date, list]) => (
          <div key={date}>
            <div className="px-5 py-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground bg-secondary/15 border-b border-border flex items-center justify-between">
              <span>{fmtDate(date)} · {PB_DATA.dayOfWeek(date)}</span>
              <span className="mono">{list.length} {list.length===1?'item':'items'}</span>
            </div>
            {list.map(t => {
              const huf = t.cur === 'USD' ? t.amt * fxRates.HUF_per_USD : t.cur === 'EUR' ? t.amt * fxRates.HUF_per_EUR : t.amt;
              const tone = t.type === 'income' ? 'income' : t.type === 'savings' ? 'savings' : 'expense';
              return (
                <button
                  key={t.id}
                  onClick={() => onEditTx(t)}
                  className="w-full grid grid-cols-[100px_1fr_180px_120px_140px_40px] items-center px-5 py-3 border-b border-border last:border-b-0 hover:bg-accent/50 text-left transition-colors"
                >
                  <div className="mono text-[12px] text-muted-foreground">{new Date(t.date+'T00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</div>
                  <div className="text-[13px] flex items-center gap-2 min-w-0">
                    <span className="truncate">{t.desc}</span>
                    {t.recurring && <span title="Linked to recurring rule" className="text-muted-foreground"><Icon name="repeat" className="w-3 h-3" /></span>}
                  </div>
                  <div><CategoryBadge id={t.cat} /></div>
                  <div className="text-right">
                    <AmountDisplay value={t.amt} currency={t.cur} tone={tone} size="sm" signed />
                  </div>
                  <div className="text-right tabular text-[12px] text-muted-foreground">
                    {Math.round(Math.abs(huf)).toLocaleString('hu-HU').replace(/,/g,' ')} Ft
                  </div>
                  <div className="text-muted-foreground/60"><Icon name="chevron-right" className="w-3.5 h-3.5" /></div>
                </button>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <Empty icon="search" title="No transactions match" body="Try adjusting filters or clearing the search."
            action={<Button variant="outline" size="sm" onClick={() => { setSearch(''); setTypeFilter('all'); setCatFilter('all'); }}>Reset filters</Button>}
          />
        )}
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <div>Showing 1–{filtered.length} of {filtered.length}</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon="chevron-left" disabled>Prev</Button>
          <div className="mono px-2">Page 1 / 1</div>
          <Button variant="ghost" size="sm" iconAfter="chevron-right" disabled>Next</Button>
        </div>
      </div>
    </div>
  );
};

window.Transactions = Transactions;
