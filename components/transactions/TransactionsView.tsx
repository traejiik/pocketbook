'use client';

import { useState, useOptimistic, startTransition, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchIcon, ChevronRightIcon, ChevronDownIcon, RepeatIcon } from 'lucide-react';
import { toast } from 'sonner';

import { notify } from '@/lib/ui-notify';
import { upsertTransaction, type TxInput } from '@/server-actions/transactions';
import { useTransactionSheet, type EditingTx } from '@/contexts/sheet-context';
import { fmtAnchor, fmtCur, fmtDate, dayOfWeek, monthKeyOf, shiftMonthKey } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Segmented } from '@/components/ui/segmented';
import { CalmCard } from '@/components/finance/CalmCard';
import { CategoryAvatar } from '@/components/finance/CategoryAvatar';
import { MonthNetStrip } from '@/components/transactions/MonthNetStrip';
import { MobileTransactions, TransactionSearchFrame } from '@/components/transactions/MobileTransactions';
import { PaginationControls } from '@/components/ui/pagination';
import { TransactionForm, type SerializedCategory, type SerializedRecurringRule } from '@/components/forms/TransactionForm';

export interface SerializedTx {
  id: string;
  date: string; // "YYYY-MM-DD"
  description: string;
  amount: number; // signed — negative for EXPENSE/SAVINGS
  // Frozen anchor value (signed), using the rate locked when the row was logged.
  // Absent on optimistic rows not yet round-tripped → falls back to a live rate.
  amountAnchor?: number;
  currency: string;
  type: 'INCOME' | 'EXPENSE' | 'SAVINGS';
  categoryId: string;
  category: SerializedCategory;
  recurringRuleId: string | null;
}

type TypeFilter = 'all' | 'INCOME' | 'EXPENSE' | 'SAVINGS';
interface TxGroup {
  date: string;
  items: SerializedTx[];
}

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
  // Persisted rows carry a frozen anchor value; use it so the column never drifts.
  // Optimistic rows (no amountAnchor yet) fall back to the current live rate, which
  // is what they'll freeze to on save anyway.
  if (tx.amountAnchor != null) return tx.amountAnchor;
  const rate =
    tx.currency === 'USD' ? rates.USD
    : tx.currency === 'EUR' ? rates.EUR
    : tx.currency === 'GBP' ? rates.GBP
    : 1;
  return tx.amount * rate;
}

// Pre-sorted (newest-first) list → ordered date groups.
function buildGroups(list: SerializedTx[]): TxGroup[] {
  const groups: TxGroup[] = [];
  for (const t of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return groups;
}

function amountColor(type: SerializedTx['type']): string {
  return type === 'INCOME' ? 'hsl(var(--income))'
    : type === 'SAVINGS' ? 'hsl(var(--savings))'
    : 'hsl(var(--expense))';
}

function amountSign(type: SerializedTx['type']): string {
  return type === 'INCOME' ? '+' : type === 'SAVINGS' ? '↓' : '−';
}

function spaceFt(n: number): string {
  return `${Math.round(Math.abs(n)).toLocaleString('hu-HU').replace(/,/g, ' ')} Ft`;
}

function rowLabelFor(tx: SerializedTx): string {
  const isOptimistic = tx.id.startsWith('optimistic-');
  const typeLabel = tx.type.charAt(0) + tx.type.slice(1).toLowerCase();
  return `${isOptimistic ? 'Saving ' : 'Edit '}transaction: ${fmtDate(tx.date)}, ${tx.description}, ${tx.category.name}, ${typeLabel} ${fmtAnchor(Math.abs(tx.amount), tx.currency)}`;
}

const DESKTOP_GRID = 'grid-cols-[110px_1fr_220px_150px_130px_36px]';
const TABLET_GRID = 'grid-cols-[80px_1fr_190px_130px]';
const PAGE_SIZE = 20;

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

  const thisMonthISO = monthKeyOf(new Date());
  const isCurrentMonth = currentMonthISO === thisMonthISO;

  const navigateMonth = useCallback(
    (direction: 'prev' | 'next') => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('month', shiftMonthKey(currentMonthISO, direction === 'prev' ? -1 : 1));
      router.push(`/transactions?${params.toString()}`);
    },
    [currentMonthISO, router, searchParams],
  );

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

  // Client-side pagination (20/page). Reset to the first page whenever the
  // filtered set changes underneath us — month nav, search, or type/category.
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, catFilter, currentMonthISO]);

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

  // Desktop keeps the inline search field, so its ledger filters by query.
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return optimisticTxs.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (catFilter !== 'all' && t.categoryId !== catFilter) return false;
      if (q && !t.description.toLowerCase().includes(q) && !t.category.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [optimisticTxs, search, typeFilter, catFilter]);

  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const desktopPage = Math.min(page, desktopTotalPages);
  const groups = useMemo(
    () => buildGroups(filtered.slice((desktopPage - 1) * PAGE_SIZE, desktopPage * PAGE_SIZE)),
    [filtered, desktopPage],
  );

  const net = useMemo(
    () => filtered.reduce((sum, t) => sum + toHUF(t, fxRates), 0),
    [filtered, fxRates],
  );

  // Mobile/tablet base ledgers ignore the search query (search is a separate overlay);
  // it still respects the type + category filters.
  const mobileBaseList = useMemo(
    () => optimisticTxs.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (catFilter !== 'all' && t.categoryId !== catFilter) return false;
      return true;
    }),
    [optimisticTxs, typeFilter, catFilter],
  );
  const baseTotalPages = Math.max(1, Math.ceil(mobileBaseList.length / PAGE_SIZE));
  const basePage = Math.min(page, baseTotalPages);
  const mobileBaseGroups = useMemo(
    () => buildGroups(mobileBaseList.slice((basePage - 1) * PAGE_SIZE, basePage * PAGE_SIZE)),
    [mobileBaseList, basePage],
  );
  const mobileNet = useMemo(
    () => mobileBaseList.reduce((sum, t) => sum + toHUF(t, fxRates), 0),
    [mobileBaseList, fxRates],
  );

  // Mobile/tablet search overlay matches the query across *all* types (prototype behaviour).
  const mobileSearchList = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return [];
    return optimisticTxs.filter(
      t => t.description.toLowerCase().includes(q) || t.category.name.toLowerCase().includes(q),
    );
  }, [optimisticTxs, search]);
  const mobileSearchGroups = useMemo(() => buildGroups(mobileSearchList), [mobileSearchList]);

  const toHuf = useCallback((tx: SerializedTx) => toHUF(tx, fxRates), [fxRates]);

  const catOptions = useMemo(
    () => [{ id: 'all', name: 'All categories', color: '', kind: 'EXPENSE' as const }, ...categories],
    [categories],
  );

  const handleRowClick = useCallback(
    (tx: SerializedTx) => {
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
    },
    [openEdit],
  );

  function resetFilters() {
    setSearch('');
    setTypeFilter('all');
    setCatFilter('all');
  }

  const typeOptions = [
    { label: 'All', value: 'all' as TypeFilter },
    { label: 'Income', value: 'INCOME' as TypeFilter },
    { label: 'Expense', value: 'EXPENSE' as TypeFilter },
    { label: 'Savings', value: 'SAVINGS' as TypeFilter },
  ];

  const emptyState = (
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
  );

  return (
    <div className="px-4 lg:px-7 pb-9 pt-1 max-w-[1320px] mx-auto">
      {/* ─────────── Mobile (<md) ─────────── */}
      <div className="md:hidden">
        <MobileTransactions
          baseGroups={mobileBaseGroups}
          baseCount={mobileBaseList.length}
          mobileNet={mobileNet}
          searchGroups={mobileSearchGroups}
          searchCount={mobileSearchList.length}
          q={search}
          setSearch={setSearch}
          filter={typeFilter}
          setTypeFilter={setTypeFilter}
          monthLabel={monthLabel}
          onPrev={() => navigateMonth('prev')}
          onNext={() => navigateMonth('next')}
          isCurrentMonth={isCurrentMonth}
          anchorCurrency={anchorCurrency}
          toHuf={toHuf}
          onRowClick={handleRowClick}
          page={basePage}
          totalPages={baseTotalPages}
          onPageChange={setPage}
        />
      </div>

      {/* ─────────── Tablet (md–lg) ─────────── */}
      <div className="hidden md:block lg:hidden md:max-w-[920px] md:mx-auto">
        <TransactionSearchFrame
          className="space-y-5"
          q={search}
          setSearch={setSearch}
          searchGroups={mobileSearchGroups}
          searchCount={mobileSearchList.length}
          toHuf={toHuf}
          anchorCurrency={anchorCurrency}
          onRowClick={handleRowClick}
          closedControls={(searchButton) => (
            <div className="flex h-full items-center gap-2">
              {searchButton}
              <div className="flex-1 min-w-0">
                <Segmented size="lg" fullWidth options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
              </div>
              <MonthNetStrip
                size="md"
                className="shrink-0"
                monthLabel={monthLabel}
                onPrev={() => navigateMonth('prev')}
                onNext={() => navigateMonth('next')}
                isCurrentMonth={isCurrentMonth}
                net={mobileNet}
                anchorCurrency={anchorCurrency}
              />
            </div>
          )}
          ledger={(
            <>
              <CalmCard className="overflow-hidden">
                <div className={cn('grid gap-4 items-center px-5 h-10 text-[11px] mono uppercase tracking-[0.12em] text-muted-foreground border-b border-border/45', TABLET_GRID)} aria-hidden="true">
                  <span>Date</span>
                  <span>Description</span>
                  <span>Category</span>
                  <span className="text-right">Amount</span>
                </div>

                {mobileBaseList.length === 0 ? emptyState : mobileBaseGroups.map(g => (
                  <div key={g.date}>
                    <div className="flex items-center justify-between px-5 py-2 bg-secondary/50 border-t border-border/35">
                      <span className="mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
                        {fmtDate(g.date)} · {dayOfWeek(g.date)}
                      </span>
                      <span className="mono text-[10.5px] text-muted-foreground">
                        {g.items.length} item{g.items.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {g.items.map(tx => {
                      const isOptimistic = tx.id.startsWith('optimistic-');
                      const isFx = tx.currency !== anchorCurrency;
                      return (
                        <button
                          key={tx.id}
                          type="button"
                          aria-label={rowLabelFor(tx)}
                          onClick={() => handleRowClick(tx)}
                          disabled={isOptimistic}
                          className={cn(
                            'w-full grid gap-4 items-center px-5 py-3 border-t border-border/35 text-left active:bg-accent/40 hover:bg-accent/40 transition-colors',
                            TABLET_GRID,
                            isOptimistic && 'opacity-60 pointer-events-none',
                          )}
                        >
                          <span className="mono text-[12px] text-muted-foreground tabular">{fmtDate(tx.date, { short: true })}</span>

                          <span className="flex items-center gap-2.5 min-w-0">
                            <CategoryAvatar name={tx.category.name} color={tx.category.color} size={32} />
                            <span className="min-w-0 flex items-center gap-1.5">
                              <span className="text-[13.5px] font-medium truncate">{tx.description}</span>
                              {tx.recurringRuleId && <RepeatIcon className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
                            </span>
                          </span>

                          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tx.category.color }} />
                            <span className="truncate">{tx.category.name}</span>
                          </span>

                          <span className="text-right">
                            <span className="block tabular text-[13.5px] font-medium" style={{ color: amountColor(tx.type) }}>
                              {amountSign(tx.type)}{fmtCur(Math.abs(Number(tx.amount)), tx.currency as 'HUF' | 'USD' | 'EUR' | 'GBP').replace('−', '')}
                            </span>
                            {isFx && (
                              <span className="block tabular text-[10.5px] text-muted-foreground mt-0.5">≈ {spaceFt(toHUF(tx, fxRates))}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </CalmCard>

              <div className="mono text-[11.5px] text-muted-foreground px-0.5">
                {mobileBaseList.length} transaction{mobileBaseList.length === 1 ? '' : 's'}
              </div>

              <PaginationControls page={basePage} totalPages={baseTotalPages} onChange={setPage} className="mt-1" />
            </>
          )}
        />
      </div>

      {/* ─────────── Desktop (lg+) ─────────── */}
      <div className="hidden lg:block">
        <TransactionSearchFrame
          className="space-y-4"
          q={search}
          setSearch={setSearch}
          searchGroups={mobileSearchGroups}
          searchCount={mobileSearchList.length}
          toHuf={toHuf}
          anchorCurrency={anchorCurrency}
          onRowClick={handleRowClick}
          closedControls={(searchButton) => (
            <div className="flex h-full items-center gap-3 flex-nowrap">
              {/* Full search field once the row is wide enough (xl+) */}
              <label className="hidden xl:flex items-center gap-2.5 h-9 px-3.5 rounded-[10px] bg-card border border-border/50 focus-within:border-ring/50 transition-colors w-[240px] shrink-0 cursor-text">
                <SearchIcon className="w-[15px] h-[15px] text-muted-foreground shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-muted-foreground min-w-0"
                  placeholder="Search transactions…"
                />
              </label>

              {/* Collapsed tablet/mobile search affordance until there's room */}
              <span className="xl:hidden shrink-0 [&>button]:w-9 [&>button]:h-9 [&>button]:rounded-[10px]">
                {searchButton}
              </span>

              <Segmented className="shrink-0 [&>button]:h-[30px]" options={typeOptions} value={typeFilter} onChange={setTypeFilter} />

              <div className="relative shrink-0">
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

              <MonthNetStrip
                size="sm"
                className="ml-auto shrink-0"
                monthLabel={monthLabel}
                onPrev={() => navigateMonth('prev')}
                onNext={() => navigateMonth('next')}
                isCurrentMonth={isCurrentMonth}
                net={net}
                anchorCurrency={anchorCurrency}
              />
            </div>
          )}
          ledger={(
            <>
              <CalmCard className="overflow-hidden">
                <div className={cn('grid gap-3 items-center px-6 h-11 text-[11px] mono uppercase tracking-[0.12em] text-muted-foreground border-b border-border/45', DESKTOP_GRID)} aria-hidden="true">
                  <span>Date</span>
                  <span>Description</span>
                  <span>Category</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">In HUF</span>
                  <span />
                </div>

                {filtered.length === 0 ? emptyState : groups.map(g => (
                  <div key={g.date}>
                    <div className="flex items-center justify-between px-6 py-2 bg-secondary/35">
                      <span className="mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
                        {fmtDate(g.date)} · {dayOfWeek(g.date)}
                      </span>
                      <span className="mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
                        {g.items.length} item{g.items.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {g.items.map(tx => {
                      const isOptimistic = tx.id.startsWith('optimistic-');
                      return (
                        <button
                          key={tx.id}
                          type="button"
                          aria-label={rowLabelFor(tx)}
                          onClick={() => handleRowClick(tx)}
                          disabled={isOptimistic}
                          className={cn(
                            'w-full grid gap-3 items-center px-6 py-[13px] border-t border-border/35 text-left hover:bg-accent/40 transition-colors',
                            DESKTOP_GRID,
                            isOptimistic && 'opacity-60 pointer-events-none',
                          )}
                        >
                          <span className="mono text-[12px] text-muted-foreground tabular">{fmtDate(tx.date, { short: true })}</span>

                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[13.5px] font-medium truncate">{tx.description}</span>
                            {tx.recurringRuleId && <RepeatIcon className="w-3 h-3 text-muted-foreground/70 shrink-0" />}
                          </span>

                          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tx.category.color }} />
                            <span className="truncate">{tx.category.name}</span>
                          </span>

                          <span className="text-right tabular text-[13.5px] font-medium" style={{ color: amountColor(tx.type) }}>
                            {amountSign(tx.type)}{fmtCur(Math.abs(Number(tx.amount)), tx.currency as 'HUF' | 'USD' | 'EUR' | 'GBP').replace('−', '')}
                          </span>

                          <span className="text-right tabular text-[12px] text-muted-foreground">{spaceFt(toHUF(tx, fxRates))}</span>

                          <span className="flex justify-end text-muted-foreground/60">
                            <ChevronRightIcon className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </CalmCard>

              <div className="mt-3 text-[11.5px] text-muted-foreground">
                {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
              </div>

              <PaginationControls page={desktopPage} totalPages={desktopTotalPages} onChange={setPage} className="mt-2" />
            </>
          )}
        />
      </div>

      {/* Shared sheet + delete dialog */}
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
