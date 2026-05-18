// Add/Edit Transaction — drawer form. Must feel fast.

const AddTransaction = ({ open, onClose, editing, onSubmit }) => {
  const { categories, recurring, fxRates, fmtHUF } = PB_DATA;
  const [type, setType] = React.useState(editing?.type || 'expense');
  const [date, setDate] = React.useState(editing?.date || '2026-05-18');
  const [desc, setDesc] = React.useState(editing?.desc || '');
  const [amt, setAmt] = React.useState(editing ? Math.abs(editing.amt).toString() : '');
  const [cur, setCur] = React.useState(editing?.cur || 'HUF');
  const [cat, setCat] = React.useState(editing?.cat || 'food');
  const [linked, setLinked] = React.useState(editing?.recurring || '');

  React.useEffect(() => {
    if (editing) {
      setType(editing.type); setDate(editing.date); setDesc(editing.desc);
      setAmt(Math.abs(editing.amt).toString()); setCur(editing.cur); setCat(editing.cat);
      setLinked(editing.recurring || '');
    } else {
      setType('expense'); setDate('2026-05-18'); setDesc(''); setAmt(''); setCur('HUF'); setCat('food'); setLinked('');
    }
  }, [editing, open]);

  const eligibleCats = categories.filter(c => c.kind === type);
  React.useEffect(() => {
    if (!eligibleCats.find(c => c.id === cat)) setCat(eligibleCats[0]?.id);
  }, [type]);

  const amtNum = parseFloat(amt || '0') || 0;
  const hufEquiv = cur === 'USD' ? amtNum * fxRates.HUF_per_USD : cur === 'EUR' ? amtNum * fxRates.HUF_per_EUR : amtNum;

  return (
    <Sheet open={open} onClose={onClose}
      title={editing ? 'Edit transaction' : 'New transaction'}
      subtitle={editing ? `id · ${editing.id}` : 'Press ⌘↵ to save'}
    >
      <div className="p-5 space-y-4">
        {/* Type segmented */}
        <div>
          <Label>Type</Label>
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-secondary border border-border rounded-md">
            {[
              {v:'expense', l:'Expense', tone:'expense'},
              {v:'income',  l:'Income',  tone:'income'},
              {v:'savings', l:'Savings', tone:'savings'},
            ].map(o => (
              <button key={o.v} onClick={() => setType(o.v)}
                className={cn('h-8 text-[12.5px] font-medium rounded-[5px] transition-colors flex items-center justify-center gap-1.5',
                  type === o.v ? `bg-card text-${o.tone} shadow-pb-1` : 'text-muted-foreground hover:text-foreground')}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: `hsl(var(--${o.tone}))` }} />
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {/* Amount + currency */}
        <div>
          <Label hint="HUF equivalent shown below">Amount</Label>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <Input
              type="text"
              inputMode="decimal"
              value={amt}
              onChange={(e) => setAmt(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="0"
              className="text-right"
            />
            <div className="relative">
              <select value={cur} onChange={(e) => setCur(e.target.value)}
                className="appearance-none h-9 w-full pl-3 pr-7 bg-transparent border border-input rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/60">
                <option>HUF</option>
                <option>EUR</option>
                <option>USD</option>
              </select>
              <Icon name="chevron-down" className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          {cur !== 'HUF' && (
            <div className="mt-1.5 text-[11.5px] text-muted-foreground mono">
              ≈ {fmtHUF(hufEquiv)} at 1 {cur} = {(cur==='USD'?fxRates.HUF_per_USD:fxRates.HUF_per_EUR).toFixed(2)} HUF
            </div>
          )}
        </div>

        {/* Date */}
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} icon="calendar" />
        </div>

        {/* Description */}
        <div>
          <Label>Description</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Spar weekly groceries" />
        </div>

        {/* Category */}
        <div>
          <Label hint={`${eligibleCats.length} ${type} categories`}>Category</Label>
          <div className="flex flex-wrap gap-1.5">
            {eligibleCats.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)}
                className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] transition-colors',
                  cat === c.id ? 'border-ring/60 bg-accent text-foreground' : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                )}>
                <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Link recurring */}
        <div>
          <Label hint="Optional">Link to recurring rule</Label>
          <div className="relative">
            <select value={linked} onChange={(e) => setLinked(e.target.value)}
              className="appearance-none h-9 w-full pl-3 pr-7 bg-transparent border border-input rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/60">
              <option value="">— None —</option>
              {recurring.filter(r => r.kind === type).map(r => (
                <option key={r.id} value={r.id}>{r.name} · {r.cycle}</option>
              ))}
            </select>
            <Icon name="chevron-down" className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="p-5 border-t border-border flex items-center justify-between bg-secondary/15">
        <div className="text-[11.5px] text-muted-foreground">
          {editing ? <span className="inline-flex items-center gap-1.5"><Icon name="check" className="w-3.5 h-3.5 text-income" />Autosaved drafts</span> : 'New entry'}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
          <Button size="md" icon="check" onClick={() => onSubmit?.({ type, date, desc, amt: amtNum, cur, cat, recurring: linked })}>
            {editing ? 'Save changes' : 'Add transaction'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};

window.AddTransaction = AddTransaction;
