import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { NAV, SETTINGS_SECTIONS, hrefFor, navIdForPath, subNavIdForPath, titleForPath } from '@/components/shell/nav';

describe('settings subpage navigation', () => {
  test('every settings section has a route', () => {
    for (const section of SETTINGS_SECTIONS) {
      const page = path.join(process.cwd(), 'app/(app)/settings', section.id, 'page.tsx');
      expect(existsSync(page), section.id).toBe(true);
    }
  });

  test('a parent with subpages links to its first child', () => {
    const settings = NAV.find((item) => item.id === 'settings')!;
    expect(hrefFor(settings)).toBe('/settings/general');
    expect(hrefFor(NAV.find((item) => item.id === 'transactions')!)).toBe('/transactions');
  });

  test('subpages keep the parent active and name the child', () => {
    expect(navIdForPath('/settings/data')).toBe('settings');
    expect(subNavIdForPath('/settings/data')).toBe('data');
    expect(subNavIdForPath('/transactions')).toBeNull();
    // The 148px header title slot cannot fit a section name.
    expect(titleForPath('/settings/notifications')).toBe('Settings');
  });
});

describe('savings navigation', () => {
  test('sits under Renewals in the sidebar, and so in the mobile More panel', () => {
    const ids = NAV.map((item) => item.id)
    expect(ids.indexOf('savings')).toBe(ids.indexOf('renewals') + 1)
    expect(hrefFor(NAV.find((item) => item.id === 'savings')!)).toBe('/savings')

    const dock = readFileSync('components/shell/MobileNav.tsx', 'utf8')
    expect(dock).toContain("const MORE_IDS = new Set(['renewals', 'savings', 'categories', 'insights', 'settings']);")
    expect(dock).toContain('const MORE = NAV.filter((item) => MORE_IDS.has(item.id));')
  })
})
