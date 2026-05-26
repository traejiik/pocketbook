'use client';

import { useState, useOptimistic, startTransition, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, subMonths, addMonths } from 'date-fns';
import { SearchIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon, RepeatIcon, DownloadIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { upsertTransaction, type TxInput } from '@/server-actions/transactions';
import { useTransactionSheet, type EditingTx } from '@/contexts/sheet-context';
import { fmtHUF, fmtDate, dayOfWeek } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { Empty } from '@/components/ui/empty';
import { AmountDisplay } from '@/components/finance/AmountDisplay';
import { TransactionForm, type SerializedCategory, type SerializedRecurringRule } from '@/components/forms/TransactionForm';

export interface SerializedTx {
  id: string;
  date: string; // "YYYY-MM-DD"
  description: string;
  amount: number; // signed — negative for EXPENSE/SAVINGS
  currency: string;
  type: 'INCOME' | 'EXPENSE' | 'SAVINGS';
  categoryId: string;
  category: SerializedCategory;
  recurringRuleId: string | null;
}

type TypeFilter = 'all' | 'INCOME' | 'EXPENSE' | 'SAVINGS';

interface TransactionsViewProps {
  transactions: SerializedTx[];
  categories: SerializedCategory[];
  recurringRules: SerializedRecurringRule[];
  fxRates: { USD: number; EUR: number; GBP: number };
  monthLabel: string;
  currentMonthISO: string;
}

function toHUF(tx: SerializedTx, rates: { USD: number; EUR: number; GBP: number }): number {
  const rate =
    tx.currency === 'USD' ? rates.USD
    : tx.currency === 'EUR' ? rates.EUR
    : tx.currency === 'GBP' ? rates.GBP
    : 1;
  return tx.amount * rate;
}

export function TransactionsView({
  transactions,
  categories,
  recurringRules,
  fxRates,
  monthLabel,
  currentMonthISO,
}: TransactionsViewProps) {
  const { openNew, openEdit } = useTransactionSheet();
  const router = useRouter();
  const searchParams = useSearchParams();

  const thisMonthISO = format(new Date(), 'yyyy-MM');
  const isCurrentMonth = currentMonthISO === thisMonthISO;

  function navigateMonth(direction: 'prev' | 'next') {
    const [y, m] = currentMonthISO.split('-').map(Number);
    const base = new Date(y, m - 1, 1);
    const target = direction === 'prev' ? subMonths(base, 1) : addMonths(base, 1);
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', format(target, 'yyyy-MM'));
    router.push(`/transactions?${params.toString()}`);
  }
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => {
    const t = searchParams.get('type');
    return t === 'INCOME' || t === 'EXPENSE' || t === 'SAVINGS' ? t : 'all';
  });

  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    setSearch(q);
    const t = searchParams.get('type');
    if (t === 'INCOME' || t === 'EXPENSE' || t === 'SAVINGS') setTypeFilter(t);
    else setTypeFilter('all');
  }, [searchParams]);
  const [catFilter, setCatFilter] = useState('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Optimistic layer — new/edited rows appear instantly before the server round-trip
  const [optimisticTxs, addOptimistic] = useOptimistic(
    transactions,
    (state: SerializedTx[], newTx: SerializedTx) => {
      const without = state.filter(t => t.id !== newTx.id);
      return [newTx, ...without].sort(
        (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
      );
    },
  );

  // Receives validated form data from TransactionForm; dispatches optimistic row
  // and fires the server action inside a single startTransition so React treats
  // them as part of the same update.
  const handleFormSubmit = useCallback(
    (input: TxInput, category: SerializedCategory) => {
      const signedAmount = input.type === 'INCOME' ? input.amount : -input.amount;
      const optimisticRow: SerializedTx = {
        id: input.id ?? `optimistic-${Date.now()}`,
        date: input.date,
        description: input.description,
        amount: signedAmount,
        currency: input.currency,
        type: input.type,
        categoryId: input.categoryId,
        category,
        recurringRuleId: input.recurringRuleId ?? null,
      };

      startTransition(async () => {
        addOptimistic(optimisticRow);
        try {
          await upsertTransaction(input);
          toast.success(input.id ? 'Transaction updated.' : 'Transaction added.');
        } catch {
          toast.error('Failed to save. Changes have been rolled back.');
        }
      });
    },
    [addOptimistic],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return optimisticTxs.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (catFilter !== 'all' && t.categoryId !== catFilter) return false;
      if (q && !t.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [optimisticTxs, search, typeFilter, catFilter]);

  // Group by date, preserving sort order from the optimistic array
  const groups = useMemo(() => {
    const map = new Map<string, SerializedTx[]>();
    for (const t of filtered) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return map;
  }, [filtered]);

  const net = useMemo(
    () => filtered.reduce((sum, t) => sum + toHUF(t, fxRates), 0),
    [filtered, fxRates],
  );

  const catOptions = useMemo(
    () => [{ id: 'all', name: 'All categories', color: '', kind: 'EXPENSE' as const }, ...categories],
    [categories],
  );

  function handleRowClick(tx: SerializedTx) {
    if (tx.id.startsWith('optimistic-')) return;
    const editing: EditingTx = {
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: Math.abs(tx.amount),
      currency: tx.currency,
      type: tx.type,
      categoryId: tx.categoryId,
      recurringRuleId: tx.recurringRuleId,
    };
    openEdit(editing);
  }

  function resetFilters() {
    setSearch('');
    setTypeFilter('all');
    setCatFilter('all');
  }

  return (
    <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5 max-w-[1240px] mx-auto">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Transactions</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            {filtered.length} transactions · {monthLabel}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled title="Coming soon" className="hidden sm:inline-flex">
            <DownloadIcon className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          <Button size="sm" onClick={openNew}>
            <PlusIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add transaction</span>
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl">
        <Input
          placeholder="Search transactions…"
          icon={<SearchIcon className="w-4 h-4" />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:flex-1 sm:max-w-[260px]"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Segmented
            options={[
              { label: 'All', value: 'all' as TypeFilter },
              { label: 'Income', value: 'INCOME' as TypeFilter },
              { label: 'Expense', value: 'EXPENSE' as TypeFilter },
              { label: 'Savings', value: 'SAVINGS' as TypeFilter },
            ]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <div className="relative">
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="appearance-none h-8 pl-3 pr-7 bg-secondary border border-border rounded-md text-base sm:text-[12px] text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring/60"
            >
              {catOptions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => navigateMonth('prev')}
              aria-label="Previous month"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </Button>
            <span className="text-[12.5px] font-medium px-1 min-w-[88px] text-center tabular-nums">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => navigateMonth('next')}
              disabled={isCurrentMonth}
              aria-label="Next month"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
          <div className="hidden sm:flex ml-auto text-[11.5px] text-muted-foreground mono whitespace-nowrap">
            Net:{' '}
            <span className={cn('font-medium ml-1', net >= 0 ? 'text-income' : 'text-expense')}>
              {fmtHUF(net, { signed: true })}
            </span>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden p-0 rounded-xl">
        <div className="hidden sm:grid grid-cols-[100px_1fr_180px_120px_140px_40px] px-5 py-2.5 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium border-b border-border bg-secondary/30">
          <div>Date</div>
          <div>Description</div>
          <div>Category</div>
          <div className="text-right">Amount</div>
          <div className="text-right">In HUF</div>
          <div />
        </div>

        {filtered.length === 0 ? (
          <Empty
            icon={SearchIcon}
            title="No transactions match"
            body="Try adjusting filters or clearing the search."
            action={
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            }
          />
        ) : (
          Array.from(groups.entries()).map(([date, list]) => (
            <div key={date}>
              <div className="px-4 sm:px-5 py-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground bg-secondary/15 border-b border-border flex items-center justify-between">
                <span>{fmtDate(date)} · {dayOfWeek(date)}</span>
                <span className="mono">{list.length} {list.length === 1 ? 'item' : 'items'}</span>
              </div>

              {list.map(tx => {
                const huf = toHUF(tx, fxRates);
                const tone = tx.type === 'INCOME' ? 'income' : tx.type === 'SAVINGS' ? 'savings' : 'expense';
                const isOptimistic = tx.id.startsWith('optimistic-');

                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => handleRowClick(tx)}
                    disabled={isOptimistic}
                    className={cn(
                      'w-full grid items-center px-4 sm:px-5 py-3 border-b border-border last:border-b-0 hover:bg-accent/50 text-left transition-colors',
                      'grid-cols-[1fr_auto_auto] sm:grid-cols-[100px_1fr_180px_120px_140px_40px]',
                      isOptimistic && 'opacity-60 pointer-events-none',
                    )}
                  >
                    {/* Date — desktop only */}
                    <div className="hidden sm:block mono text-[12px] text-muted-foreground">
                      {fmtDate(tx.date, { short: true })}
                    </div>
                    {/* Description — always; mobile shows date+category as subtext */}
                    <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 text-[13px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="sm:hidden w-2 h-2 rounded-full shrink-0"
                          style={{ background: tx.category.color }}
                        />
                        <span className="truncate">{tx.description}</span>
                        {tx.recurringRuleId && (
                          <RepeatIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                      </div>
                      <div className="sm:hidden text-[11px] text-muted-foreground flex items-center gap-1 pl-3.5">
                        <span className="mono">{fmtDate(tx.date, { short: true })}</span>
                        <span className="text-border">·</span>
                        <span className="truncate">{tx.category.name}</span>
                      </div>
                    </div>
                    {/* Category pill — desktop only */}
                    <div className="hidden sm:flex">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium border border-border/60"
                        style={{ color: tx.category.color }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: tx.category.color }}
                        />
                        {tx.category.name}
                      </span>
                    </div>
                    {/* Amount — always; mobile shows HUF below */}
                    <div className="text-right">
                      <AmountDisplay
                        value={Math.abs(tx.amount)}
                        currency={tx.currency as 'HUF' | 'USD' | 'EUR' | 'GBP'}
                        tone={tone}
                        size="sm"
                      />
                      <div className="sm:hidden text-[10.5px] text-muted-foreground tabular mt-0.5">
                        {Math.round(Math.abs(huf)).toLocaleString('hu-HU').replace(/,/g, ' ')} Ft
                      </div>
                    </div>
                    {/* HUF — desktop only */}
                    <div className="hidden sm:block text-right tabular text-[12px] text-muted-foreground">
                      {Math.round(Math.abs(huf)).toLocaleString('hu-HU').replace(/,/g, ' ')} Ft
                    </div>
                    {/* Chevron — always */}
                    <div className="text-muted-foreground/60 flex justify-center">
                      <ChevronRightIcon className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </Card>

      <div className="text-[12px] text-muted-foreground">
        {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Sheet + delete dialog — lives here to access handleFormSubmit and categories */}
      <TransactionForm
        categories={categories}
        recurringRules={recurringRules}
        fxRates={fxRates}
        onFormSubmit={handleFormSubmit}
        deleteConfirmOpen={deleteConfirmOpen}
        setDeleteConfirmOpen={setDeleteConfirmOpen}
      />
    </div>
  );
}
