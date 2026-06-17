import { describe, expect, test } from 'vitest';
import manifest from '../app/manifest';

describe('web app manifest', () => {
  const m = manifest();

  test('declares the core installability fields', () => {
    expect(m.name).toBe('Pocketbook');
    expect(m.short_name).toBe('Pocketbook');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/dashboard');
    expect(m.background_color).toBeTruthy();
    expect(m.theme_color).toBeTruthy();
  });

  test('ships 192 and 512 icons plus a maskable variant', () => {
    const icons = m.icons ?? [];
    expect(icons.some(i => i.sizes === '192x192')).toBe(true);
    expect(icons.some(i => i.sizes === '512x512')).toBe(true);
    expect(icons.some(i => i.purpose === 'maskable')).toBe(true);
    for (const icon of icons) {
      expect(icon.src.startsWith('/icons/')).toBe(true);
      expect(icon.type).toBe('image/png');
    }
  });
});
