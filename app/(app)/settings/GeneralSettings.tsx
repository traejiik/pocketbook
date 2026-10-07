'use client';

import { useState, useTransition, useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Check, AlertTriangle, RefreshCw, Plus, Trash2, Edit, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import { notify } from '@/lib/ui-notify';
import { cn } from '@/lib/utils';
import { fmtDate, fmtAnchor, monthKeyOf } from '@/lib/format';
import {
  setAnchorCurrency,
  setExchangeRate,
  addTrackedCurrency,
  removeTrackedCurrency,
  setFxAutoSync,
  setOpeningBalance,
  clearOpeningBalance,
  forceFxSync,
} from '@/server-actions/settings';

type Rate = {
  id: string;
  from: string;
  to: string;
  rate: number;
  mode: 'AUTO' | 'MANUAL';
  provider: string | null;
  updatedAt: string;
};

type Props = {
  anchorCurrency: string;
  exchangeRates: Rate[];
  fxAutoSync: boolean;
  openingBalance: number;
  openingBalanceCurrency: string;
  /** `YYYY-MM`, or null when carry-over has no configured starting point. */
  openingBalanceMonth: string | null;
};

const ANCHOR_OPTIONS = [
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', flag: '🇭🇺' },
  { code: 'USD', symbol: '$',  name: 'US Dollar',        flag: '🇺🇸' },
  { code: 'EUR', symbol: '€',  name: 'Euro',             flag: '🇪🇺' },
  { code: 'GBP', symbol: '£',  name: 'British Pound',    flag: '🇬🇧' },
];

export function GeneralSettings({
  anchorCurrency: initialAnchor,
  exchangeRates: initialRates,
  fxAutoSync: initialAutoSync,
  openingBalance: initialOpeningBalance,
  openingBalanceCurrency: initialOpeningCurrency,
  openingBalanceMonth: initialOpeningMonth,
}: Props) {
  const [anchor, setAnchor] = useState(initialAnchor);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [rates, setRates] = useState(initialRates);

  const newCurrencyId = useId();

  // For each unordered pair {A,B} keep only the record with the higher rate
  // so we never show both EUR→HUF and HUF→EUR, and the base is always the stronger currency.
  const displayRates = rates.reduce<typeof rates>((acc, r) => {
    const key = [r.from, r.to].sort().join('-');
    const existing = acc.findIndex(x => [x.from, x.to].sort().join('-') === key);
    if (existing === -1) return [...acc, r];
    if (r.rate > acc[existing].rate) {
      const next = [...acc];
      next[existing] = r;
      return next;
    }
    return acc;
  }, []);
  const [autoSync, setAutoSync] = useState(initialAutoSync);
  // Opening balance form. Strings while editing so a half-typed amount is not
  // coerced; parsed once on Save.
  const [openingAmount, setOpeningAmount] = useState(
    initialOpeningMonth ? String(initialOpeningBalance) : '',
  );
  const [openingCurrency, setOpeningCurrency] = useState(initialOpeningCurrency);
  // Stored as `YYYY-MM`; the shared DatePicker works in whole days, so it shows
  // the 1st of that month and any picked day is reduced back to its month.
  const [openingMonth, setOpeningMonth] = useState(initialOpeningMonth ?? '');
  const [savedOpening, setSavedOpening] = useState<{ amount: number; currency: string; month: string } | null>(
    initialOpeningMonth ? { amount: initialOpeningBalance, currency: initialOpeningCurrency, month: initialOpeningMonth } : null,
  );
  const [addCurrencyOpen, setAddCurrencyOpen] = useState(false);
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Re-sync local rate state when server props update after router.refresh()
  useEffect(() => { setRates(initialRates); }, [initialRates]);

  const anchorMeta = ANCHOR_OPTIONS.find(c => c.code === anchor);

  const handleAnchorClick = (code: string) => {
    if (code === anchor) return;
    setPendingAnchor(code);
  };

  const openingAmountNumber = Number(openingAmount.replace(/\s/g, '').replace(',', '.'));
  const openingMonthLabel = (key: string) =>
    new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const openingValid =
    openingAmount.trim() !== '' && Number.isFinite(openingAmountNumber) && /^\d{4}-(0[1-9]|1[0-2])$/.test(openingMonth);
  const openingDirty =
    !savedOpening ||
    savedOpening.amount !== openingAmountNumber ||
    savedOpening.currency !== openingCurrency ||
    savedOpening.month !== openingMonth;

  const handleOpeningSave = () => {
    if (!openingValid) return;
    const next = { amount: openingAmountNumber, currency: openingCurrency, month: openingMonth };
    startTransition(async () => {
      await setOpeningBalance(next);
      setSavedOpening(next);
      notify.success('Opening balance saved');
      router.refresh();
    });
  };

  const handleOpeningClear = () => {
    startTransition(async () => {
      await clearOpeningBalance();
      setSavedOpening(null);
      setOpeningAmount('');
      setOpeningMonth('');
      notify.success('Opening balance cleared');
      router.refresh();
    });
  };

  const confirmAnchorChange = () => {
    if (!pendingAnchor) return;
    const next = pendingAnchor;
    startTransition(async () => {
      await setAnchorCurrency(next);
      setAnchor(next);
      setPendingAnchor(null);
      notify.success(`Anchor currency changed to ${next}`);
    });
  };

  const handleRateChange = (idx: number, value: number) => {
    setRates(prev => prev.map((r, i) => i === idx ? { ...r, rate: value } : r));
  };

  const handleModeToggle = (idx: number, mode: 'AUTO' | 'MANUAL') => {
    const r = rates[idx];
    if (!r) return;
    setRates(prev => prev.map((p, i) => i === idx ? { ...p, mode } : p));
    startTransition(async () => {
      await setExchangeRate({ from: r.from, to: r.to, rate: r.rate, mode });
    });
  };

  const handleRateSave = (idx: number) => {
    const r = rates[idx];
    if (!r) return;
    startTransition(async () => {
      await setExchangeRate({ from: r.from, to: r.to, rate: r.rate, mode: r.mode });
      notify.success(`Rate for ${r.from} updated`);
    });
  };

  const handleAddCurrency = () => {
    const code = newCurrencyCode.trim().toUpperCase();
    if (!code || code.length !== 3) { toast.error('Enter a valid 3-letter currency code'); return; }
    startTransition(async () => {
      await addTrackedCurrency(code);
      setAddCurrencyOpen(false);
      setNewCurrencyCode('');
      notify.success(`${code} added`);
    });
  };

  const handleRemoveCurrency = (from: string, to: string) => {
    startTransition(async () => {
      await removeTrackedCurrency(from, to);
      // Remove both directions from local state
      setRates(prev => prev.filter(r =>
        !((r.from === from && r.to === to) || (r.from === to && r.to === from))
      ));
      notify.success(`${from} removed`);
    });
  };

  const handleAutoSyncToggle = (val: boolean) => {
    setAutoSync(val);
    startTransition(async () => { await setFxAutoSync(val); });
  };

  return (
    <>
      <div className="motion-stagger space-y-7">
        {/* ── Currencies & FX rates ──────────────────────────────────── */}
        <section id="currencies">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[14px] font-semibold tracking-tight">Currencies & exchange rates</h2>
          </div>

          {/* Anchor selector */}
          <div className="calm-card p-6 mb-3">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[13px] font-semibold tracking-tight">Anchor currency</div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5">Your primary currency. All totals across the app are normalised to this.</div>
              </div>
              <span className="text-[10.5px] mono uppercase tracking-wider text-muted-foreground">Default</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ANCHOR_OPTIONS.map(c => (
                <button
                  key={c.code}
                  onClick={() => handleAnchorClick(c.code)}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    anchor === c.code
                      ? 'border-primary/60 bg-primary/8 ring-2 ring-primary/20'
                      : 'border-border bg-transparent hover:bg-accent/40',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[16px] leading-none">{c.symbol}</span>
                    {anchor === c.code && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <div className="mt-2.5 text-[13px] font-semibold mono tracking-tight">{c.code}</div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5 whitespace-nowrap">{c.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Opening balance — starting point for month-to-month carry-over */}
          <div className="calm-card p-6 mb-3">
            <div className="mb-4">
              <div className="text-[13px] font-semibold tracking-tight">Opening balance</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                The balance you held at the start of the effective month. Each month then carries the previous month&apos;s net forward; earlier transactions are not counted again.
              </div>
            </div>
            {/* Same amount/currency/date composition as the transaction sheet */}
            <div className="grid grid-cols-[1fr_88px] sm:grid-cols-[3fr_1fr_1fr] gap-x-2 gap-y-4 sm:gap-x-3">
              <div className="space-y-1.5">
                <Label htmlFor="opening-amount">Amount</Label>
                <Input
                  id="opening-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className="text-right tabular"
                  value={openingAmount}
                  onChange={e => setOpeningAmount(e.target.value.replace(/[^0-9.,\s]/g, ''))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opening-currency">Currency</Label>
                <Select value={openingCurrency} onValueChange={v => v && setOpeningCurrency(v)}>
                  <SelectTrigger id="opening-currency" aria-label="Opening balance currency" className="h-9! w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANCHOR_OPTIONS.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label htmlFor="opening-month">Effective from</Label>
                <DatePicker
                  id="opening-month"
                  placeholder="Pick a month"
                  value={openingMonth ? `${openingMonth}-01` : ''}
                  onChange={v => {
                    const [y, m, d] = v.split('-').map(Number);
                    setOpeningMonth(monthKeyOf(new Date(y, m - 1, d)));
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
              <div className="text-[11.5px] text-muted-foreground tabular">
                {savedOpening
                  ? <>Carry-over starts from <span className="text-foreground font-medium">{fmtAnchor(savedOpening.amount, savedOpening.currency)}</span> on 1 {openingMonthLabel(savedOpening.month)}.</>
                  : <>Without a starting point, carry-over begins at zero from your first logged month.</>}
              </div>
              <div className="flex items-center gap-2">
                {savedOpening && (
                  <Button variant="ghost" size="sm" onClick={handleOpeningClear} disabled={isPending}>
                    Clear
                  </Button>
                )}
                <Button size="sm" onClick={handleOpeningSave} disabled={isPending || !openingValid || !openingDirty}>
                  <Check className="w-3.5 h-3.5 mr-1.5" />Save
                </Button>
              </div>
            </div>
          </div>

          {/* Tracked currencies */}
          <div className="calm-card p-6">
            <div className="flex items-baseline justify-between mb-1">
              <div>
                <div className="text-[13px] font-semibold tracking-tight">Tracked currencies</div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5">Rates expressed as 1 unit → {anchorMeta?.code}.</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAddCurrencyOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />Add currency
              </Button>
            </div>

            <div className="mt-4 -mx-1 divide-y divide-border">
              {displayRates.map((r) => {
                const idx = rates.indexOf(r);
                return (
                <div key={r.id}>
                  {/* Main row */}
                  <div className="px-1 py-3.5 grid grid-cols-[auto_1fr_auto] lg:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3">
                    {/* Code chip */}
                    <div className="w-12 h-12 rounded-lg border border-border bg-secondary/40 flex flex-col items-center justify-center shrink-0">
                      <div className="text-[14px] font-bold mono leading-none">{r.from}</div>
                      <div className="text-[11px] text-muted-foreground leading-none mt-1">→{r.to}</div>
                    </div>
                    {/* Rate info */}
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{r.from}</div>
                      <div className="text-[11px] text-muted-foreground mono mt-0.5">
                        1 {r.from} = <span className="tabular text-foreground/80">{r.rate.toFixed(2)}</span> {r.to}
                        <span className="mx-1.5 text-border">·</span>
                        Updated {fmtDate(r.updatedAt)}
                      </div>
                    </div>
                    {/* Mode toggle — desktop */}
                    <div className="hidden lg:flex items-center gap-0.5 p-0.5 bg-secondary border border-border rounded-md">
                      {(['AUTO', 'MANUAL'] as const).map(opt => (
                        <button
                          key={opt}
                          onClick={() => handleModeToggle(idx, opt)}
                          className={cn(
                            'h-7 px-2.5 rounded text-[11.5px] font-medium inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
                            r.mode === opt ? 'bg-card text-foreground shadow-pb-1' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {opt === 'AUTO' ? <Repeat className="w-3 h-3" /> : <Edit className="w-3 h-3" />}
                          {opt === 'AUTO' ? 'Dynamic' : 'Manual'}
                        </button>
                      ))}
                    </div>
                    {/* Rate value / live indicator — desktop */}
                    <div className="hidden lg:block w-[150px]">
                      {r.mode === 'MANUAL' ? (
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            aria-label={`Manual rate ${r.from} to ${r.to}`}
                            value={r.rate}
                            onChange={e => handleRateChange(idx, parseFloat(e.target.value) || 0)}
                            className="h-9 text-[12px] mono"
                          />
                          <Button variant="outline" size="sm" className="h-9 px-2" onClick={() => handleRateSave(idx)}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="h-9 rounded-md border border-border bg-secondary/40 px-3 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-income">
                            <span className="w-1.5 h-1.5 rounded-full bg-income animate-pulse" />
                            Live
                          </span>
                          <span className="text-[10.5px] text-muted-foreground mono truncate ml-2">{r.provider ?? 'auto'}</span>
                        </div>
                      )}
                    </div>
                    {/* Remove */}
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveCurrency(r.from, r.to)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {/* Mobile-only mode + rate row */}
                  <div className="lg:hidden px-1 pb-3.5 flex flex-col gap-2">
                    <div className="flex items-center gap-0.5 p-0.5 bg-secondary border border-border rounded-md self-start">
                      {(['AUTO', 'MANUAL'] as const).map(opt => (
                        <button
                          key={opt}
                          onClick={() => handleModeToggle(idx, opt)}
                          className={cn(
                            'h-7 px-2.5 rounded text-[11.5px] font-medium inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
                            r.mode === opt ? 'bg-card text-foreground shadow-pb-1' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {opt === 'AUTO' ? <Repeat className="w-3 h-3" /> : <Edit className="w-3 h-3" />}
                          {opt === 'AUTO' ? 'Dynamic' : 'Manual'}
                        </button>
                      ))}
                    </div>
                    <div>
                      {r.mode === 'MANUAL' ? (
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            aria-label={`Manual rate ${r.from} to ${r.to}`}
                            value={r.rate}
                            onChange={e => handleRateChange(idx, parseFloat(e.target.value) || 0)}
                            className="h-9 text-base mono"
                          />
                          <Button variant="outline" size="sm" className="h-9 px-2 shrink-0" onClick={() => handleRateSave(idx)}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="h-9 rounded-md border border-border bg-secondary/40 px-3 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-income">
                            <span className="w-1.5 h-1.5 rounded-full bg-income animate-pulse" />
                            Live
                          </span>
                          <span className="text-[10.5px] text-muted-foreground mono truncate ml-2">{r.provider ?? 'auto'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5 text-[12px] text-muted-foreground">
                <Switch checked={autoSync} onCheckedChange={handleAutoSyncToggle} />
                Auto-sync dynamic rates daily at 03:00
              </div>
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <div className="text-[11px] text-muted-foreground mono">frankfurter.dev · ECB feed</div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const { synced } = await forceFxSync();
                      notify.success(`Synced ${synced} rate${synced !== 1 ? 's' : ''}`);
                      router.refresh();
                    });
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Sync now
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-3 p-3 rounded-md bg-warning/8 border border-warning/25 text-[12px] text-foreground/85 flex items-start gap-2.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-warning shrink-0" />
            <div>Each transaction locks its exchange rate when logged, so editing rates or the daily sync won&apos;t move past totals — only recurring and new transactions use the new rate. Switching the anchor currency is the exception: it re-locks every transaction to today&apos;s rates once.</div>
          </div>
        </section>
      </div>

      {/* Anchor change confirmation dialog */}
      <Dialog open={!!pendingAnchor} onOpenChange={open => { if (!open) setPendingAnchor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change anchor currency?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Switching to <strong>{pendingAnchor}</strong> re-locks every transaction to today&apos;s rates for the new anchor — a one-time re-baseline. Afterwards totals stay frozen again. Continue?
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingAnchor(null)}>Cancel</Button>
            <Button onClick={confirmAnchorChange} disabled={isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add currency dialog */}
      <Dialog open={addCurrencyOpen} onOpenChange={setAddCurrencyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tracked currency</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor={newCurrencyId}>Currency code (3 letters)</Label>
            <Input
              id={newCurrencyId}
              placeholder="e.g. CHF"
              value={newCurrencyCode}
              onChange={e => setNewCurrencyCode(e.target.value.toUpperCase())}
              maxLength={3}
              className="mono uppercase"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAddCurrencyOpen(false); setNewCurrencyCode(''); }}>Cancel</Button>
            <Button onClick={handleAddCurrency} disabled={isPending}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
