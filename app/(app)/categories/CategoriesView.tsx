'use client'

import { useState, useTransition, useEffect, useCallback, useId, type ReactNode } from 'react'
import { Plus, Pencil, Trash2, ChevronRight } from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
import { toast } from 'sonner'
import { upsertCategory, deleteCategory } from '@/server-actions/categories'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fmtAnchor } from '@/lib/format'
import { useFabContext } from '@/contexts/fab-context'
import { hexToRgba } from '@/lib/colors'
import { useIsMobile } from '@/hooks/use-is-mobile'

type KindType = 'INCOME' | 'EXPENSE' | 'SAVINGS'

interface CategoryRow {
  id: string
  name: string
  color: string
  kind: KindType
  txCount: number
  txTotalHUF: number
}

interface Props {
  categories: CategoryRow[]
  anchorCurrency?: string
}

const KIND_LABELS: Record<KindType, string> = {
  INCOME: 'Income', EXPENSE: 'Expense', SAVINGS: 'Savings',
}

const KIND_TONE_VAR: Record<KindType, string> = {
  INCOME: 'hsl(var(--income))',
  EXPENSE: 'hsl(var(--expense))',
  SAVINGS: 'hsl(var(--savings))',
}

function kindLabel(kind: KindType) {
  return KIND_LABELS[kind]
}

const PALETTE = [
  '#3FBF7F', '#5AA3FF', '#C58CFF', '#FF8A65', '#F5B544',
  '#6FB8FF', '#7BD3B3', '#E36F8E', '#A4D453', '#9C8CFF',
  '#8E97A8', '#4FB3E0', '#FF6B6B', '#FFD700', '#00CED1',
]

interface EditState {
  id?: string
  name: string
  color: string
  kind: KindType
  txCount?: number
}

interface DeleteState {
  id: string
  name: string
  txCount: number
}

export function CategoriesView({ categories, anchorCurrency = 'HUF' }: Props) {
  const [editDialog, setEditDialog] = useState<EditState | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<DeleteState | null>(null)
  const [replacementId, setReplacementId] = useState('')
  const [isPending, startTransition] = useTransition()
  const useBottomSheet = useIsMobile('(max-width: 1024px)', true)

  const nameId = useId()
  const colourLabelId = useId()
  const hexId = useId()
  const kindLabelId = useId()
  const moveLabelId = useId()

  const { registerFabAction, clearFabAction } = useFabContext()
  const openNewExpense = useCallback(() => {
    setEditDialog({ name: '', color: PALETTE[0], kind: 'EXPENSE' })
  }, [])
  useEffect(() => {
    registerFabAction(openNewExpense)
    return () => clearFabAction()
  }, [registerFabAction, clearFabAction, openNewExpense])

  const groups: KindType[] = ['INCOME', 'EXPENSE', 'SAVINGS']

  function openNew(kind: KindType) {
    setEditDialog({ name: '', color: PALETTE[0], kind })
  }

  function openEdit(c: CategoryRow) {
    setEditDialog({ id: c.id, name: c.name, color: c.color, kind: c.kind, txCount: c.txCount })
  }

  function deleteFromEdit() {
    if (!editDialog?.id) return
    const { id, name, txCount } = editDialog
    setEditDialog(null)
    setDeleteDialog({ id, name, txCount: txCount ?? 0 })
    setReplacementId('')
  }

  function openDelete(c: CategoryRow) {
    setDeleteDialog({ id: c.id, name: c.name, txCount: c.txCount })
    setReplacementId('')
  }

  function submitEdit() {
    if (!editDialog || !editDialog.name || !editDialog.color) return
    if (!/^#[0-9A-Fa-f]{6}$/.test(editDialog.color)) {
      toast.error('Enter a valid hex colour (e.g. #3FBF7F)')
      return
    }
    startTransition(async () => {
      const result = await upsertCategory({
        id: editDialog.id,
        name: editDialog.name,
        color: editDialog.color,
        kind: editDialog.kind,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setEditDialog(null)
    })
  }

  function submitDelete() {
    if (!deleteDialog) return
    startTransition(async () => {
      await deleteCategory(
        deleteDialog.id,
        deleteDialog.txCount > 0 ? replacementId : undefined,
      )
      setDeleteDialog(null)
    })
  }

  // Shared edit form body — rendered in a Dialog (desktop) or bottom Sheet (mobile/tablet)
  const editFields: ReactNode = (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={editDialog?.name ?? ''}
          onChange={(e) => setEditDialog((d) => d ? { ...d, name: e.target.value } : d)}
          placeholder="e.g. Food & Groceries"
        />
      </div>

      <div className="space-y-1.5">
        <Label id={colourLabelId}>Colour</Label>
        <div role="group" aria-labelledby={colourLabelId} className="flex flex-wrap gap-1 mt-1">
          {PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={hex}
              aria-pressed={editDialog?.color === hex}
              onClick={() => setEditDialog((d) => d ? { ...d, color: hex } : d)}
              className="w-10 h-10 flex items-center justify-center rounded-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span
                className="w-6 h-6 rounded-[5px] block border-2"
                style={{
                  background: hex,
                  borderColor: editDialog?.color === hex ? hex : 'transparent',
                  boxShadow: editDialog?.color === hex ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${hex}` : undefined,
                }}
              />
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-2">
          <Popover>
            <PopoverTrigger
              type="button"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-border bg-background pl-1 pr-3 text-[13px] font-medium transition-colors hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span
                className="size-6 rounded-full border border-border/50"
                style={{ background: editDialog?.color ?? 'transparent' }}
              />
              Pick colour
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-auto p-3 [&_.react-colorful]:w-48! [&_.react-colorful__saturation]:rounded-md [&_.react-colorful__hue]:mt-3 [&_.react-colorful__hue]:h-3 [&_.react-colorful__hue]:rounded-full [&_.react-colorful__pointer]:size-4 [&_.react-colorful__pointer]:border-2"
            >
              <HexColorPicker
                color={editDialog?.color ?? '#000000'}
                onChange={(color) => setEditDialog((d) => d ? { ...d, color } : d)}
              />
            </PopoverContent>
          </Popover>
          <Input
            id={hexId}
            aria-label="Hex colour value"
            value={editDialog?.color ?? ''}
            onChange={(e) => setEditDialog((d) => d ? { ...d, color: e.target.value } : d)}
            placeholder="#3FBF7F"
            className="flex-1 font-mono text-[13px]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label id={kindLabelId}>Kind</Label>
        <Select
          value={editDialog?.kind ?? 'EXPENSE'}
          onValueChange={(v) => v && setEditDialog((d) => d ? { ...d, kind: v as KindType } : d)}
        >
          <SelectTrigger aria-labelledby={kindLabelId}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="EXPENSE">Expense</SelectItem>
            <SelectItem value="SAVINGS">Savings</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  )

  return (
    <div className="px-4 lg:px-7 pb-9 pt-1 max-w-[1320px] mx-auto">
      <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] text-muted-foreground">
          <span className="text-foreground font-medium tabular">{categories.length}</span> categories · 3 kinds
        </div>
        <button
          type="button"
          onClick={() => openNew('EXPENSE')}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-primary text-primary-foreground font-medium text-[12.5px] hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Plus className="w-3.5 h-3.5" /> New category
        </button>
      </div>

      {groups.map((g) => {
        const list = categories.filter((c) => c.kind === g)
        return (
          <div key={g}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_TONE_VAR[g] }} />
              <h2 className="text-[11px] mono uppercase tracking-[0.12em] text-muted-foreground font-medium">
                {KIND_LABELS[g]}
              </h2>
              <span className="mono text-[11px] text-muted-foreground">{list.length}</span>
              <div className="flex-1 h-px bg-border ml-2" />
            </div>
            <div className="calm-card divide-y divide-border/40 overflow-hidden">
              {list.map((category) => (
                <div key={category.id}>
                  {/* Desktop row — hover-reveal edit/delete (canonical) */}
                  <div className="hidden min-[1025px]:grid grid-cols-[44px_1fr_110px_150px_72px] items-center px-5 py-3.5 group hover:bg-accent/40 transition-colors">
                    <div className="flex items-center">
                      <span
                        className="w-8 h-8 rounded-[9px] border border-border/40 flex items-center justify-center"
                        style={{ background: hexToRgba(category.color, 0.14) }}
                      >
                        <span className="w-3 h-3 rounded-full" style={{ background: category.color }} />
                      </span>
                    </div>
                    <div>
                      <div className="text-[13.5px] font-medium">{category.name}</div>
                      <div className="text-[11px] text-muted-foreground">{kindLabel(category.kind)}</div>
                    </div>
                    <div className="text-[12px] text-muted-foreground tabular">{category.txCount} txns</div>
                    <div className="text-right tabular text-[12.5px] text-foreground/85">
                      {category.txTotalHUF > 0
                        ? fmtAnchor(category.txTotalHUF, anchorCurrency)
                        : <span className="text-muted-foreground">—</span>
                      }
                    </div>
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => openEdit(category)}
                        aria-label={`Edit ${category.name}`}
                        className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openDelete(category)}
                        aria-label={`Delete ${category.name}`}
                        className="p-2 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Mobile / tablet row — tap anywhere to edit */}
                  <button
                    type="button"
                    onClick={() => openEdit(category)}
                    aria-label={`Edit ${category.name} category`}
                    className="min-[1025px]:hidden w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
                  >
                    <span
                      className="w-9 h-9 shrink-0 rounded-[9px] border border-border/40 flex items-center justify-center"
                      style={{ background: hexToRgba(category.color, 0.14) }}
                    >
                      <span className="w-3 h-3 rounded-full" style={{ background: category.color }} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium truncate">{category.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {kindLabel(category.kind)} · <span className="tabular">{category.txCount}</span> txns
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground/60" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => openNew(g)}
                className="w-full px-4 py-2.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition cursor-pointer flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
              >
                <Plus className="w-3.5 h-3.5" />
                Add {KIND_LABELS[g].toLowerCase()} category
              </button>
            </div>
          </div>
        )
      })}
      </div>

      {/* Edit / create — bottom sheet on mobile/tablet, dialog on desktop */}
      {useBottomSheet ? (
        <Sheet open={editDialog !== null} onOpenChange={(open) => !open && setEditDialog(null)}>
          <SheetContent side="bottom" className="w-full mx-auto max-w-[560px] max-h-[92dvh] !rounded-t-[24px]">
            <SheetHeader>
              <SheetTitle>{editDialog?.id ? 'Edit category' : 'New category'}</SheetTitle>
            </SheetHeader>
            <div className="px-4 space-y-4 pb-2 overflow-y-auto">
              {editFields}
            </div>
            <SheetFooter className="flex-row items-center gap-2 pl-[max(env(safe-area-inset-left),1.25rem)] pr-[max(env(safe-area-inset-right),1.25rem)] pb-[max(env(safe-area-inset-bottom),1rem)]">
              {editDialog?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deleteFromEdit}
                  disabled={isPending}
                  className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Delete
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setEditDialog(null)} disabled={isPending}>Cancel</Button>
              <Button size="sm" onClick={submitEdit} disabled={isPending}>
                {editDialog?.id ? 'Save changes' : 'Create'}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={editDialog !== null} onOpenChange={(open) => !open && setEditDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editDialog?.id ? 'Edit category' : 'New category'}</DialogTitle>
            </DialogHeader>
            <div className="px-4 space-y-4 pb-2">
              {editFields}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditDialog(null)} disabled={isPending}>Cancel</Button>
              <Button size="sm" onClick={submitEdit} disabled={isPending}>
                {editDialog?.id ? 'Save changes' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete / reassign dialog */}
      <Dialog open={deleteDialog !== null} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteDialog?.name}&rdquo;</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2 space-y-3">
            {(deleteDialog?.txCount ?? 0) > 0 ? (
              <>
                <p className="text-[13px] text-muted-foreground">
                  This category has {deleteDialog?.txCount} transaction{deleteDialog?.txCount === 1 ? '' : 's'}.
                  Choose a replacement category before deleting.
                </p>
                <div className="space-y-1.5">
                  <Label id={moveLabelId}>Move transactions to</Label>
                  <Select value={replacementId} onValueChange={(v) => setReplacementId(v ?? '')}>
                    <SelectTrigger aria-labelledby={moveLabelId}><SelectValue placeholder="Select replacement" /></SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter((c) => c.id !== deleteDialog?.id)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                This category has no transactions and will be permanently deleted.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialog(null)} disabled={isPending}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={submitDelete}
              disabled={isPending || ((deleteDialog?.txCount ?? 0) > 0 && !replacementId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
