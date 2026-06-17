'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { fmtAnchor } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MonthNetStripProps {
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
  /** Disables the → button when viewing the current (latest) month. */
  isCurrentMonth: boolean;
  /** Net total in the anchor currency (signed). */
  net: number;
  anchorCurrency: string;
  /** `sm` = 36px desktop strip; `md` = 40px tablet/mobile strip. */
  size?: 'sm' | 'md';
  /** Stretch full-width with the net pushed to the right edge (mobile). */
  fullWidth?: boolean;
  className?: string;
}

// v5 month/net pill — bordered bg-card strip shared across all three tiers.
// Month nav on the left, a hairline divider, then the net for the active filters.
export function MonthNetStrip({
  monthLabel,
  onPrev,
  onNext,
  isCurrentMonth,
  net,
  anchorCurrency,
  size = 'sm',
  fullWidth = false,
  className,
}: MonthNetStripProps) {
  return (
    <div
      className={cn(
        'flex items-center bg-card border border-border/45 px-3',
        size === 'md' ? 'h-10' : 'h-9',
        fullWidth ? 'w-full justify-between rounded-[14px]' : 'gap-1.5 rounded-[10px]',
        className,
      )}
    >
      <div className={cn('flex items-center', fullWidth ? 'gap-0.5' : 'gap-1.5')}>
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous month"
          className="relative w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 after:absolute after:-inset-2 md:after:hidden"
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
        <span className="text-[13px] font-medium tabular px-1 min-w-[88px] text-center">{monthLabel}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={isCurrentMonth}
          aria-label="Next month"
          className="relative w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 after:absolute after:-inset-2 md:after:hidden"
        >
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <span className={cn('mono text-[11.5px] text-muted-foreground pl-3 pr-1 border-l border-border/50', !fullWidth && 'ml-1')}>
        Net:{' '}
        <span className={cn('font-medium', net >= 0 ? 'text-income' : 'text-expense')}>
          {fmtAnchor(net, anchorCurrency, { signed: true })}
        </span>
      </span>
    </div>
  );
}
