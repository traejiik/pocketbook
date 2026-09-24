// Minimal RFC 4180 CSV reader/writer shared by the transaction and recurring
// importers and the transaction export. Pure, so it runs on the server and in
// tests alike.

const BOM = '﻿'

/**
 * Parse CSV text into rows of fields. Handles quoted fields (with embedded
 * commas, newlines and `""` escapes), CRLF or LF line endings, and a leading
 * UTF-8 BOM (Excel adds one). Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  const endField = () => { row.push(field); field = '' }
  const endRow = () => {
    endField()
    if (row.some((f) => f.trim() !== '')) rows.push(row)
    row = []
  }

  while (i < src.length) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue }
    if (ch === ',') { endField(); i++; continue }
    if (ch === '\r') { endRow(); i += src[i + 1] === '\n' ? 2 : 1; continue }
    if (ch === '\n') { endRow(); i++; continue }
    field += ch; i++
  }
  if (field !== '' || row.length > 0) endRow()
  return rows
}

/**
 * Parse CSV with a header row into records keyed by lower-cased, trimmed header
 * names. `line` is the 1-based line of the record in the file (header = 1), so
 * error messages can point at the spreadsheet row the user sees.
 */
export function parseCsvRecords(text: string): { headers: string[]; records: { line: number; values: Record<string, string> }[] } {
  const [head, ...body] = parseCsv(text)
  if (!head) return { headers: [], records: [] }
  const headers = head.map((h) => h.trim().toLowerCase())
  const records = body.map((cells, idx) => {
    const values: Record<string, string> = {}
    headers.forEach((h, c) => { values[h] = (cells[c] ?? '').trim() })
    return { line: idx + 2, values }
  })
  return { headers, records }
}

function escapeField(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value
}

/** Serialise rows to CSV with CRLF endings and a BOM so Excel opens UTF-8 correctly. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return BOM + rows.map((r) => r.map((v) => escapeField(v == null ? '' : String(v))).join(',')).join('\r\n') + '\r\n'
}
