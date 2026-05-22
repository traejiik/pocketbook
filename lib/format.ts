export function fmtHUF(n: number, opts?: { signed?: boolean }): string {
  const sign = opts?.signed && n > 0 ? '+' : '';
  const abs = Math.round(Math.abs(n));
  const formatted = abs.toLocaleString('hu-HU').replace(/,/g, ' ').replace(/ /g, ' ');
  return `${n < 0 ? '−' : sign}${formatted} Ft`;
}

export function fmtCur(n: number, cur: 'HUF' | 'USD' | 'EUR' | 'GBP'): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (cur === 'HUF') return `${sign}${Math.round(abs).toLocaleString('hu-HU').replace(/,/g, ' ')} Ft`;
  if (cur === 'USD') return `${sign}$${abs.toFixed(2)}`;
  if (cur === 'EUR') return `${sign}€${abs.toFixed(2)}`;
  return `${sign}£${abs.toFixed(2)}`;
}

export function fmtDate(iso: string | Date, opts?: { short?: boolean }): string {
  const d = typeof iso === 'string' ? new Date(iso.includes('T') ? iso : iso + 'T00:00') : iso;
  if (opts?.short) return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dayOfWeek(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso.includes('T') ? iso : iso + 'T00:00') : iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
}
