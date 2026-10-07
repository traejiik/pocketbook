import { existsSync } from 'node:fs';
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
