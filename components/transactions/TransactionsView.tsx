'use client';

import { useState, useOptimistic, startTransition, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, subMonths, addMonths } from 'date-fns';
import { SearchIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon, RepeatIcon } from 'lucide-react';
import { toast } from 'sonner';

import { notify } from '@/lib/ui-notify';
import { upsertTransaction, type TxInput } from '@/server-actions/transactions';
import { useTransactionSheet, type EditingTx } from '@/contexts/sheet-context';
import { fmtAnchor, fmtCur, fmtDate, dayOfWeek } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Segmented } from '@/components/ui/segmented';
import { CalmCard } from '@/components/finance/CalmCard';
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
  anchorCurrency?: string;
}

function toHUF(tx: SerializedTx, rates: { USD: number; EUR: number; GBP: number }): number {
  const rate =
    tx.currency === 'USD' ? rates.USD
    : tx.currency === 'EUR' ? rates.EUR
    : tx.currency === 'GBP' ? rates.GBP
    : 1;
  return tx.amount * rate;
}

const ROW_GRID = 'lg:grid-cols-[110px_1fr_220px_150px_130px_36px]';

export function TransactionsView({
  transactions,
  categories,
  recurringRules,
  fxRates,
  monthLabel,
  currentMonthISO,
  anchorCurrency = 'HUF',
}: TransactionsViewProps) {
  const { openEdit } = useTransactionSheet();
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
          notify.success(input.id ? 'Transaction updated.' : 'Transaction added.');
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
      if (q && !t.description.toLowerCase().includes(q) && !t.category.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [optimisticTxs, search, typeFilter, catFilter]);

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
    <div className="px-4 lg:px-7 pb-9 pt-1 max-w-[1320px] mx-auto">
      {/* Filter row — stacks below lg, single row at desktop */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="flex items-center gap-2.5 h-9 px-3.5 rounded-[10px] bg-card border border-border/50 focus-within:border-ring/50 transition-colors w-full lg:w-[240px] cursor-text">
          <SearchIcon className="w-[15px] h-[15px] text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-muted-foreground/80 min-w-0"
            placeholder="Search transactions…"
          />
        </label>

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
              aria-label="Filter by category"
              className="appearance-none h-9 pl-3.5 pr-8 rounded-[10px] bg-card border border-border/50 hover:border-border text-[12.5px] text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring/60 transition-colors"
            >
              {catOptions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigateMonth('prev')}
              aria-label="Previous month"
              className="w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </button>
            <span className="text-[13px] font-medium tabular px-1 min-w-[88px] text-center">{monthLabel}</span>
            <button
              type="button"
              onClick={() => navigateMonth('next')}
              disabled={isCurrentMonth}
              aria-label="Next month"
              className="w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="mono text-[12px] text-muted-foreground lg:ml-auto">
          Net:{' '}
          <span className={cn('font-medium', net >= 0 ? 'text-income' : 'text-expense')}>
            {fmtAnchor(net, anchorCurrency, { signed: true })}
          </span>
        </div>
      </div>

      {/* Ledger */}
      <CalmCard className="mt-4 overflow-hidden">
        {/* Column header — desktop only */}
        <div
          aria-hidden="true"
          className={cn(
            'hidden lg:grid gap-3 items-center px-6 h-11 text-[10px] mono uppercase tracking-[0.12em] text-muted-foreground border-b border-border/45',
            ROW_GRID,
          )}
        >
          <span>Date</span>
          <span>Description</span>
          <span>Category</span>
          <span className="text-right">Amount</span>
          <span className="text-right">In HUF</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-[12.5px] text-muted-foreground">
            No transactions match.
            <button
              type="button"
              onClick={resetFilters}
              className="block mx-auto mt-3 text-[12px] text-foreground/80 hover:text-foreground underline underline-offset-2"
            >
              Reset filters
            </button>
          </div>
        ) : (
          Array.from(groups.entries()).map(([date, list]) => (
            <div key={date}>
              <div className="flex items-center justify-between px-4 lg:px-6 py-2 bg-secondary/35">
                <span className="mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
                  {fmtDate(date)} · {dayOfWeek(date)}
                </span>
                <span className="mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
                  {list.length} item{list.length === 1 ? '' : 's'}
                </span>
              </div>

              {list.map(tx => {
                const huf = toHUF(tx, fxRates);
                const amtColor =
                  tx.type === 'INCOME' ? 'hsl(var(--income))'
                  : tx.type === 'SAVINGS' ? 'hsl(var(--savings))'
                  : 'hsl(var(--expense))';
                const sign = tx.type === 'INCOME' ? '+' : tx.type === 'SAVINGS' ? '↓' : '−';
                const isOptimistic = tx.id.startsWith('optimistic-');
                const typeLabel = tx.type.charAt(0) + tx.type.slice(1).toLowerCase();
                const rowLabel = `${isOptimistic ? 'Saving ' : 'Edit '}transaction: ${fmtDate(tx.date)}, ${tx.description}, ${tx.category.name}, ${typeLabel} ${fmtAnchor(Math.abs(tx.amount), tx.currency)}`;

                return (
                  <button
                    key={tx.id}
                    type="button"
                    aria-label={rowLabel}
                    onClick={() => handleRowClick(tx)}
                    disabled={isOptimistic}
                    className={cn(
                      'w-full grid items-center gap-3 px-4 lg:px-6 py-3 lg:py-[13px] border-t border-border/35 hover:bg-accent/40 text-left transition-colors',
                      'grid-cols-[1fr_auto]',
                      ROW_GRID,
                      isOptimistic && 'opacity-60 pointer-events-none',
                    )}
                  >
                    {/* Date — desktop only */}
                    <span className="hidden lg:block mono text-[12px] text-muted-foreground tabular">
                      {fmtDate(tx.date, { short: true })}
                    </span>
                    {/* Description (+ mobile subtext) */}
                    <span className="min-w-0 flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13.5px] font-medium truncate">{tx.description}</span>
                        {tx.recurringRuleId && (
                          <RepeatIcon className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                        )}
                      </span>
                      <span className="lg:hidden text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tx.category.color }} />
                        <span className="truncate">{tx.category.name}</span>
                        <span className="opacity-50">·</span>
                        <span className="mono shrink-0">{fmtDate(tx.date, { short: true })}</span>
                      </span>
                    </span>
                    {/* Category — desktop only */}
                    <span className="hidden lg:flex items-center gap-1.5 text-[12px] text-muted-foreground min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tx.category.color }} />
                      <span className="truncate">{tx.category.name}</span>
                    </span>
                    {/* Amount (+ mobile HUF subtext) */}
                    <span className="text-right">
                      <span className="tabular text-[13.5px] font-medium" style={{ color: amtColor }}>
                        {sign}{fmtCur(Math.abs(Number(tx.amount)), tx.currency as 'HUF' | 'USD' | 'EUR' | 'GBP').replace('−', '')}
                      </span>
                      <span className="lg:hidden block text-[10.5px] text-muted-foreground tabular mt-0.5">
                        {Math.round(Math.abs(huf)).toLocaleString('hu-HU').replace(/,/g, ' ')} Ft
                      </span>
                    </span>
                    {/* In HUF — desktop only */}
                    <span className="hidden lg:block text-right tabular text-[12px] text-muted-foreground">
                      {Math.round(Math.abs(huf)).toLocaleString('hu-HU').replace(/,/g, ' ')} Ft
                    </span>
                    {/* Chevron — desktop only */}
                    <span className="hidden lg:flex justify-end text-muted-foreground/60">
                      <ChevronRightIcon className="w-3.5 h-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </CalmCard>

      <div className="mt-3 text-[11.5px] text-muted-foreground">
        {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
      </div>

      {/* Sheet + delete dialog */}
      <TransactionForm
        categories={categories}
        recurringRules={recurringRules}
        fxRates={fxRates}
        onFormSubmit={handleFormSubmit}
        deleteConfirmOpen={deleteConfirmOpen}
        setDeleteConfirmOpen={setDeleteConfirmOpen}
        anchorCurrency={anchorCurrency}
      />
    </div>
  );
}
