export function fmtHUF(n: number, opts?: { signed?: boolean }): string {
  const sign = opts?.signed && n > 0 ? '+' : '';
  const abs = Math.round(Math.abs(n));
  const formatted = abs.toLocaleString('hu-HU').replace(/ /g, ' ');
  return `${n < 0 ? '−' : sign}${formatted} Ft`;
}

export function fmtCur(n: number, cur: 'HUF' | 'USD' | 'EUR' | 'GBP'): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (cur === 'HUF') return fmtHUF(n);
  if (cur === 'USD') return `${sign}$${abs.toFixed(2)}`;
  if (cur === 'EUR') return `${sign}€${abs.toFixed(2)}`;
  return `${sign}£${abs.toFixed(2)}`;
}

export function fmtAnchor(n: number, anchor: string, opts?: { signed?: boolean }): string {
  if (anchor === 'HUF') return fmtHUF(n, opts)
  return fmtCur(n, anchor as 'USD' | 'EUR' | 'GBP')
}

export function fmtDate(iso: string | Date, opts?: { short?: boolean }): string {
  const d = typeof iso === 'string' ? new Date(iso.includes('T') ? iso : iso + 'T00:00') : iso;
  if (opts?.short) return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** `YYYY-MM` for a date, read from its local parts (matches how the month filter is displayed). */
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Step a `YYYY-MM` key by whole months. Rolls the year over in both directions. */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1 + delta, 1));
}

export function dayOfWeek(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso.includes('T') ? iso : iso + 'T00:00') : iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
}
