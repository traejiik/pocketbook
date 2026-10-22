'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { SearchIcon, XIcon, RepeatIcon } from 'lucide-react';

import { CalmCard } from '@/components/finance/CalmCard';
import { CategoryAvatar } from '@/components/finance/CategoryAvatar';
import { Segmented } from '@/components/ui/segmented';
import { PaginationControls } from '@/components/ui/pagination';
import { ExportTransactionsButton } from '@/components/transactions/ExportTransactionsDialog';
import { MonthNetStrip } from './MonthNetStrip';
import { fmtCur, fmtDate, fmtAnchor, dayOfWeek } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SerializedTx } from './TransactionsView';
import { isSavingsType, typeGlyph, typeLabel, type TxTypeFilter } from '@/lib/transactions/type';

type TypeFilter = TxTypeFilter;
export interface TxGroup {
  date: string;
  items: SerializedTx[];
}

const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

// prefers-reduced-motion is a motion-preference media feature (not viewport
// detection), so honouring it here is consistent with the responsive rules.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Search runs over the loaded month only, matching description or category name. */
export function searchHint(monthLabel: string): string {
  return `Type to search ${monthLabel} by description or category`;
}

// ── Single row (tap to edit) ────────────────────────────────────────────────
function MobileTxDetailRow({
  tx,
  huf,
  anchorCurrency,
  onClick,
}: {
  tx: SerializedTx;
  huf: number;
  anchorCurrency: string;
  onClick: (tx: SerializedTx) => void;
}) {
  const isOptimistic = tx.id.startsWith('optimistic-');
  const amtColor =
    tx.type === 'INCOME' ? 'hsl(var(--income))'
    : isSavingsType(tx.type) ? 'hsl(var(--savings))'
    : 'hsl(var(--expense))';
  const sign = typeGlyph(tx.type);
  const isFx = tx.currency !== anchorCurrency;
  const rowLabel = `${isOptimistic ? 'Saving ' : 'Edit '}transaction: ${fmtDate(tx.date)}, ${tx.description}, ${tx.category.name}, ${typeLabel(tx.type)} ${fmtAnchor(Math.abs(tx.amount), tx.currency)}`;

  return (
    <button
      type="button"
      aria-label={rowLabel}
      onClick={() => onClick(tx)}
      disabled={isOptimistic}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 border-t border-border/35 text-left active:bg-accent/30 transition-colors',
        isOptimistic && 'opacity-60 pointer-events-none',
      )}
    >
      <CategoryAvatar name={tx.category.name} color={tx.category.color} size={36} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13.5px] font-medium truncate">{tx.description}</span>
          {tx.recurringRuleId && <RepeatIcon className="w-3 h-3 text-muted-foreground/55 shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tx.category.color }} />
          <span className="text-[11px] text-muted-foreground truncate">{tx.category.name}</span>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="tabular text-[13.5px] font-medium" style={{ color: amtColor }}>
          {sign}{fmtCur(Math.abs(Number(tx.amount)), tx.currency as 'HUF' | 'USD' | 'EUR' | 'GBP').replace('−', '')}
        </div>
        {isFx && (
          <div className="tabular text-[10.5px] text-muted-foreground mt-0.5">≈ {fmtAnchor(Math.abs(huf), anchorCurrency)}</div>
        )}
      </div>
    </button>
  );
}

function GroupHeader({ date, dow, count }: { date: string; dow: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-secondary/50 border-t border-border/35">
      <span className="mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
        {date} · {dow}
      </span>
      <span className="mono text-[10.5px] text-muted-foreground">
        {count} item{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function EmptyMatch() {
  return (
    <div className="px-6 py-12 text-center text-[12.5px] text-muted-foreground">No transactions match.</div>
  );
}

function GroupedRows({
  groups,
  toHuf,
  anchorCurrency,
  onRowClick,
}: {
  groups: TxGroup[];
  toHuf: (tx: SerializedTx) => number;
  anchorCurrency: string;
  onRowClick: (tx: SerializedTx) => void;
}) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.date}>
          <GroupHeader date={fmtDate(g.date)} dow={dayOfWeek(g.date)} count={g.items.length} />
          {g.items.map((tx) => (
            <MobileTxDetailRow
              key={tx.id}
              tx={tx}
              huf={toHuf(tx)}
              anchorCurrency={anchorCurrency}
              onClick={onRowClick}
            />
          ))}
        </div>
      ))}
    </>
  );
}

// ── Animated floating search overlay ────────────────────────────────────────
function TxSearchOverlay({
  q,
  groups,
  count,
  shown,
  reduced,
  toHuf,
  anchorCurrency,
  monthLabel,
  onRowClick,
}: {
  q: string;
  groups: TxGroup[];
  count: number;
  /** Driven by the frame in both directions; reopening during the exit retargets. */
  shown: boolean;
  reduced: boolean;
  toHuf: (tx: SerializedTx) => number;
  anchorCurrency: string;
  monthLabel: string;
  onRowClick: (tx: SerializedTx) => void;
}) {
  const vis = shown;
  const style: React.CSSProperties = reduced
    ? { opacity: vis ? 1 : 0, transition: `opacity 0.15s ${EASE}` }
    : {
        opacity: vis ? 1 : 0,
        transform: vis ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
        transition: `opacity 0.22s ${EASE}, transform 0.22s ${EASE}`,
      };

  return (
    <div className="absolute inset-x-0 top-0 z-10" style={style} inert={!shown}>
      {q ? (
        <>
          <CalmCard className="overflow-hidden shadow-pb-2">
            {count === 0 ? (
              <EmptyMatch />
            ) : (
              <GroupedRows groups={groups} toHuf={toHuf} anchorCurrency={anchorCurrency} onRowClick={onRowClick} />
            )}
          </CalmCard>
          {count > 0 && (
            <div className="text-[11px] text-muted-foreground mono px-0.5 mt-3">
              {count} result{count === 1 ? '' : 's'}
            </div>
          )}
        </>
      ) : (
        <div className="pt-8 text-center text-[12px] text-muted-foreground">{searchHint(monthLabel)}</div>
      )}
    </div>
  );
}

interface TransactionSearchFrameProps {
  q: string;
  setSearch: (v: string) => void;
  searchGroups: TxGroup[];
  searchCount: number;
  toHuf: (tx: SerializedTx) => number;
  anchorCurrency: string;
  /** The month the search runs over — search only covers the loaded month. */
  monthLabel: string;
  /**
   * The `?q=` from the URL. Tiers whose ledger ignores the query (mobile, tablet) pass it,
   * so arriving with a search — e.g. from the header — shows the results instead of an
   * unfiltered ledger. Only a new value reopens; dismissing clears the input, not the URL.
   */
  urlQuery?: string;
  /** Called once the search has closed, so the owner can drop `?q=` from the URL. */
  onSearchClosed?: () => void;
  onRowClick: (tx: SerializedTx) => void;
  closedControls: (searchButton: ReactNode) => ReactNode;
  ledger: ReactNode;
  afterControls?: ReactNode;
  className?: string;
}

export function TransactionSearchFrame({
  q,
  setSearch,
  searchGroups,
  searchCount,
  toHuf,
  anchorCurrency,
  monthLabel,
  urlQuery,
  onSearchClosed,
  onRowClick,
  closedControls,
  ledger,
  afterControls,
  className,
}: TransactionSearchFrameProps) {
  // Arriving with a query opens already settled (no entrance), so first paint shows results.
  const startOpen = !!urlQuery;
  const [searchOpen, setSearchOpen] = useState(startOpen);
  const [searchAnim, setSearchAnim] = useState(startOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrlQuery = useRef(urlQuery);
  const reduced = usePrefersReducedMotion();

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const openSearch = () => {
    cancelClose();
    setSearchOpen(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setSearchAnim(true);
        inputRef.current?.focus();
      }),
    );
  };

  const closeSearch = () => {
    cancelClose();
    // Only pull focus back when it was inside the search; never steal it from elsewhere.
    const hadFocus = !!frameRef.current?.contains(document.activeElement);
    // Commit now so the controls row is no longer inert, then move focus in the same task:
    // making the search row inert blurs the input, and waiting a frame leaves focus on <body>.
    flushSync(() => setSearchAnim(false));
    if (hadFocus) searchButtonRef.current?.focus();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setSearchOpen(false);
      setSearch('');
      onSearchClosed?.();
    }, reduced ? 0 : 220);
  };

  // A new query arriving from outside (header search while already on this page).
  useEffect(() => {
    if (urlQuery === lastUrlQuery.current) return;
    lastUrlQuery.current = urlQuery;
    if (urlQuery) {
      cancelClose();
      setSearchOpen(true);
      setSearchAnim(true);
    }
  }, [urlQuery]);

  useEffect(() => () => cancelClose(), []);

  const rowTrans = reduced ? `opacity 0.15s ${EASE}` : `opacity 0.18s ${EASE}, transform 0.18s ${EASE}`;
  const searchButton = (
    <button
      ref={searchButtonRef}
      type="button"
      onClick={openSearch}
      aria-label="Search transactions"
      className="w-10 h-10 rounded-[12px] bg-card border border-border/50 flex items-center justify-center text-muted-foreground shrink-0 active:bg-accent/70 transition-colors"
    >
      <SearchIcon className="w-[18px] h-[18px]" />
    </button>
  );

  return (
    <div ref={frameRef} className={cn('space-y-3', className)}>
      <div className="relative" style={{ height: 40 }}>
        <div
          className="absolute inset-0"
          style={{
            opacity: searchAnim ? 0 : 1,
            transform: !reduced && searchAnim ? 'translateX(-10px)' : 'translateX(0)',
            transition: rowTrans,
            pointerEvents: searchAnim ? 'none' : 'auto',
          }}
          inert={searchAnim}
        >
          {closedControls(searchButton)}
        </div>

        {searchOpen && (
          <div
            className="absolute inset-0 flex items-center gap-2"
            style={{
              opacity: searchAnim ? 1 : 0,
              transform: !reduced && !searchAnim ? 'translateX(10px)' : 'translateX(0)',
              transition: rowTrans,
              pointerEvents: searchAnim ? 'auto' : 'none',
            }}
            inert={!searchAnim}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                closeSearch();
              }
            }}
          >
            <label className="flex-1 flex items-center gap-2.5 h-10 px-3.5 rounded-[12px] bg-card border border-ring/60 cursor-text">
              <SearchIcon className="w-[15px] h-[15px] text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={`Search ${monthLabel} by description or category`}
                className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-muted-foreground min-w-0"
                placeholder="Search transactions…"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="shrink-0 text-muted-foreground/60 active:text-foreground"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={closeSearch}
              className="text-[13px] text-primary font-medium shrink-0 px-1"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {afterControls}

      <div className="relative">
        <div
          style={{
            filter: searchAnim && !reduced ? 'blur(3px)' : 'none',
            opacity: searchAnim ? 0.4 : 1,
            pointerEvents: searchAnim ? 'none' : 'auto',
            userSelect: searchAnim ? 'none' : 'auto',
            transition: `filter 0.22s ${EASE}, opacity 0.22s ${EASE}`,
          }}
          inert={searchAnim}
        >
          {ledger}
        </div>

        {searchOpen && (
          <TxSearchOverlay
            key="search-overlay"
            q={q}
            groups={searchGroups}
            count={searchCount}
            shown={searchAnim}
            reduced={reduced}
            toHuf={toHuf}
            anchorCurrency={anchorCurrency}
            monthLabel={monthLabel}
            onRowClick={onRowClick}
          />
        )}
      </div>
    </div>
  );
}

// ── Mobile page tier ────────────────────────────────────────────────────────
interface MobileTransactionsProps {
  baseGroups: TxGroup[];
  baseCount: number;
  mobileNet: number;
  searchGroups: TxGroup[];
  searchCount: number;
  q: string;
  setSearch: (v: string) => void;
  filter: TypeFilter;
  setTypeFilter: (v: TypeFilter) => void;
  monthLabel: string;
  urlQuery?: string;
  onSearchClosed?: () => void;
  onPrev: () => void;
  onNext: () => void;
  isCurrentMonth: boolean;
  anchorCurrency: string;
  toHuf: (tx: SerializedTx) => number;
  onRowClick: (tx: SerializedTx) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function MobileTransactions({
  baseGroups,
  baseCount,
  mobileNet,
  searchGroups,
  searchCount,
  q,
  setSearch,
  filter,
  setTypeFilter,
  monthLabel,
  urlQuery,
  onSearchClosed,
  onPrev,
  onNext,
  isCurrentMonth,
  anchorCurrency,
  toHuf,
  onRowClick,
  page,
  totalPages,
  onPageChange,
}: MobileTransactionsProps) {
  return (
    <TransactionSearchFrame
      q={q}
      setSearch={setSearch}
      searchGroups={searchGroups}
      searchCount={searchCount}
      toHuf={toHuf}
      anchorCurrency={anchorCurrency}
      monthLabel={monthLabel}
      urlQuery={urlQuery}
      onSearchClosed={onSearchClosed}
      onRowClick={onRowClick}
      closedControls={(searchButton) => (
        <div className="flex h-full items-center gap-2">
          <div className="flex-1 min-w-0">
            <Segmented
              size="lg"
              fullWidth
              options={[
                { label: 'All', value: 'all' as TypeFilter },
                { label: 'Income', value: 'INCOME' as TypeFilter },
                { label: 'Expense', value: 'EXPENSE' as TypeFilter },
                { label: 'Savings', value: 'SAVINGS' as TypeFilter },
              ]}
              value={filter}
              onChange={setTypeFilter}
            />
          </div>
          {searchButton}
        </div>
      )}
      afterControls={(
        <MonthNetStrip
          size="md"
          fullWidth
          monthLabel={monthLabel}
          onPrev={onPrev}
          onNext={onNext}
          isCurrentMonth={isCurrentMonth}
          net={mobileNet}
          anchorCurrency={anchorCurrency}
        />
      )}
      ledger={(
        <>
          <CalmCard className="overflow-hidden">
            {baseGroups.length === 0 ? (
              <EmptyMatch />
            ) : (
              <GroupedRows groups={baseGroups} toHuf={toHuf} anchorCurrency={anchorCurrency} onRowClick={onRowClick} />
            )}
          </CalmCard>
          <div className="text-[11px] text-muted-foreground mono px-0.5 mt-3">
            {baseCount} transaction{baseCount === 1 ? '' : 's'}
          </div>

          <PaginationControls page={page} totalPages={totalPages} onChange={onPageChange} className="mt-1" />

          {/* Export lives in the desktop/tablet header, which the mobile tier has no
              room for — so it sits quietly at the end of the ledger instead. */}
          <ExportTransactionsButton className="mt-5 w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-[12px] text-[12.5px] font-medium text-muted-foreground bg-transparent border border-border/50 active:bg-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
        </>
      )}
    />
  );
}
