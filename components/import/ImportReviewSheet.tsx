'use client'

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { cn } from '@/lib/utils'

export type ReviewCounts = { new: number; duplicate: number; error: number }

/**
 * "27 new · 3 duplicates · 1 error", with how much of the file is ready to import
 * on the right — the one figure that moves as decisions are made, so the eye has
 * somewhere to return to.
 */
export function ReviewSummary({ counts, ready }: { counts: ReviewCounts; ready?: { done: number; total: number } }) {
  const parts = [
    counts.new > 0 && { n: counts.new, label: 'new', tone: 'text-foreground' },
    counts.duplicate > 0 && { n: counts.duplicate, label: `duplicate${counts.duplicate === 1 ? '' : 's'}`, tone: 'text-muted-foreground' },
    counts.error > 0 && { n: counts.error, label: `error${counts.error === 1 ? '' : 's'}`, tone: 'text-destructive' },
  ].filter(Boolean) as { n: number; label: string; tone: string }[]
  const complete = ready && ready.total > 0 && ready.done === ready.total
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
      {parts.map((p, i) => (
        <span key={p.label} className={cn('inline-flex items-center gap-1', p.tone)}>
          {i > 0 && <span className="text-muted-foreground/60 mr-1.5">·</span>}
          <span className="tabular font-medium">{p.n}</span> {p.label}
        </span>
      ))}
      {ready && ready.total > 0 && (
        <span className={cn('ml-auto mono text-[11.5px] tabular', complete ? 'text-income' : 'text-primary')}>
          {ready.done} of {ready.total} ready
        </span>
      )}
    </div>
  )
}

/**
 * A collapsed group of rows that need no decision (duplicates, errors): the
 * heading is the control, so nothing here competes with the list above it.
 */
export function ReviewDisclosure({ label, count, tone = 'muted', children }: {
  label: string
  count: number
  tone?: 'muted' | 'destructive'
  children: ReactNode
}) {
  return (
    <details className="group pt-4">
      <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
        <div className={cn('flex items-center gap-2 pb-2', tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground')}>
          <ChevronRight className="w-3 h-3 shrink-0 transition-transform group-open:rotate-90" />
          <h3 className="text-[11px] mono uppercase tracking-[0.12em] font-medium">{label}</h3>
          <span className="mono text-[11px]">{count}</span>
          <div className="flex-1 h-px bg-border ml-2" />
        </div>
      </summary>
      {children}
    </details>
  )
}

/** Section heading inside the review list ("New", "Duplicates", "Errors"). */
export function ReviewGroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 pt-4 pb-2">
      <h3 className="text-[11px] mono uppercase tracking-[0.12em] text-muted-foreground font-medium">{label}</h3>
      <span className="mono text-[11px] text-muted-foreground">{count}</span>
      <div className="flex-1 h-px bg-border ml-2" />
    </div>
  )
}

interface ImportReviewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  filename: string
  summary: ReactNode
  children: ReactNode
  footer: ReactNode
}

/**
 * Shared frame for reviewing an import before it is written: a bottom sheet on
 * mobile/tablet and a wide right-hand panel from 1025px, with the summary pinned
 * above a scrolling row list and the actions pinned below it.
 */
export function ImportReviewSheet({ open, onOpenChange, title, filename, summary, children, footer }: ImportReviewSheetProps) {
  const bottom = useIsMobile('(max-width: 1024px)', true)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={bottom ? 'bottom' : 'right'}
        className={cn(
          bottom
            ? 'w-full mx-auto max-w-[720px] h-[92dvh] !rounded-t-[24px]'
            : 'w-full sm:!max-w-[760px]',
          'gap-0',
        )}
      >
        <SheetHeader className="border-b border-border/50 gap-2">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="mono text-[11.5px] truncate">{filename}</SheetDescription>
          {summary}
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">{children}</div>
        <SheetFooter className="border-t border-border/50 flex-row items-center justify-end gap-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {footer}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
