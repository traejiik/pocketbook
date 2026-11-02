/**
 * Data draws (bars, gauge, balance line) play on a section's first visit in a tab
 * session and never again, so a repeat glance shows settled figures at once. CSS
 * does the work: `html[data-drawn]` turns the draw animations off in `globals.css`.
 */

const STORAGE_KEY = 'pb-drawn-sections';

/** Longest draw (the balance endpoint lands at 1160ms), plus a margin. */
export const DRAW_WINDOW_MS = 1300;

export function drawSection(pathname: string): string {
  return pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
}

function readSections(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hasDrawn(section: string): boolean {
  return readSections().includes(section);
}

export function rememberDrawn(section: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...readSections(), section]));
  } catch {
    // Without storage the draw simply plays again next time.
  }
}

/**
 * Decides a visit: returns the section now drawing, or null when it has already
 * drawn. `drawing` is what the last call returned, so a repeat call for the same
 * section (Strict Mode's double effect) is not mistaken for a return visit.
 */
export function beginVisit(section: string, drawing: string | null): string | null {
  if (drawing === section) return section;
  if (hasDrawn(section)) return null;
  rememberDrawn(section);
  return section;
}

/** Stops every draw on the page, including any chart about to mount. */
export function markDrawn(): void {
  document.documentElement.dataset.drawn = '';
}

/** Runs before first paint on a full page load; mirrors `hasDrawn` and `drawSection`. */
export const DRAW_ONCE_SCRIPT = `try{var s=JSON.parse(sessionStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'[]');if(Array.isArray(s)&&s.indexOf(location.pathname.split('/').filter(Boolean)[0]||'dashboard')>=0)document.documentElement.dataset.drawn=''}catch(e){}`;
