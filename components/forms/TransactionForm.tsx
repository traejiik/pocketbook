'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarIcon, CheckIcon, ChevronDownIcon } from 'lucide-react';
import { toast } from 'sonner';

import { deleteTransaction, type TxInput } from '@/server-actions/transactions';
import { useTransactionSheet } from '@/contexts/sheet-context';
import { cn } from '@/lib/utils';
import { fmtAnchor } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

const formSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1, 'Description is required').max(200),
  amount: z.string().min(1, 'Amount is required'),
  currency: z.enum(['HUF', 'USD', 'EUR', 'GBP']),
  type: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
  categoryId: z.string().min(1, 'Select a category'),
  recurringRuleId: z.string().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export interface SerializedCategory {
  id: string;
  name: string;
  color: string;
  kind: 'INCOME' | 'EXPENSE' | 'SAVINGS';
}

export interface SerializedRecurringRule {
  id: string;
  name: string;
  cycle: 'MONTHLY' | 'ANNUAL';
  kind: 'INCOME' | 'EXPENSE' | 'SAVINGS';
}

interface TransactionFormProps {
  categories: SerializedCategory[];
  recurringRules: SerializedRecurringRule[];
  fxRates: { USD: number; EUR: number; GBP: number };
  /** Called by parent so it can dispatch optimistic update + server action together */
  onFormSubmit: (input: TxInput, category: SerializedCategory) => void;
  deleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;
  anchorCurrency?: string;
}

function getToday() { return new Date().toISOString().slice(0, 10); }

const TYPE_OPTIONS = [
  { value: 'EXPENSE' as const, label: 'Expense', tone: 'expense' as const },
  { value: 'INCOME' as const, label: 'Income', tone: 'income' as const },
  { value: 'SAVINGS' as const, label: 'Savings', tone: 'savings' as const },
] as const;

const TONE_BG   = { expense: 'bg-expense',   income: 'bg-income',   savings: 'bg-savings'   } as const;
const TONE_TEXT = { expense: 'text-expense',  income: 'text-income', savings: 'text-savings'  } as const;

export function TransactionForm({
  categories,
  recurringRules,
  fxRates,
  onFormSubmit,
  deleteConfirmOpen,
  setDeleteConfirmOpen,
  anchorCurrency = 'HUF',
}: TransactionFormProps) {
  const { open, editingTx, close } = useTransactionSheet();

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640,
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: getToday(),
      description: '',
      amount: '',
      currency: 'HUF',
      type: 'EXPENSE',
      categoryId: '',
      recurringRuleId: null,
    },
  });

  // Sync form values when the sheet opens or switches between add/edit
  useEffect(() => {
    if (open && editingTx) {
      reset({
        date: editingTx.date,
        description: editingTx.description,
        amount: Math.abs(editingTx.amount).toString(),
        currency: editingTx.currency as FormValues['currency'],
        type: editingTx.type,
        categoryId: editingTx.categoryId,
        recurringRuleId: editingTx.recurringRuleId,
      });
    } else if (open && !editingTx) {
      reset({
        date: getToday(),
        description: '',
        amount: '',
        currency: 'HUF',
        type: 'EXPENSE',
        categoryId: '',
        recurringRuleId: null,
      });
    }
  }, [open, editingTx, reset]);

  const type = watch('type');
  const currency = watch('currency');
  const amtStr = watch('amount');
  const categoryId = watch('categoryId');
  const dateVal = watch('date');
  const descVal = watch('description');

  const eligibleCategories = categories.filter(c => c.kind === type);

  // Reset categoryId when type changes to a kind that doesn't include current selection
  useEffect(() => {
    if (!eligibleCategories.find(c => c.id === categoryId)) {
      setValue('categoryId', eligibleCategories[0]?.id ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const eligibleRules = recurringRules.filter(r => r.kind === type);

  const amtNum = parseFloat(amtStr?.replace(',', '.') ?? '0') || 0;
  const rate =
    currency === 'USD' ? fxRates.USD
    : currency === 'EUR' ? fxRates.EUR
    : currency === 'GBP' ? fxRates.GBP
    : 1;
  const hufEquiv = amtNum * rate;

  function onSubmit(values: FormValues) {
    const parsedAmount = parseFloat(values.amount.replace(',', '.'));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    const category = eligibleCategories.find(c => c.id === values.categoryId);
    if (!category) {
      toast.error('Please select a category.');
      return;
    }

    onFormSubmit(
      {
        id: editingTx?.id,
        date: values.date,
        description: values.description,
        amount: parsedAmount,
        currency: values.currency,
        type: values.type,
        categoryId: values.categoryId,
        recurringRuleId: values.recurringRuleId || null,
      },
      category,
    );
    close();
  }

  async function handleDelete() {
    if (!editingTx) return;
    try {
      await deleteTransaction(editingTx.id);
      toast.success('Transaction deleted.');
      setDeleteConfirmOpen(false);
      close();
    } catch {
      toast.error('Failed to delete transaction.');
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={o => { if (!o) close(); }}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className="w-full sm:w-[440px] sm:max-w-[440px] max-sm:h-[95dvh] flex flex-col gap-0 p-0 overflow-y-auto"
        >
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
            <SheetTitle>{editingTx ? 'Edit transaction' : 'New transaction'}</SheetTitle>
            <SheetDescription className="text-[11.5px] mono">
              {editingTx ? `id · ${editingTx.id}` : 'Press ⌘↵ to save'}
            </SheetDescription>
          </SheetHeader>

          {/* ⌘↵ handled via onKeyDown on the form element */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit(onSubmit)();
              }
            }}
            className="flex flex-col flex-1"
          >
            <div className="p-5 space-y-4 flex-1">

              {/* Type segmented */}
              <div className="space-y-1.5">
                <Label id="tx-type-label">Type</Label>
                <div role="group" aria-labelledby="tx-type-label" className="grid grid-cols-3 gap-1 p-0.5 bg-secondary border border-border rounded-md">
                  {TYPE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={type === o.value}
                      onClick={() => setValue('type', o.value)}
                      className={cn(
                        'h-11 sm:h-8 text-[12.5px] font-medium rounded-[5px] transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                        type === o.value
                          ? `bg-card shadow-pb-1 ${TONE_TEXT[o.tone]}`
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full', TONE_BG[o.tone])} />
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount + currency */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-amount" hint="HUF equivalent shown below">Amount</Label>
                <div className="grid grid-cols-[1fr_88px] gap-2">
                  <Input
                    id="tx-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    aria-invalid={!!errors.amount}
                    aria-describedby={errors.amount ? 'tx-amount-error' : undefined}
                    className={cn('text-right', errors.amount && 'border-destructive')}
                    {...register('amount')}
                    value={amtStr}
                    onChange={e => setValue('amount', e.target.value.replace(/[^0-9.,]/g, ''))}
                  />
                  <div className="relative">
                    <select
                      {...register('currency')}
                      aria-label="Currency"
                      className="appearance-none h-11 sm:h-9 w-full pl-3 pr-7 bg-transparent border border-input rounded-md text-base sm:text-[13px] focus:outline-hidden focus:ring-2 focus:ring-ring/60"
                    >
                      <option>HUF</option>
                      <option>EUR</option>
                      <option>USD</option>
                      <option>GBP</option>
                    </select>
                    <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                {currency !== anchorCurrency && amtNum > 0 && (
                  <div className="text-[11.5px] text-muted-foreground mono">
                    ≈ {fmtAnchor(hufEquiv, anchorCurrency)} at 1 {currency} = {rate.toFixed(2)} {anchorCurrency}
                  </div>
                )}
                {errors.amount && (
                  <p id="tx-amount-error" className="text-[11px] text-destructive">{errors.amount.message}</p>
                )}
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-date">Date</Label>
                <Input
                  id="tx-date"
                  type="date"
                  icon={<CalendarIcon className="w-4 h-4" />}
                  {...register('date')}
                  value={dateVal}
                  onChange={e => setValue('date', e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-description">Description</Label>
                <Input
                  id="tx-description"
                  placeholder="e.g. Spar weekly groceries"
                  aria-invalid={!!errors.description}
                  aria-describedby={errors.description ? 'tx-description-error' : undefined}
                  className={errors.description ? 'border-destructive' : ''}
                  {...register('description')}
                  value={descVal}
                  onChange={e => setValue('description', e.target.value)}
                />
                {errors.description && (
                  <p id="tx-description-error" className="text-[11px] text-destructive">{errors.description.message}</p>
                )}
              </div>

              {/* Category pills */}
              <div className="space-y-1.5">
                <Label id="tx-category-label" hint={`${eligibleCategories.length} ${type.toLowerCase()} categories`}>
                  Category
                </Label>
                <div
                  role="group"
                  aria-labelledby="tx-category-label"
                  aria-describedby={errors.categoryId ? 'tx-category-error' : undefined}
                  className="flex flex-wrap gap-1.5"
                >
                  {eligibleCategories.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={categoryId === c.id}
                      onClick={() => setValue('categoryId', c.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-2 sm:py-1 rounded-full border text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                        categoryId === c.id
                          ? 'border-ring/60 bg-accent text-foreground'
                          : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: c.color }}
                      />
                      {c.name}
                    </button>
                  ))}
                </div>
                {errors.categoryId && (
                  <p id="tx-category-error" className="text-[11px] text-destructive">{errors.categoryId.message}</p>
                )}
              </div>

              {/* Link to recurring rule */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-recurring" hint="Optional">Link to recurring rule</Label>
                <div className="relative">
                  <select
                    id="tx-recurring"
                    {...register('recurringRuleId')}
                    className="appearance-none h-11 sm:h-9 w-full pl-3 pr-7 bg-transparent border border-input rounded-md text-base sm:text-[13px] focus:outline-hidden focus:ring-2 focus:ring-ring/60"
                  >
                    <option value="">— None —</option>
                    {eligibleRules.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.cycle === 'MONTHLY' ? 'Monthly' : 'Annual'}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Delete link — edit mode only */}
              {editingTx && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="text-[12px] text-destructive hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive/60 rounded"
                  >
                    Delete this transaction…
                  </button>
                </div>
              )}
            </div>

            {/* Sticky footer */}
            <div className="px-5 py-4 border-t border-border flex items-center justify-between bg-secondary/15 shrink-0">
              <div className="text-[11.5px] text-muted-foreground">
                {editingTx
                  ? <span className="inline-flex items-center gap-1.5"><CheckIcon className="w-3.5 h-3.5 text-income" />Autosaved drafts</span>
                  : 'New entry'}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  {editingTx ? 'Save changes' : 'Add transaction'}
                </Button>
              </div>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this transaction?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
