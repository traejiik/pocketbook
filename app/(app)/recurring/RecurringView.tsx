'use client'

import { useState, useTransition, useEffect, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ArrowUpDown, Check, RepeatIcon, Calendar, RotateCcw, ChevronDown, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Segmented } from '@/components/ui/segmented'
import type { RecurringBudgetSummary } from '@/lib/aggregations'
import { RecurringRuleCard } from '@/components/finance/RecurringRuleCard'
import { AmountDisplay } from '@/components/finance/AmountDisplay'
import { CalmCard } from '@/components/finance/CalmCard'
import { RecurringBudget, CommitmentsLane } from './RecurringBudget'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { PaginationControls } from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DatePicker } from '@/components/ui/date-picker'
import { toast } from 'sonner'
import { notify } from '@/lib/ui-notify'
import { upsertRecurringRule, archiveRecurringRule, unarchiveRecurringRule, deleteRecurringRule, type RecurringRuleInput } from '@/server-actions/recurring'
import { useFabContext } from '@/contexts/fab-context'
import { useIsMobile } from '@/hooks/use-is-mobile'
import type { CardRule } from '@/components/finance/RecurringRuleCard'
import { fmtAnchor, fmtCur, fmtDate } from '@/lib/format'
import { hexToRgba } from '@/lib/colors'

type Category = { id: string; name: string; color: string; kind: string }

export type SerialisedRule = {
  id: string
  name: string
  amount: number
  currency: string
  cycle: string
  nextDue: string          // YYYY-MM-DD
  kind: string
  categoryId: string
  installmentPaid: number | null
  installmentTotal: number | null
  installmentEndsOn: string | null  // YYYY-MM-DD or null
  archived: boolean
  category: Category
  anchorEquivalent: number | null
  hasTransactions: boolean
}

interface Props {
  rules: SerialisedRule[]
  archivedRules: SerialisedRule[]
  categories: Category[]
  budget: RecurringBudgetSummary
  anchorCurrency: string
}

function isCompletedInstallment(r: SerialisedRule) {
  return r.installmentTotal != null && (r.installmentPaid ?? 0) >= r.installmentTotal
}

const formSchema = z.object({
  name: z.string().min(1),
  amount: z.coerce.number().positive(),
  currency: z.enum(['HUF', 'USD', 'EUR', 'GBP']),
  cycle: z.enum(['MONTHLY', 'ANNUAL']),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
  categoryId: z.string().min(1, 'Please select a category'),
  hasInstallment: z.boolean(),
  installmentPaid: z.coerce.number().int().min(0).optional(),
  installmentTotal: z.coerce.number().int().min(1).optional(),
  installmentEndsOn: z.string().optional(),
})

type FormInput = z.input<typeof formSchema>
type FormValues = z.output<typeof formSchema>

function daysUntil(dateStr: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr).getTime() - today.getTime()) / 86_400_000)
}

function dayText(daysAway: number) {
  if (daysAway < 0) return `${Math.abs(daysAway)}d overdue`
  if (daysAway === 0) return 'today'
  return `in ${daysAway}d`
}

function ruleKindName(kind: 'INCOME' | 'EXPENSE' | 'SAVINGS') {
  return kind === 'INCOME' ? 'income' : kind === 'SAVINGS' ? 'savings' : 'expense'
}

function renderSegmentedField({
  labelId,
  label,
  value,
  options,
  onChange,
}: {
  labelId: string
  label: string
  value: string
  options: Array<{ label: string; value: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label id={labelId}>{label}</Label>
      <div
        role="group"
        aria-labelledby={labelId}
        className="grid gap-1 bg-secondary/70 rounded-[10px] p-[3px]"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-9 min-[1025px]:h-[30px] rounded-[8px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              value === option.value
                ? 'bg-card text-foreground font-medium shadow-pb-1'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CompactRuleRow({
  rule,
  anchorCurrency,
  onEdit,
}: {
  rule: SerialisedRule
  anchorCurrency: string
  onEdit: (rule: SerialisedRule) => void
}) {
  const Icon = rule.cycle === 'ANNUAL' ? Calendar : RepeatIcon
  const daysAway = daysUntil(rule.nextDue)
  const urgent = daysAway >= 0 && daysAway <= 7
  const amountTone =
    rule.kind === 'INCOME' ? 'hsl(var(--income))'
    : rule.kind === 'SAVINGS' ? 'hsl(var(--savings))'
    : 'hsl(var(--foreground))'

  return (
    <button
      type="button"
      onClick={() => onEdit(rule)}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-t border-border/40 first:border-t-0 text-left active:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span
        className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0"
        style={{ background: hexToRgba(rule.category.color, 0.14), color: rule.category.color }}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium truncate">{rule.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-muted-foreground">
          <span className="truncate">{rule.category.name}</span>
          <span>·</span>
          <span className={cn('tabular', urgent && 'text-warning')}>{dayText(daysAway)}</span>
          {rule.installmentTotal != null && (
            <span className="mono text-[10px] text-warning rounded-full bg-warning/10 px-1.5 py-px">
              {(rule.installmentPaid ?? 0)}/{rule.installmentTotal}
            </span>
          )}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block tabular text-[15px] font-semibold" style={{ color: amountTone }}>
          {fmtCur(rule.amount, rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP')}
        </span>
        {rule.currency !== anchorCurrency && rule.anchorEquivalent !== null && (
          <span className="mt-0.5 block text-[10.5px] text-muted-foreground tabular">
            ≈ {fmtAnchor(rule.anchorEquivalent, anchorCurrency)}
          </span>
        )}
      </span>
    </button>
  )
}

function ArchivedCompactRow({
  rule,
  top,
  isPending,
  onRestore,
  onDelete,
}: {
  rule: SerialisedRule
  top: boolean
  isPending: boolean
  onRestore: (id: string) => void
  onDelete?: (id: string, name: string) => void
}) {
  const completed = isCompletedInstallment(rule)
  const RowIcon = completed || rule.cycle === 'ANNUAL' ? Calendar : RepeatIcon
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', top && 'border-t border-border/40')}>
      <span
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 grayscale"
        style={{ background: hexToRgba(rule.category.color, 0.12), color: rule.category.color }}
      >
        <RowIcon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium truncate text-foreground/80">{rule.name}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {rule.category.name} · {completed ? `${rule.installmentTotal}/${rule.installmentTotal} done` : 'paused'}
        </div>
      </div>
      {completed ? (
        <span className="shrink-0 mono text-[10px] uppercase tracking-[0.06em] rounded-full px-2 py-0.5 inline-flex items-center gap-1 text-income bg-income/12">
          <Check className="w-3 h-3" />
          Done
        </span>
      ) : (
        <div className="shrink-0 flex items-center gap-1">
          {onDelete && !rule.hasTransactions && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onDelete(rule.id, rule.name)}
              className="text-[12px] text-destructive font-medium px-2 py-1 rounded-md hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => onRestore(rule.id)}
            className="text-[12px] text-primary font-medium px-2 py-1 rounded-md hover:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Restore
          </button>
        </div>
      )}
    </div>
  )
}

export function RecurringView({ rules, archivedRules, categories, budget, anchorCurrency }: Props) {
  type SortKey = 'nextDue' | 'amountDesc' | 'amountAsc' | 'name'
  const [tab, setTab] = useState<'EXPENSE' | 'INCOME' | 'SAVINGS'>('EXPENSE')
  const [sortKey, setSortKey] = useState<SortKey>('nextDue')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<SerialisedRule | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [isPending, startTransition] = useTransition()
  const useBottomSheet = useIsMobile('(max-width: 1024px)', true)

  const restorable = archivedRules.filter((r) => !isCompletedInstallment(r))
  const completed  = archivedRules.filter(isCompletedInstallment)

  const list = rules
    .filter((r) => r.kind === tab)
    .sort((a, b) => {
      switch (sortKey) {
        case 'amountDesc': return b.amount - a.amount
        case 'amountAsc':  return a.amount - b.amount
        case 'name':       return a.name.localeCompare(b.name)
        default:           return a.nextDue.localeCompare(b.nextDue)
      }
    })

  // Mobile-only pagination (10 rules per kind, plus the archived list).
  const RULES_PER_PAGE = 10
  const [mobilePage, setMobilePage] = useState(1)
  const [archivedPage, setArchivedPage] = useState(1)
  useEffect(() => { setMobilePage(1) }, [tab, sortKey])
  useEffect(() => { if (!showArchived) setArchivedPage(1) }, [showArchived])

  const listTotalPages = Math.max(1, Math.ceil(list.length / RULES_PER_PAGE))
  const listPage = Math.min(mobilePage, listTotalPages)
  const pagedList = list.slice((listPage - 1) * RULES_PER_PAGE, listPage * RULES_PER_PAGE)

  const archivedAll = [...restorable, ...completed]
  const archivedTotalPages = Math.max(1, Math.ceil(archivedAll.length / RULES_PER_PAGE))
  const archivedPg = Math.min(archivedPage, archivedTotalPages)
  const pagedArchived = archivedAll.slice((archivedPg - 1) * RULES_PER_PAGE, archivedPg * RULES_PER_PAGE)

  const expenseRules = rules.filter((r) => r.kind === 'EXPENSE')
  const incomeRules  = rules.filter((r) => r.kind === 'INCOME')
  const savingsRules = rules.filter((r) => r.kind === 'SAVINGS')
  const ruleCountLabel = `${list.length} ${ruleKindName(tab)} rule${list.length === 1 ? '' : 's'}`

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      currency: 'HUF',
      cycle: 'MONTHLY',
      kind: 'EXPENSE' as 'INCOME' | 'EXPENSE' | 'SAVINGS',
      hasInstallment: false,
    },
  })

  const hasInstallment = watch('hasInstallment')
  const currency      = watch('currency')
  const cycle         = watch('cycle')
  const kind          = watch('kind')
  const categoryId    = watch('categoryId')
  const nextDue       = watch('nextDue')
  const installmentEndsOn = watch('installmentEndsOn')
  const eligibleRuleCategories = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  )

  useEffect(() => {
    if (!eligibleRuleCategories.some((c) => c.id === categoryId)) {
      setValue('categoryId', eligibleRuleCategories[0]?.id ?? '')
    }
  }, [categoryId, eligibleRuleCategories, setValue])

  const openNew = useCallback(() => {
    setEditing(null)
    reset({
      currency: 'HUF', cycle: 'MONTHLY', kind: tab as 'INCOME' | 'EXPENSE' | 'SAVINGS',
      hasInstallment: false, nextDue: new Date().toISOString().split('T')[0],
    })
    setSheetOpen(true)
  }, [tab, reset])

  const { registerFabAction, clearFabAction } = useFabContext()
  useEffect(() => {
    registerFabAction(openNew)
    return () => clearFabAction()
  }, [registerFabAction, clearFabAction, openNew])

  function openEdit(rule: SerialisedRule) {
    setEditing(rule)
    reset({
      name: rule.name,
      amount: rule.amount,
      currency: rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP',
      cycle: rule.cycle as 'MONTHLY' | 'ANNUAL',
      nextDue: rule.nextDue,
      kind: rule.kind as 'INCOME' | 'EXPENSE' | 'SAVINGS',
      categoryId: rule.categoryId,
      hasInstallment: rule.installmentTotal != null,
      installmentPaid: rule.installmentPaid ?? 0,
      installmentTotal: rule.installmentTotal ?? undefined,
      installmentEndsOn: rule.installmentEndsOn ?? undefined,
    })
    setSheetOpen(true)
  }

  function onSubmit(values: FormValues) {
    const input: RecurringRuleInput = {
      ...values,
      id: editing?.id,
      installmentPaid: values.hasInstallment ? values.installmentPaid : null,
      installmentTotal: values.hasInstallment ? values.installmentTotal : null,
      installmentEndsOn: values.hasInstallment && values.installmentEndsOn ? values.installmentEndsOn : null,
    }
    startTransition(async () => {
      const result = await upsertRecurringRule(input)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      if (result.backfilledCount && result.backfilledFrom && result.backfilledTo) {
        const range = result.backfilledFrom === result.backfilledTo
          ? fmtDate(result.backfilledFrom, { short: true })
          : `${fmtDate(result.backfilledFrom, { short: true })}–${fmtDate(result.backfilledTo, { short: true })}`
        notify.success(`Added ${result.backfilledCount} catch-up transaction${result.backfilledCount === 1 ? '' : 's'} for ${range}.`)
      } else {
        notify.success(editing ? `Saved ${values.name}` : `Created ${values.name}`)
      }
      setSheetOpen(false)
    })
  }

  function onArchive() {
    if (!editing) return
    const name = editing.name
    startTransition(async () => {
      await archiveRecurringRule(editing.id)
      notify.success(`Archived ${name}`)
      setSheetOpen(false)
    })
  }

  function onDelete(id: string, name: string) {
    startTransition(async () => {
      const result = await deleteRecurringRule(id)
      if (result && 'error' in result) {
        toast.error(result.error)
        return
      }
      notify.success(`Deleted ${name}`)
      setSheetOpen(false) // no-op when invoked from the archived list
    })
  }

  function onRestore(id: string) {
    startTransition(async () => {
      const result = await unarchiveRecurringRule(id)
      if (result && 'error' in result) {
        toast.error(result.error)
        return
      }
      notify.success('Rule restored.')
    })
  }

  return (
    <div className="px-4 lg:px-7 pb-9 pt-1 space-y-5 max-w-[920px] min-[1025px]:max-w-[1320px] mx-auto">
      <div className="hidden md:flex items-center justify-between gap-3">
        <div className="text-[12.5px] text-muted-foreground">
          Subscriptions, installments, and recurring income.
        </div>
        <Button size="sm" onClick={openNew} className="hidden md:inline-flex">
          <Plus className="w-3.5 h-3.5" />
          New rule
        </Button>
      </div>

      {/* Budget summary — committed card + KPI grid */}
      <RecurringBudget
        budget={budget}
        rules={rules}
        counts={{ income: incomeRules.length, expense: expenseRules.length, savings: savingsRules.length }}
        anchorCurrency={anchorCurrency}
      />

      {/* 30-day commitments cash-flow lane */}
      <CommitmentsLane rules={rules} anchorCurrency={anchorCurrency} />

      <div className="hidden md:flex items-center justify-between gap-3 flex-wrap">
        <Segmented
          options={[
            { label: `Expenses · ${expenseRules.length}`, value: 'EXPENSE' as const },
            { label: `Income · ${incomeRules.length}`,    value: 'INCOME'  as const },
            { label: `Savings · ${savingsRules.length}`,  value: 'SAVINGS' as const },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Popover>
          <PopoverTrigger className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-border/60 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
            <ArrowUpDown className="w-3.5 h-3.5" />
            Sort
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1.5">
            <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground px-2 py-1.5">
              Sort by
            </div>
            {([
              { value: 'nextDue',    label: 'Next due' },
              { value: 'amountDesc', label: 'Amount — high to low' },
              { value: 'amountAsc',  label: 'Amount — low to high' },
              { value: 'name',       label: 'Name A–Z' },
            ] as { value: SortKey; label: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setSortKey(opt.value)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[12.5px] hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
              >
                <span className={sortKey === opt.value ? 'text-foreground' : 'text-muted-foreground'}>
                  {opt.label}
                </span>
                {sortKey === opt.value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            ))}
          </PopoverContent>
          </Popover>
      </div>

      <div className="md:hidden">
        <Segmented
          className="grid grid-cols-3 w-full [&>button]:px-1.5"
          options={[
            { label: `Expenses • ${expenseRules.length}`, value: 'EXPENSE' as const },
            { label: `Income • ${incomeRules.length}`, value: 'INCOME' as const },
            { label: `Savings • ${savingsRules.length}`, value: 'SAVINGS' as const },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="text-[11px] mono uppercase tracking-[0.12em] text-muted-foreground px-0.5">
        {ruleCountLabel}
      </div>

      {list.length === 0 ? (
        <Empty
          icon={RepeatIcon}
          title={`No ${tab === 'EXPENSE' ? 'expense' : tab === 'INCOME' ? 'income' : 'savings'} rules`}
          body="Add a recurring rule to track subscriptions, installments, and regular income."
          action={<Button size="sm" onClick={openNew}>New rule</Button>}
        />
      ) : (
        <>
          <div className="md:hidden">
            <CalmCard className="overflow-hidden">
              {pagedList.map((r) => (
                <CompactRuleRow
                  key={r.id}
                  rule={r}
                  anchorCurrency={anchorCurrency}
                  onEdit={openEdit}
                />
              ))}
            </CalmCard>
          </div>
          <div className="hidden md:grid grid-cols-1 md:grid-cols-2 min-[1025px]:grid-cols-3 gap-4">
            {list.map((r) => (
              <RecurringRuleCard
                key={r.id}
                rule={r as CardRule}
                hufEquivalent={r.anchorEquivalent}
                daysAway={daysUntil(r.nextDue)}
                onEdit={(c) => openEdit(c as SerialisedRule)}
                anchorCurrency={anchorCurrency}
              />
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={openNew}
        className="md:hidden w-full inline-flex items-center justify-center gap-2 h-11 rounded-[12px] text-[13px] font-medium text-muted-foreground bg-card border border-border/60 active:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Plus className="w-4 h-4" />
        New rule
      </button>

      <PaginationControls page={listPage} totalPages={listTotalPages} onChange={setMobilePage} className="md:hidden mt-3" />

      {/* Archived rules — paused/removed (restorable) and completed installments (terminal) */}
      {archivedRules.length > 0 && (
        <div className="pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-md py-1"
          >
            <ChevronDown className={cn('w-4 h-4 transition-transform', showArchived ? '' : '-rotate-90')} />
            Archived · {archivedRules.length}
          </button>

          {showArchived && (
            <>
              {/* Mobile — compact flat rows, paused then completed */}
              <div className="md:hidden">
                <CalmCard className="mt-3 overflow-hidden">
                  {pagedArchived.map((r, i) => (
                    <ArchivedCompactRow
                      key={r.id}
                      rule={r}
                      top={i > 0}
                      isPending={isPending}
                      onRestore={onRestore}
                      onDelete={onDelete}
                    />
                  ))}
                </CalmCard>
                <PaginationControls page={archivedPg} totalPages={archivedTotalPages} onChange={setArchivedPage} className="mt-3" />
              </div>

              {/* Tablet/desktop — grouped cards */}
              <div className="mt-3 space-y-5 hidden md:block">
                {restorable.length > 0 && (
                  <ArchivedGroup
                    label="Paused or removed"
                    rules={restorable}
                    anchorCurrency={anchorCurrency}
                    isPending={isPending}
                    onRestore={onRestore}
                    onDelete={onDelete}
                  />
                )}
                {completed.length > 0 && (
                  <ArchivedGroup
                    label="Completed installments"
                    rules={completed}
                    anchorCurrency={anchorCurrency}
                    isPending={isPending}
                    onRestore={onRestore}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Rule sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side={useBottomSheet ? 'bottom' : 'right'}
          className={cn(
            'w-full mx-auto flex flex-col gap-0 p-0',
            'max-h-[92dvh] max-w-[560px] !rounded-t-[24px]',
            'min-[1025px]:mx-0 min-[1025px]:h-full min-[1025px]:max-h-none min-[1025px]:!w-[420px] min-[1025px]:!max-w-[420px] min-[1025px]:!rounded-none',
          )}
        >
          <div className="flex justify-center pt-2.5 pb-1 min-[1025px]:hidden">
            <div className="h-1.5 w-10 rounded-full bg-border" />
          </div>
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
            <SheetTitle>{editing ? 'Edit rule' : 'New recurring rule'}</SheetTitle>
            <SheetDescription className="text-[11.5px]">
              {editing ? editing.name : 'Subscriptions, installments and recurring income'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="px-5 space-y-4 py-5 flex-1 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" {...register('name')} placeholder="e.g. Spotify Family" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'rule-name-error' : undefined} />
              {errors.name && <p id="rule-name-error" className="text-[11px] text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-[1fr_116px] min-[1025px]:grid-cols-[1fr_110px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rule-amount">Amount</Label>
                <Input id="rule-amount" type="number" step="0.01" {...register('amount')} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label id="rule-currency-label">Currency</Label>
                <Select value={currency} onValueChange={(v) => v && setValue('currency', v as 'HUF' | 'USD' | 'EUR' | 'GBP')}>
                  <SelectTrigger aria-labelledby="rule-currency-label" className="h-9! w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['HUF', 'USD', 'EUR', 'GBP'].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {renderSegmentedField({
                labelId: 'rule-cycle-label',
                label: 'Cycle',
                value: cycle,
                options: [
                  { label: 'Monthly', value: 'MONTHLY' },
                  { label: 'Annual', value: 'ANNUAL' },
                ],
                onChange: (v) => setValue('cycle', v as 'MONTHLY' | 'ANNUAL'),
              })}
              {renderSegmentedField({
                labelId: 'rule-kind-label',
                label: 'Kind',
                value: kind,
                options: [
                  { label: 'Expense', value: 'EXPENSE' },
                  { label: 'Income', value: 'INCOME' },
                  { label: 'Savings', value: 'SAVINGS' },
                ],
                onChange: (v) => setValue('kind', v as 'INCOME' | 'EXPENSE' | 'SAVINGS'),
              })}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-nextdue">Next due</Label>
              <DatePicker id="rule-nextdue" value={nextDue} onChange={(v) => setValue('nextDue', v)} />
            </div>

            <div className="space-y-1.5">
              <Label id="rule-category-label">Category</Label>
              <Select value={categoryId} onValueChange={(v: string | null) => { if (v) setValue('categoryId', v) }}>
                <SelectTrigger aria-labelledby="rule-category-label" aria-describedby={errors.categoryId ? 'rule-category-error' : undefined} className="h-9! w-full">
                  <SelectValue placeholder="Select category">
                    {categoryId
                      ? (categories.find(c => c.id === categoryId)?.name ?? undefined)
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {eligibleRuleCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && (
                <p id="rule-category-error" className="text-[11px] text-destructive">{errors.categoryId.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <div>
                <Label htmlFor="rule-installment" className="text-[13px] font-medium text-foreground">Installment plan</Label>
                <div className="text-[11px] text-muted-foreground mt-0.5">Track a fixed number of payments</div>
              </div>
              <Switch
                id="rule-installment"
                checked={hasInstallment}
                onCheckedChange={(v) => setValue('hasInstallment', v)}
              />
            </div>

            {hasInstallment && (
              <div className="space-y-3 p-3.5 rounded-[12px] bg-secondary/50 border border-border/60">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-paid">Paid</Label>
                    <Input id="rule-paid" type="number" {...register('installmentPaid')} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-total">Total</Label>
                    <Input id="rule-total" type="number" {...register('installmentTotal')} placeholder="12" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-endson">Ends on</Label>
                  <DatePicker id="rule-endson" value={installmentEndsOn ?? ''} onChange={(v) => setValue('installmentEndsOn', v)} />
                </div>
              </div>
            )}
          </form>

          <SheetFooter className="flex flex-row gap-2 pl-[max(env(safe-area-inset-left),1.5rem)] pr-[max(env(safe-area-inset-right),1.5rem)] pt-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] border-t border-border shrink-0">
            {editing && (
              editing.hasTransactions ? (
                <Button variant="destructive" size="sm" onClick={onArchive} type="button" disabled={isPending}>
                  Archive
                </Button>
              ) : (
                <Button variant="destructive" size="sm" onClick={() => onDelete(editing.id, editing.name)} type="button" disabled={isPending}>
                  Delete
                </Button>
              )
            )}
            <Button variant="outline" size="sm" onClick={() => setSheetOpen(false)} type="button" className="ml-auto" disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit(onSubmit)} type="button" disabled={isPending}>
              {editing ? 'Save changes' : 'Create rule'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ArchivedGroup({
  label,
  rules,
  anchorCurrency,
  isPending,
  onRestore,
  onDelete,
}: {
  label: string
  rules: SerialisedRule[]
  anchorCurrency: string
  isPending: boolean
  onRestore: (id: string) => void
  onDelete?: (id: string, name: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] mono uppercase tracking-[0.12em] text-muted-foreground px-0.5">
        {label} · {rules.length}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 min-[1025px]:grid-cols-3 gap-4">
        {rules.map((r) => {
          const completed = isCompletedInstallment(r)
          return (
            <div key={r.id} className="calm-card p-5 flex flex-col gap-3 opacity-[0.92] overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0',
                      completed && 'grayscale',
                    )}
                    style={{ background: hexToRgba(r.category.color, 0.12), color: r.category.color }}
                  >
                    {r.cycle === 'ANNUAL' ? <Calendar className="w-4 h-4" /> : <RepeatIcon className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium truncate text-foreground/80">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {r.cycle.toLowerCase()} · {r.category.name}
                    </div>
                  </div>
                </div>
                {completed ? (
                  <span className="shrink-0 mono text-[10px] uppercase tracking-[0.06em] rounded-full px-2 py-0.5 inline-flex items-center gap-1 text-income bg-income/12">
                    <Check className="w-3 h-3" />
                    Done
                  </span>
                ) : (
                  <span className="shrink-0 mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground rounded-full px-2 py-0.5 border border-border">
                    Paused
                  </span>
                )}
              </div>

              <div className="flex items-baseline justify-between">
                <AmountDisplay
                  value={r.amount}
                  currency={r.currency as 'HUF' | 'USD' | 'EUR' | 'GBP'}
                  tone={r.kind === 'INCOME' ? 'income' : 'expense'}
                  size="md"
                />
                {r.currency !== anchorCurrency && r.anchorEquivalent !== null && (
                  <div className="text-[10.5px] text-muted-foreground tabular">≈ {fmtAnchor(r.anchorEquivalent, anchorCurrency)}</div>
                )}
              </div>

              {r.installmentTotal != null && (
                <div className="pt-3 border-t border-border/40">
                  <div className="h-1.5 rounded-full overflow-hidden bg-secondary">
                    <div
                      className={cn('h-full rounded-full', completed ? 'bg-income' : 'bg-warning')}
                      style={{
                        width: completed
                          ? '100%'
                          : `${Math.min(100, ((r.installmentPaid ?? 0) / r.installmentTotal) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="text-[10.5px] text-muted-foreground mt-1.5">
                    {completed
                      ? `Completed ${r.installmentTotal}/${r.installmentTotal}${r.installmentEndsOn ? ` · finished ${fmtDate(r.installmentEndsOn)}` : ''}`
                      : `${r.installmentPaid ?? 0}/${r.installmentTotal} paid`}
                  </div>
                </div>
              )}

              {!completed && (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-[9px] text-[12px] text-muted-foreground hover:text-foreground border border-border/60 bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    disabled={isPending}
                    onClick={() => onRestore(r.id)}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore
                  </button>
                  {onDelete && !r.hasTransactions && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-[9px] text-[12px] text-destructive hover:bg-destructive/10 border border-border/60 bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      disabled={isPending}
                      onClick={() => onDelete(r.id, r.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
