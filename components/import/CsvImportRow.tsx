'use client'

import { useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ImportOutcome = { imported: number; skipped: number; errors: string[] }

interface Props<P> {
  title: string
  hint: ReactNode
  noun: string
  /** Parse + classify on the server; returns a preview or an error message. */
  preview: (form: FormData) => Promise<P | { error: string }>
  /** Render the review sheet for a preview; call `done` after a successful commit. */
  renderReview: (preview: P, props: { open: boolean; onOpenChange: (open: boolean) => void; done: (r: ImportOutcome) => void }) => ReactNode
}

/**
 * One import option in Settings: pick a CSV, preview it on the server, review it
 * in a sheet, then show what was written. Nothing is saved until the sheet's
 * import button is pressed.
 */
export function CsvImportRow<P>({ title, hint, noun, preview, renderReview }: Props<P>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'reading' | 'review' | 'done' | 'error'>('idle')
  const [data, setData] = useState<P | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setStatus('reading')
    setOutcome(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const result = await preview(form)
      if (result && typeof result === 'object' && 'error' in result) {
        setMessage(result.error)
        setStatus('error')
        return
      }
      setData(result as P)
      setStatus('review')
    } catch {
      setMessage('Could not read that file. Please try again.')
      setStatus('error')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] font-medium">{title}</div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">{hint}</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label={title}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={status === 'reading'}>
          <Upload className="w-3.5 h-3.5 mr-1.5" />Choose CSV
        </Button>
      </div>

      {status === 'reading' && (
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden" aria-hidden="true">
          <div className="h-full w-1/2 rounded-full bg-primary/45 animate-pulse" />
        </div>
      )}
      {status === 'done' && outcome && (
        <div className="space-y-2">
          <div className="text-[12.5px] text-income">
            <Check className="w-3.5 h-3.5 inline mr-1" />
            <span className="tabular">{outcome.imported}</span> {noun}{outcome.imported === 1 ? '' : 's'} imported
            {outcome.skipped > 0 && <> · <span className="tabular">{outcome.skipped}</span> skipped</>}
          </div>
          {outcome.errors.length > 0 && (
            <details className="text-[12px] text-muted-foreground">
              <summary className="cursor-pointer text-warning">
                {outcome.errors.length} row{outcome.errors.length !== 1 ? 's' : ''} not imported
              </summary>
              <ul className="mt-2 space-y-1 ml-4 list-disc">
                {outcome.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
      {status === 'error' && message && (
        <div className="text-[12.5px] text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
          {message}
        </div>
      )}

      {data !== null && renderReview(data, {
        open: status === 'review',
        onOpenChange: (open) => { if (!open) { setStatus('idle'); setData(null) } },
        done: (r) => { setOutcome(r); setStatus('done'); setData(null) },
      })}
    </div>
  )
}
