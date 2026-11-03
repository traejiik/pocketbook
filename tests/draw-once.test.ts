import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beginVisit, DRAW_ONCE_SCRIPT, drawSection, hasDrawn, rememberDrawn } from '@/lib/draw-once';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/** Runs the pre-paint script the way the browser does, and reports whether it marked the page. */
function runScript(pathname: string) {
  const documentElement = { dataset: {} as Record<string, string> };
  vi.stubGlobal('location', { pathname });
  vi.stubGlobal('document', { documentElement });
  new Function(DRAW_ONCE_SCRIPT)();
  return 'drawn' in documentElement.dataset;
}

describe('draw once per section', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('sessionStorage', fakeStorage());
  });

  it('keys subpages to their section, and the root to the dashboard', () => {
    expect(drawSection('/settings/data')).toBe('settings');
    expect(drawSection('/')).toBe('dashboard');
  });

  it('plays the first visit and remembers each section separately', () => {
    expect(hasDrawn('dashboard')).toBe(false);
    rememberDrawn('dashboard');
    expect(hasDrawn('dashboard')).toBe(true);
    expect(hasDrawn('recurring')).toBe(false);
  });

  it('keeps earlier sections when remembering another', () => {
    rememberDrawn('dashboard');
    rememberDrawn('recurring');
    expect(hasDrawn('dashboard')).toBe(true);
  });

  it('still draws when storage is unavailable or corrupt', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(() => rememberDrawn('dashboard')).not.toThrow();
    expect(hasDrawn('dashboard')).toBe(false);
    expect(runScript('/dashboard')).toBe(false);

    vi.stubGlobal('sessionStorage', fakeStorage({ 'pb-drawn-sections': 'not json' }));
    expect(hasDrawn('dashboard')).toBe(false);
    expect(runScript('/dashboard')).toBe(false);
  });

  it('treats a repeated call for the drawing section as the same visit', () => {
    const first = beginVisit('dashboard', null);
    expect(first).toBe('dashboard');
    expect(beginVisit('dashboard', first)).toBe('dashboard');
  });

  it('does not replay when returning to a section by way of another', () => {
    let drawing = beginVisit('dashboard', null);
    drawing = beginVisit('recurring', drawing);
    expect(drawing).toBe('recurring');
    drawing = beginVisit('dashboard', drawing);
    expect(drawing).toBeNull();
    drawing = beginVisit('recurring', drawing);
    expect(drawing).toBeNull();
    drawing = beginVisit('dashboard', drawing);
    expect(drawing).toBeNull();
  });

  it('marks a repeat full-page load before paint, and only for that section', () => {
    rememberDrawn('dashboard');
    expect(runScript('/dashboard')).toBe(true);
    expect(runScript('/')).toBe(true);
    expect(runScript('/recurring')).toBe(false);
  });
});
