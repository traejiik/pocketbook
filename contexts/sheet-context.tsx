'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { TxType } from '@/lib/transaction-type';

export interface EditingTx {
  id: string;
  date: string;
  description: string;
  amount: number; // always absolute (positive), sign stripped
  currency: string;
  type: TxType;
  categoryId: string;
  recurringRuleId: string | null;
  /** The rule occurrence this transaction settled early (`YYYY-MM-DD`), if any. */
  coversDueDate: string | null;
  recurringRuleName: string | null;
}

interface SheetContextValue {
  open: boolean;
  editingTx: EditingTx | null;
  /** Type a new entry starts as, when it was opened for one (Savings page buttons). */
  newType: TxType | null;
  openNew: () => void;
  /** Open a new entry preset to `type` — e.g. the Savings page's Withdraw button. */
  openNewOfType: (type: TxType) => void;
  /** Each savings pot's balance in the anchor currency, keyed by category id. */
  potBalances: Record<string, number>;
  openEdit: (tx: EditingTx) => void;
  close: () => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function TransactionSheetProvider({
  children,
  potBalances = {},
}: {
  children: React.ReactNode;
  potBalances?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<EditingTx | null>(null);
  const [newType, setNewType] = useState<TxType | null>(null);

  // Handed straight to onClick / key handlers, so it takes no argument.
  const openNew = useCallback(() => {
    setEditingTx(null);
    setNewType(null);
    setOpen(true);
  }, []);

  const openNewOfType = useCallback((type: TxType) => {
    setEditingTx(null);
    setNewType(type);
    setOpen(true);
  }, []);

  const openEdit = useCallback((tx: EditingTx) => {
    setEditingTx(tx);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <SheetContext.Provider value={{ open, editingTx, newType, openNew, openNewOfType, potBalances, openEdit, close }}>
      {children}
    </SheetContext.Provider>
  );
}

export function useTransactionSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useTransactionSheet must be used inside TransactionSheetProvider');
  return ctx;
}
