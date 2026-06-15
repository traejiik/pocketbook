'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { upsertCategory, deleteCategory } from '@/server-actions/categories'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtAnchor } from '@/lib/format'
import { useFabContext } from '@/contexts/fab-context'

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
    setEditDialog({ id: c.id, name: c.name, color: c.color, kind: c.kind })
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

  return (
    <div className="px-4 lg:px-7 pb-9 pt-1 max-w-[960px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] text-muted-foreground">
          {categories.length} categories · 3 kinds
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
              <h2 className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground font-medium">
                {KIND_LABELS[g]}
              </h2>
              <span className="mono text-[11px] text-muted-foreground">{list.length}</span>
              <div className="flex-1 h-px bg-border ml-2" />
            </div>
            <div className="calm-card divide-y divide-border/40 overflow-hidden">
              {list.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[40px_1fr_80px_60px] sm:grid-cols-[44px_1fr_120px_140px_80px] items-center px-4 py-3 group hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-center">
                    <span
                      className="w-7 h-7 rounded-md border border-border flex items-center justify-center"
                      style={{ background: `${c.color}1f` }}
                    >
                      <span className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                    </span>
                  </div>
                  <div>
                    <div className="text-[13.5px] font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground mono">{c.color.toUpperCase()}</div>
                  </div>
                  <div className="text-[12px] text-muted-foreground">{c.txCount} txns</div>
                  <div className="hidden sm:block text-right tabular text-[12.5px] text-foreground/85">
                    {c.txTotalHUF > 0
                      ? fmtAnchor(c.txTotalHUF, anchorCurrency)
                      : <span className="text-muted-foreground">—</span>
                    }
                  </div>
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      aria-label={`Edit ${c.name}`}
                      className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openDelete(c)}
                      aria-label={`Delete ${c.name}`}
                      className="p-2 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
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

      {/* Edit / create dialog */}
      <Dialog open={editDialog !== null} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDialog?.id ? 'Edit category' : 'New category'}</DialogTitle>
          </DialogHeader>
          <div className="px-4 space-y-4 pb-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={editDialog?.name ?? ''}
                onChange={(e) => setEditDialog((d) => d ? { ...d, name: e.target.value } : d)}
                placeholder="e.g. Food & Groceries"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {PALETTE.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={hex}
                    aria-pressed={editDialog?.color === hex}
                    onClick={() => setEditDialog((d) => d ? { ...d, color: hex } : d)}
                    className="w-9 h-9 flex items-center justify-center rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
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
              <Input
                value={editDialog?.color ?? ''}
                onChange={(e) => setEditDialog((d) => d ? { ...d, color: e.target.value } : d)}
                placeholder="#3FBF7F"
                className="mt-2 font-mono text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select
                value={editDialog?.kind ?? 'EXPENSE'}
                onValueChange={(v) => v && setEditDialog((d) => d ? { ...d, kind: v as KindType } : d)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Income</SelectItem>
                  <SelectItem value="EXPENSE">Expense</SelectItem>
                  <SelectItem value="SAVINGS">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditDialog(null)} disabled={isPending}>Cancel</Button>
            <Button size="sm" onClick={submitEdit} disabled={isPending}>
              {editDialog?.id ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <Label>Move transactions to</Label>
                  <Select value={replacementId} onValueChange={(v) => setReplacementId(v ?? '')}>
                    <SelectTrigger><SelectValue placeholder="Select replacement" /></SelectTrigger>
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
