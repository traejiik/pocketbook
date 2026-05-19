'use client';

import { createContext, useContext, useState, useCallback } from 'react';

export interface EditingTx {
  id: string;
  date: string;
  description: string;
  amount: number; // always absolute (positive), sign stripped
  currency: string;
  type: 'INCOME' | 'EXPENSE' | 'SAVINGS';
  categoryId: string;
  recurringRuleId: string | null;
}

interface SheetContextValue {
  open: boolean;
  editingTx: EditingTx | null;
  openNew: () => void;
  openEdit: (tx: EditingTx) => void;
  close: () => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function TransactionSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<EditingTx | null>(null);

  const openNew = useCallback(() => {
    setEditingTx(null);
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
    <SheetContext.Provider value={{ open, editingTx, openNew, openEdit, close }}>
      {children}
    </SheetContext.Provider>
  );
}

export function useTransactionSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useTransactionSheet must be used inside TransactionSheetProvider');
  return ctx;
}
