'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useTransactionSheet } from '@/contexts/sheet-context';

export function DashboardActions() {
  const { openNew } = useTransactionSheet();

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={openNew}
        className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-primary text-primary-foreground font-medium text-[13.5px] shadow-pb-2 hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Plus className="w-4 h-4" /> Add transaction
      </button>
      <Link
        href="/settings#import"
        className="inline-flex items-center h-11 px-5 rounded-full border border-border bg-card text-foreground font-medium text-[13.5px] hover:bg-accent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        Import data
      </Link>
    </div>
  );
}
