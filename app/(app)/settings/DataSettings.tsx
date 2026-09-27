'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Database, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { notify } from '@/lib/ui-notify';
import { clearAllData } from '@/server-actions/settings';
import { previewTransactionImport, previewRecurringImport, type TransactionImportPreview, type RecurringImportPreview } from '@/server-actions/import';
import { RecurringImportReview } from '@/components/import/RecurringImportReview';
import { CsvImportRow } from '@/components/import/CsvImportRow';
import { TransactionImportReview } from '@/components/import/TransactionImportReview';
import type { BackupStatus } from '@/lib/operations/backup';
import { BackupSettings } from './BackupSettings';

type Props = {
  backupStatus: BackupStatus | null;
  nextBackupRun: string;
  dbSize: string;
  version: string;
};

function ImportSection() {
  return (
    <section id="import">
      <div className="flex items-center gap-2 mb-3">
        <Upload className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-[14px] font-semibold tracking-tight">Import data</h2>
      </div>
      <div className="calm-card p-6 space-y-5">
        <CsvImportRow<Extract<TransactionImportPreview, { ok: true }>>
          title="Import transactions from CSV"
          noun="transaction"
          hint={<>Columns: <span className="mono">date, description, amount, currency, type, category</span> (name) or <span className="mono">category_id</span>, optional <span className="mono">recurring_rule_name</span>. You review every row before anything is saved; an export from the Transactions page re-imports as duplicates.</>}
          preview={previewTransactionImport}
          renderReview={(p, { open, onOpenChange, done }) => (
            <TransactionImportReview
              open={open}
              onOpenChange={onOpenChange}
              filename={p.filename}
              rows={p.rows}
              categories={p.categories}
              onImported={done}
            />
          )}
        />
        <div className="h-px bg-border/60" />
        <CsvImportRow<Extract<RecurringImportPreview, { ok: true }>>
          title="Import recurring rules from CSV"
          noun="rule"
          hint={<>Columns: <span className="mono">name, amount, currency, cycle, next_due, kind, category</span> (or <span className="mono">category_id</span>), optional <span className="mono">installment_paid, installment_total, installment_ends_on</span>. The review shows any past charges each rule will log.</>}
          preview={previewRecurringImport}
          renderReview={(p, { open, onOpenChange, done }) => (
            <RecurringImportReview
              open={open}
              onOpenChange={onOpenChange}
              filename={p.filename}
              rows={p.rows}
              categories={p.categories}
              onImported={done}
            />
          )}
        />
      </div>
    </section>
  );
}

export function DataSettings({ backupStatus, nextBackupRun, dbSize, version }: Props) {
  const [clearDbOpen, setClearDbOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <div className="motion-stagger space-y-7">
        {/* ── Database backups ─────────────────────────────────────── */}
        <BackupSettings status={backupStatus} nextRun={nextBackupRun} />

        {/* ── Import Data ───────────────────────────────────────────── */}
        <ImportSection />

        {/* ── About ─────────────────────────────────────────────────── */}
        <section id="about">
          <div className="calm-card p-6 grid grid-cols-2 gap-5 text-[12px]">
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Version</div>
              <div className="mono text-foreground/85 mt-1">{version}</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Database size</div>
              <div className="mono text-foreground/85 mt-1">{dbSize}</div>
            </div>
          </div>
        </section>

        {/* ── Danger zone ───────────────────────────────────────────── */}
        <section id="data">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[14px] font-semibold tracking-tight">Data</h2>
          </div>
          <div className="calm-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-medium">Clear all data</div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5">
                  Deletes every transaction, recurring rule, category, and AI insight. Account and settings are kept.
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setClearDbOpen(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Clear database
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Clear database confirmation dialog */}
      <Dialog open={clearDbOpen} onOpenChange={setClearDbOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            This permanently deletes every transaction, recurring rule, category, and AI insight.
            Your account credentials and app settings are not affected. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClearDbOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await clearAllData();
                  setClearDbOpen(false);
                  notify.success('All data cleared');
                  router.refresh();
                });
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />Yes, clear everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
