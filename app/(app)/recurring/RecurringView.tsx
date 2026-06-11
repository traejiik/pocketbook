'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ArrowUpDown, Check, RepeatIcon, Calendar, Repeat2, RotateCcw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Segmented } from '@/components/ui/segmented'
import { KpiBig } from '@/components/finance/KpiBig'
import { GaugeMeter } from '@/components/finance/GaugeMeter'
import type { RecurringBudgetSummary } from '@/lib/aggregations'
import { RecurringRuleCard } from '@/components/finance/RecurringRuleCard'
import { AmountDisplay } from '@/components/finance/AmountDisplay'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'
import { upsertRecurringRule, archiveRecurringRule, unarchiveRecurringRule, type RecurringRuleInput } from '@/server-actions/recurring'
import { useFabContext } from '@/contexts/fab-context'
import type { CardRule } from '@/components/finance/RecurringRuleCard'
import { fmtAnchor, fmtDate } from '@/lib/format'

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

export function RecurringView({ rules, archivedRules, categories, budget, anchorCurrency }: Props) {
  type SortKey = 'nextDue' | 'amountDesc' | 'amountAsc' | 'name'
  const [tab, setTab] = useState<'EXPENSE' | 'INCOME' | 'SAVINGS'>('EXPENSE')
  const [sortKey, setSortKey] = useState<SortKey>('nextDue')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<SerialisedRule | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [isPending, startTransition] = useTransition()

  const restorable = archivedRules.filter((r) => !isCompletedInstallment(r))
  const completed  = archivedRules.filter(isCompletedInstallment)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

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

  const expenseRules = rules.filter((r) => r.kind === 'EXPENSE')
  const incomeRules  = rules.filter((r) => r.kind === 'INCOME')
  const savingsRules = rules.filter((r) => r.kind === 'SAVINGS')

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
        toast.success(`Added ${result.backfilledCount} catch-up transaction${result.backfilledCount === 1 ? '' : 's'} for ${range}.`)
      }
      setSheetOpen(false)
    })
  }

  function onArchive() {
    if (!editing) return
    startTransition(async () => {
      await archiveRecurringRule(editing.id)
      setSheetOpen(false)
    })
  }

  function onRestore(id: string) {
    startTransition(async () => {
      const result = await unarchiveRecurringRule(id)
      if (result && 'error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Rule restored.')
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5 max-w-[1240px] mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Recurring rules</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            Subscriptions, installments, and recurring income.
          </div>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New rule</span>
        </Button>
      </div>

      {/* Budget summary — gauge left, 2×2 KPI grid right */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-3 sm:gap-4 items-stretch">
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center justify-center gap-3">
          <GaugeMeter percent={Math.round(budget.expenseRatio * 100)} />
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-income" />
              Used
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="w-3 h-2.5 rounded-sm"
                style={{
                  background: 'repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.35) 0 2px, transparent 2px 5px)',
                  border: '1px solid hsl(var(--border))',
                }}
              />
              Left
            </span>
          </div>
          {budget.expensesByCategory.length > 0 && (
            <div className="w-full border-t border-border pt-3 space-y-1.5">
              {budget.expensesByCategory.slice(0, 4).map(c => {
                const pct = budget.monthlyExpenses > 0
                  ? Math.round((c.amount / budget.monthlyExpenses) * 100)
                  : 0
                return (
                  <div key={c.categoryId} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="flex-1 text-[11px] text-muted-foreground truncate">{c.name}</span>
                    <span className="text-[11px] tabular text-foreground/60">{pct}%</span>
                  </div>
                )
              })}
              {budget.expensesByCategory.length > 4 && (
                <p className="text-[10.5px] text-muted-foreground pl-4">
                  +{budget.expensesByCategory.length - 4} more
                </p>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 grid-rows-2 gap-3 sm:gap-4">
          <KpiBig label="Income"   value={budget.monthlyIncome}   tone="income" />
          <KpiBig label="Expenses" value={budget.monthlyExpenses} tone="expense" />
          <KpiBig label="Net"      value={budget.netUsable}       tone={budget.netUsable >= 0 ? 'income' : 'expense'} />
          <KpiBig label="Savings"  value={budget.monthlySavings}  tone="savings" />
        </div>
      </div>
      {budget.hasNormalisedAnnuals && (
        <p className="text-xs text-muted-foreground">
          Annual rules are shown as monthly equivalents (÷ 12)
        </p>
      )}

      <div className="flex items-center justify-between">
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
          <PopoverTrigger className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
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

      {list.length === 0 ? (
        <Empty
          icon={RepeatIcon}
          title={`No ${tab === 'EXPENSE' ? 'expense' : tab === 'INCOME' ? 'income' : 'savings'} rules`}
          body="Add a recurring rule to track subscriptions, installments, and regular income."
          action={<Button size="sm" onClick={openNew}>New rule</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
      )}

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
            <div className="mt-3 space-y-5">
              {restorable.length > 0 && (
                <ArchivedGroup
                  label="Paused or removed"
                  rules={restorable}
                  anchorCurrency={anchorCurrency}
                  isPending={isPending}
                  onRestore={onRestore}
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
          )}
        </div>
      )}

      {/* Rule sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side={isMobile ? 'bottom' : 'right'} className="w-full sm:w-105 sm:max-w-105 max-sm:h-[95dvh] flex flex-col gap-0 p-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
            <SheetTitle>{editing ? 'Edit rule' : 'New recurring rule'}</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="px-5 space-y-4 py-5 flex-1 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" {...register('name')} placeholder="e.g. Spotify Family" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'rule-name-error' : undefined} />
              {errors.name && <p id="rule-name-error" className="text-[11px] text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rule-amount">Amount</Label>
                <Input id="rule-amount" type="number" step="0.01" {...register('amount')} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label id="rule-currency-label">Currency</Label>
                <Select value={currency} onValueChange={(v) => v && setValue('currency', v as 'HUF' | 'USD' | 'EUR' | 'GBP')}>
                  <SelectTrigger aria-labelledby="rule-currency-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['HUF', 'USD', 'EUR', 'GBP'].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label id="rule-cycle-label">Cycle</Label>
                <Select value={cycle} onValueChange={(v) => v && setValue('cycle', v as 'MONTHLY' | 'ANNUAL')}>
                  <SelectTrigger aria-labelledby="rule-cycle-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="ANNUAL">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label id="rule-kind-label">Kind</Label>
                <Select value={kind} onValueChange={(v) => v && setValue('kind', v as 'INCOME' | 'EXPENSE' | 'SAVINGS')}>
                  <SelectTrigger aria-labelledby="rule-kind-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXPENSE">Expense</SelectItem>
                    <SelectItem value="INCOME">Income</SelectItem>
                    <SelectItem value="SAVINGS">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-nextdue">Next due</Label>
              <Input id="rule-nextdue" type="date" {...register('nextDue')} />
            </div>

            <div className="space-y-1.5">
              <Label id="rule-category-label">Category</Label>
              <Select value={categoryId} onValueChange={(v: string | null) => { if (v) setValue('categoryId', v) }}>
                <SelectTrigger aria-labelledby="rule-category-label" aria-describedby={errors.categoryId ? 'rule-category-error' : undefined}>
                  <SelectValue placeholder="Select category">
                    {categoryId
                      ? (categories.find(c => c.id === categoryId)?.name ?? undefined)
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && (
                <p id="rule-category-error" className="text-[11px] text-destructive">{errors.categoryId.message}</p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Switch
                id="rule-installment"
                checked={hasInstallment}
                onCheckedChange={(v) => setValue('hasInstallment', v)}
              />
              <Label htmlFor="rule-installment">Installment plan</Label>
            </div>

            {hasInstallment && (
              <div className="space-y-3 p-3 rounded-lg bg-secondary/50 border border-border">
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
                  <Input id="rule-endson" type="date" {...register('installmentEndsOn')} />
                </div>
              </div>
            )}
          </form>

          <SheetFooter className="flex flex-row gap-2 px-5 py-4 border-t border-border shrink-0">
            {editing && (
              <Button variant="destructive" size="sm" onClick={onArchive} type="button" disabled={isPending}>
                Archive
              </Button>
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
}: {
  label: string
  rules: SerialisedRule[]
  anchorCurrency: string
  isPending: boolean
  onRestore: (id: string) => void
}) {
  return (
    <div className="space-y-2.5">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rules.map((r) => {
          const completed = isCompletedInstallment(r)
          return (
            <div key={r.id} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-md border border-border flex items-center justify-center shrink-0"
                    style={{ background: `${r.category.color}18`, color: r.category.color }}
                  >
                    {r.cycle === 'ANNUAL' ? <Calendar className="w-4 h-4" /> : <Repeat2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium truncate">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {r.cycle.toLowerCase()} · {r.category.name}
                    </div>
                  </div>
                </div>
                {completed ? (
                  <span className="shrink-0 text-[10px] mono uppercase tracking-wide text-muted-foreground border border-border rounded-full px-2 py-0.5">
                    Completed
                  </span>
                ) : (
                  <Button variant="outline" size="sm" type="button" className="shrink-0" disabled={isPending} onClick={() => onRestore(r.id)}>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore
                  </Button>
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
                <div className="text-[11px] mono text-muted-foreground">
                  {r.installmentPaid ?? 0}/{r.installmentTotal} paid
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
