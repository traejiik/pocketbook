'use client'

import { useTransition } from 'react'
import { Check, DatabaseBackup, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BackupStatus } from '@/lib/operations/backup'
import { cn } from '@/lib/utils'
import { runBackupNow } from '@/server-actions/backups'

function formatTimestamp(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

function formatBytes(value?: number) {
  if (value === undefined) return '—'
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

export function BackupSettings({
  status,
  nextRun,
}: {
  status: BackupStatus | null
  nextRun: string
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const health = status?.status === 'failed' || status?.status === 'invalid'
    ? 'Failed'
    : status?.status === 'running'
      ? 'Running'
      : status
        ? 'Healthy'
        : 'Never'

  function backupNow() {
    startTransition(async () => {
      const result = await runBackupNow()
      if (result.status === 'success') toast.success(`Backup verified · ${result.filename}`)
      else if (result.status === 'already-running') toast.info('A backup is already running')
      else toast.error(`Backup failed: ${result.error}`)
      router.refresh()
    })
  }

  return (
    <section id="backups">
      <div className="mb-3 flex items-center gap-2">
        <DatabaseBackup className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-[14px] font-semibold tracking-tight">Database backups</h2>
      </div>
      <div className="calm-card p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[13px] font-medium">Backup health</div>
              <Badge className={cn(
                'gap-1.5 text-[10.5px]',
                health === 'Healthy' && 'border-income/30 bg-income/10 text-income',
                health === 'Failed' && 'border-destructive/30 bg-destructive/10 text-destructive',
                health === 'Running' && 'border-border bg-secondary text-foreground',
                health === 'Never' && 'border-border bg-secondary text-muted-foreground',
              )}>
                {health === 'Healthy' ? <Check className="h-3 w-3" /> : health === 'Failed' ? <TriangleAlert className="h-3 w-3" /> : null}
                {health}
              </Badge>
            </div>
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              Daily at 02:30 UTC · custom-format archive verified before retention.
            </div>
          </div>
          <Button size="sm" disabled={isPending} onClick={backupNow}>
            <DatabaseBackup className="mr-1.5 h-3.5 w-3.5" />
            {isPending ? 'Backing up' : 'Back up now'}
          </Button>
        </div>

        {status?.status === 'failed' && status.error && (
          <div className="mt-4 rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-[11.5px] text-destructive">
            {status.error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
          {[
            ['Last success', formatTimestamp(status?.successfulAt)],
            ['Filename', status?.filename ?? (status?.legacy ? 'Legacy backup' : '—')],
            ['Size', formatBytes(status?.sizeBytes)],
            ['Retained', status?.kept === undefined ? '—' : `${status.kept} verified`],
            ['Next run', formatTimestamp(nextRun)],
            ['Last attempt', formatTimestamp(status?.attemptedAt)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
              <div className="mt-1 truncate text-[11.5px] text-foreground/85" title={value}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
