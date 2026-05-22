'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ArrowUpDown, Check, RepeatIcon } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import { KpiCard } from '@/components/finance/KpiCard'
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
import { upsertRecurringRule, archiveRecurringRule, type RecurringRuleInput } from '@/server-actions/recurring'
import type { CardRule } from '@/components/finance/RecurringRuleCard'

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
}

interface Props {
  rules: SerialisedRule[]
  categories: Category[]
  monthlyTotal: number
  annualTotal: number
  incomeMonthly: number
}

const formSchema = z.object({
  name: z.string().min(1),
  amount: z.coerce.number().positive(),
  currency: z.enum(['HUF', 'USD', 'EUR', 'GBP']),
  cycle: z.enum(['MONTHLY', 'ANNUAL']),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['INCOME', 'EXPENSE']),
  categoryId: z.string().min(1, 'Please select a category'),
  hasInstallment: z.boolean(),
  installmentPaid: z.coerce.number().int().min(0).optional(),
  installmentTotal: z.coerce.number().int().min(1).optional(),
  installmentEndsOn: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)

function daysUntil(dateStr: string) {
  return Math.round((new Date(dateStr).getTime() - TODAY.getTime()) / 86_400_000)
}

export function RecurringView({ rules, categories, monthlyTotal, annualTotal, incomeMonthly }: Props) {
  type SortKey = 'nextDue' | 'amountDesc' | 'amountAsc' | 'name'
  const [tab, setTab] = useState<'EXPENSE' | 'INCOME'>('EXPENSE')
  const [sortKey, setSortKey] = useState<SortKey>('nextDue')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<SerialisedRule | null>(null)
  const [isPending, startTransition] = useTransition()

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

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      currency: 'HUF',
      cycle: 'MONTHLY',
      kind: 'EXPENSE',
      hasInstallment: false,
    },
  })

  const hasInstallment = watch('hasInstallment')
  const currency      = watch('currency')
  const cycle         = watch('cycle')
  const kind          = watch('kind')
  const categoryId    = watch('categoryId')

  function openNew() {
    setEditing(null)
    reset({
      currency: 'HUF', cycle: 'MONTHLY', kind: tab as 'INCOME' | 'EXPENSE',
      hasInstallment: false, nextDue: new Date().toISOString().split('T')[0],
    })
    setSheetOpen(true)
  }

  function openEdit(rule: SerialisedRule) {
    setEditing(rule)
    reset({
      name: rule.name,
      amount: rule.amount,
      currency: rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP',
      cycle: rule.cycle as 'MONTHLY' | 'ANNUAL',
      nextDue: rule.nextDue,
      kind: rule.kind as 'INCOME' | 'EXPENSE',
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
      if (result.backfilled && result.backfilledDate) {
        toast.success(`Added missed payment for ${result.backfilledDate} as a transaction.`)
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

  return (
    <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5 max-w-[1240px] mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Recurring rules</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            Subscriptions, installments, and recurring income.
          </div>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-primary text-primary-foreground font-medium text-[13px] hover:opacity-90 transition"
        >
          <Plus className="w-3.5 h-3.5" /> New rule
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Monthly outflow</div>
          <div className="mt-1.5"><AmountDisplay value={monthlyTotal} tone="expense" size="lg" /></div>
          <div className="text-[11px] text-muted-foreground mt-1">{expenseRules.filter(r => r.cycle === 'MONTHLY').length} monthly rules</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Annual outflow</div>
          <div className="mt-1.5"><AmountDisplay value={annualTotal} tone="expense" size="lg" /></div>
          <div className="text-[11px] text-muted-foreground mt-1">{expenseRules.filter(r => r.cycle === 'ANNUAL').length} annual rules</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Annualised total</div>
          <div className="mt-1.5"><AmountDisplay value={monthlyTotal * 12 + annualTotal} tone="neutral" size="lg" /></div>
          <div className="text-[11px] text-muted-foreground mt-1">All subscriptions / 12 mo</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Monthly income</div>
          <div className="mt-1.5"><AmountDisplay value={incomeMonthly} tone="income" size="lg" /></div>
          <div className="text-[11px] text-muted-foreground mt-1">{incomeRules.filter(r => r.cycle === 'MONTHLY').length} recurring sources</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Segmented
          options={[
            { label: `Expenses · ${expenseRules.length}`, value: 'EXPENSE' as const },
            { label: `Income · ${incomeRules.length}`,   value: 'INCOME' as const },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Popover>
          <PopoverTrigger className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
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
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[12.5px] hover:bg-accent transition-colors"
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
          title={`No ${tab === 'EXPENSE' ? 'expense' : 'income'} rules`}
          body="Add a recurring rule to track subscriptions, installments, and regular income."
          action={<Button size="sm" onClick={openNew}>New rule</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((r) => (
            <RecurringRuleCard
              key={r.id}
              rule={r as CardRule}
              hufEquivalent={r.amount}
              daysAway={daysUntil(r.nextDue)}
              onEdit={(c) => openEdit(c as SerialisedRule)}
            />
          ))}
        </div>
      )}

      {/* Rule sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit rule' : 'New recurring rule'}</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="px-4 space-y-4 pb-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input {...register('name')} placeholder="e.g. Spotify Family" />
              {errors.name && <p className="text-[11px] text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input type="number" step="0.01" {...register('amount')} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => v && setValue('currency', v as 'HUF' | 'USD' | 'EUR' | 'GBP')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label>Cycle</Label>
                <Select value={cycle} onValueChange={(v) => v && setValue('cycle', v as 'MONTHLY' | 'ANNUAL')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="ANNUAL">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select value={kind} onValueChange={(v) => v && setValue('kind', v as 'INCOME' | 'EXPENSE')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXPENSE">Expense</SelectItem>
                    <SelectItem value="INCOME">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Next due</Label>
              <Input type="date" {...register('nextDue')} />
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={(v: string | null) => { if (v) setValue('categoryId', v) }}>
                <SelectTrigger>
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
                <p className="text-[11px] text-destructive">{errors.categoryId.message}</p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={hasInstallment}
                onCheckedChange={(v) => setValue('hasInstallment', v)}
              />
              <Label>Installment plan</Label>
            </div>

            {hasInstallment && (
              <div className="space-y-3 p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Paid</Label>
                    <Input type="number" {...register('installmentPaid')} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Total</Label>
                    <Input type="number" {...register('installmentTotal')} placeholder="12" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Ends on</Label>
                  <Input type="date" {...register('installmentEndsOn')} />
                </div>
              </div>
            )}
          </form>

          <SheetFooter className="flex flex-row gap-2">
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
