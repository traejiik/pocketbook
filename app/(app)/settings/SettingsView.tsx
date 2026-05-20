'use client';

import { useState, useTransition } from 'react';
import { DollarSign, Lock, Sparkles, Check, AlertTriangle, RefreshCw, Plus, Trash2, Edit, Repeat, Database } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format';
import {
  setAnchorCurrency,
  setExchangeRate,
  addTrackedCurrency,
  removeTrackedCurrency,
  setFxAutoSync,
  setAutoInsights,
  setOllamaModel,
  changePassword,
  forceFxSync,
  clearAllData,
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
  ollamaUrl: string;
  ollamaConnected: boolean;
  ollamaModel: string;
  ollamaModels: Array<{ name: string; size: number }>;
  autoInsightsMonthly: boolean;
  dbSize: string;
  lastBackup: string;
  version: string;
};

const ANCHOR_OPTIONS = [
  { code: 'HUF', symbol: 'Ft', name: 'Forint',    flag: '🇭🇺' },
  { code: 'USD', symbol: '$',  name: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€',  name: 'Euro',      flag: '🇪🇺' },
  { code: 'GBP', symbol: '£',  name: 'Pound',     flag: '🇬🇧' },
];

function formatModelSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

function passwordStrength(pw: string): { bars: number; label: string } {
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const bars = Math.min(4, Math.ceil(score * 0.8));
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return { bars, label: labels[bars] ?? '' };
}

export function SettingsView({
  anchorCurrency: initialAnchor,
  exchangeRates: initialRates,
  fxAutoSync: initialAutoSync,
  ollamaUrl,
  ollamaConnected,
  ollamaModel: initialModel,
  ollamaModels,
  autoInsightsMonthly: initialAutoInsights,
  dbSize,
  lastBackup,
  version,
}: Props) {
  const [anchor, setAnchor] = useState(initialAnchor);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [rates, setRates] = useState(initialRates);
  const [autoSync, setAutoSync] = useState(initialAutoSync);
  const [model, setModel] = useState(initialModel);
  const [autoInsights, setAutoInsightsState] = useState(initialAutoInsights);
  const [addCurrencyOpen, setAddCurrencyOpen] = useState(false);
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [clearDbOpen, setClearDbOpen] = useState(false);

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [isPending, startTransition] = useTransition();

  const anchorMeta = ANCHOR_OPTIONS.find(c => c.code === anchor);

  const handleAnchorClick = (code: string) => {
    if (code === anchor) return;
    setPendingAnchor(code);
  };

  const confirmAnchorChange = () => {
    if (!pendingAnchor) return;
    const next = pendingAnchor;
    startTransition(async () => {
      await setAnchorCurrency(next);
      setAnchor(next);
      setPendingAnchor(null);
      toast.success(`Anchor currency changed to ${next}`);
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
      toast.success(`Rate for ${r.from} updated`);
    });
  };

  const handleAddCurrency = () => {
    const code = newCurrencyCode.trim().toUpperCase();
    if (!code || code.length !== 3) { toast.error('Enter a valid 3-letter currency code'); return; }
    startTransition(async () => {
      await addTrackedCurrency(code);
      setAddCurrencyOpen(false);
      setNewCurrencyCode('');
      toast.success(`${code} added`);
    });
  };

  const handleRemoveCurrency = (from: string, to: string) => {
    startTransition(async () => {
      await removeTrackedCurrency(from, to);
      setRates(prev => prev.filter(r => !(r.from === from && r.to === to)));
      toast.success(`${from} removed`);
    });
  };

  const handleAutoSyncToggle = (val: boolean) => {
    setAutoSync(val);
    startTransition(async () => { await setFxAutoSync(val); });
  };

  const handleModelChange = (m: string) => {
    setModel(m);
    startTransition(async () => {
      await setOllamaModel(m);
      toast.success(`Default model set to ${m}`);
    });
  };

  const handleAutoInsightsToggle = (val: boolean) => {
    setAutoInsightsState(val);
    startTransition(async () => { await setAutoInsights(val); });
  };

  const handlePasswordChange = () => {
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    if (newPw.length < 12) { toast.error('New password must be at least 12 characters'); return; }
    startTransition(async () => {
      const result = await changePassword({ current: currentPw, next: newPw });
      if (result.error) { toast.error(result.error); return; }
      toast.success('Password updated');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    });
  };

  const strength = passwordStrength(newPw);
  const barColours = ['bg-border', 'bg-destructive', 'bg-amber-400', 'bg-income', 'bg-income'];

  return (
    <>
      <div className="px-8 py-6 max-w-[760px] mx-auto space-y-7">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">Configure currencies, security, and the local LLM.</div>
        </div>

        {/* ── Currencies & FX rates ──────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[14px] font-semibold tracking-tight">Currencies & exchange rates</h2>
          </div>

          {/* Anchor selector */}
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
                <button
                  key={c.code}
                  onClick={() => handleAnchorClick(c.code)}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-colors',
                    anchor === c.code
                      ? 'border-primary/60 bg-primary/8 ring-2 ring-primary/20'
                      : 'border-border bg-transparent hover:bg-accent/40',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[20px] leading-none">{c.flag}</span>
                    {anchor === c.code && <Check className="w-3.5 h-3.5 text-primary" />}
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
                <div className="text-[11.5px] text-muted-foreground mt-0.5">Rates expressed as 1 unit → {anchorMeta?.code}.</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAddCurrencyOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />Add currency
              </Button>
            </div>

            <div className="mt-4 -mx-1 divide-y divide-border">
              {rates.map((r, idx) => (
                <div key={r.id} className="px-1 py-3.5 grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3">
                  {/* Code chip */}
                  <div className="w-12 h-12 rounded-lg border border-border bg-secondary/40 flex flex-col items-center justify-center flex-shrink-0">
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
                  {/* Mode toggle */}
                  <div className="flex items-center gap-0.5 p-0.5 bg-secondary border border-border rounded-md">
                    {(['AUTO', 'MANUAL'] as const).map(opt => (
                      <button
                        key={opt}
                        onClick={() => handleModeToggle(idx, opt)}
                        className={cn(
                          'h-7 px-2.5 rounded text-[11.5px] font-medium inline-flex items-center gap-1 transition-colors',
                          r.mode === opt ? 'bg-card text-foreground shadow-pb-1' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {opt === 'AUTO' ? <Repeat className="w-3 h-3" /> : <Edit className="w-3 h-3" />}
                        {opt === 'AUTO' ? 'Dynamic' : 'Manual'}
                      </button>
                    ))}
                  </div>
                  {/* Rate value / live indicator */}
                  <div className="w-[150px]">
                    {r.mode === 'MANUAL' ? (
                      <div className="flex gap-1">
                        <Input
                          type="number"
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
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-[12px] text-muted-foreground">
                <Switch checked={autoSync} onCheckedChange={handleAutoSyncToggle} />
                Auto-sync dynamic rates daily at 03:00
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-muted-foreground mono">frankfurter.app · ECB feed</div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const { synced } = await forceFxSync();
                      toast.success(`Synced ${synced} rate${synced !== 1 ? 's' : ''}`);
                    });
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Sync now
                </Button>
              </div>
            </div>
          </Card>

          <div className="mt-3 p-3 rounded-md bg-amber-500/8 border border-amber-500/25 text-[12px] text-foreground/85 flex items-start gap-2.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-500 flex-shrink-0" />
            <div>Switching anchor or changing manual rates retroactively converts every non-anchor transaction — past totals will shift accordingly.</div>
          </div>
        </section>

        {/* ── Security ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[14px] font-semibold tracking-tight">Security</h2>
          </div>
          <Card className="p-5 space-y-4">
            <div>
              <Label>Current password</Label>
              <Input type="password" placeholder="••••••••••••" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>New password</Label>
                <Input type="password" placeholder="At least 12 characters" value={newPw} onChange={e => setNewPw(e.target.value)} />
              </div>
              <div>
                <Label>Confirm</Label>
                <Input type="password" placeholder="Repeat new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              </div>
            </div>
            {newPw.length > 0 && (
              <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <span className="flex gap-0.5">
                  {[1, 2, 3, 4].map(i => (
                    <span
                      key={i}
                      className={cn('w-6 h-1 rounded-full', i <= strength.bars ? barColours[strength.bars] : 'bg-border')}
                    />
                  ))}
                </span>
                <span>{strength.label}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => { setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}>Cancel</Button>
              <Button size="sm" onClick={handlePasswordChange} disabled={isPending || !currentPw || !newPw}>
                <Check className="w-3.5 h-3.5 mr-1.5" />Update password
              </Button>
            </div>
          </Card>
        </section>

        {/* ── AI Insights ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[14px] font-semibold tracking-tight">AI insights</h2>
          </div>
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-medium">Ollama endpoint</div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5 mono">{ollamaUrl}</div>
              </div>
              <Badge className={cn(
                'text-[11px] flex items-center gap-1.5',
                ollamaConnected ? 'bg-income/10 text-income border-income/30' : 'bg-destructive/10 text-destructive border-destructive/30',
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', ollamaConnected ? 'bg-income' : 'bg-destructive')} />
                {ollamaConnected ? 'Connected' : 'Unreachable'}
              </Badge>
            </div>
            <div className="h-px bg-border" />
            <div>
              <Label>Default model</Label>
              <div className="space-y-2 mt-2">
                {ollamaModels.map(m => (
                  <button
                    key={m.name}
                    onClick={() => handleModelChange(m.name)}
                    className={cn(
                      'w-full text-left p-3 rounded-md border transition-colors flex items-center gap-3',
                      model === m.name ? 'border-ring/60 bg-accent/40' : 'border-border bg-transparent hover:bg-accent/30',
                    )}
                  >
                    <span className={cn(
                      'w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0',
                      model === m.name ? 'border-primary' : 'border-border',
                    )}>
                      {model === m.name && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-medium mono">{m.name}</span>
                        <span className="text-[11px] text-muted-foreground">· {formatModelSize(m.size)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="text-[12px] text-muted-foreground inline-flex items-center gap-2">
                <Switch checked={autoInsights} onCheckedChange={handleAutoInsightsToggle} />
                Auto-generate on the 1st of each month
              </div>
            </div>
          </Card>
        </section>

        {/* ── About ─────────────────────────────────────────────────── */}
        <section>
          <Card className="p-5 grid grid-cols-3 gap-5 text-[12px]">
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Version</div>
              <div className="mono text-foreground/85 mt-1">{version}</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Database size</div>
              <div className="mono text-foreground/85 mt-1">{dbSize}</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Last backup</div>
              <div className="mono text-foreground/85 mt-1">{lastBackup}</div>
            </div>
          </Card>
        </section>

        {/* ── Danger zone ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[14px] font-semibold tracking-tight">Data</h2>
          </div>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-medium">Clear all data</div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5">
                  Deletes every transaction, recurring rule, category, and AI insight. Account and settings are kept.
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setClearDbOpen(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Clear database
              </Button>
            </div>
          </Card>
        </section>
      </div>

      {/* Anchor change confirmation dialog */}
      <Dialog open={!!pendingAnchor} onOpenChange={open => { if (!open) setPendingAnchor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change anchor currency?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Switching to <strong>{pendingAnchor}</strong> retroactively converts every non-anchor transaction.
            Past totals will shift accordingly. Continue?
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingAnchor(null)}>Cancel</Button>
            <Button onClick={confirmAnchorChange} disabled={isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear database confirmation dialog */}
      <Dialog open={clearDbOpen} onOpenChange={setClearDbOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            This permanently deletes every transaction, recurring rule, category, and AI insight.
            Your account credentials and app settings are not affected. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClearDbOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await clearAllData();
                  setClearDbOpen(false);
                  toast.success('All data cleared');
                });
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />Yes, clear everything
            </Button>
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
            <Label>Currency code (3 letters)</Label>
            <Input
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
