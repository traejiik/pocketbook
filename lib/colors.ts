/**
 * Helpers for the data-driven category colours (stored as six-digit hex).
 * These are the one place hex is allowed (category identity), so converting a
 * stored `#RRGGBB` into a translucent tint for avatars/dots lives here.
 */

/** `#RRGGBB` → `rgba(r, g, b, a)`. Falls back to the raw value if not hex. */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** First letters of up to `max` words, uppercased (e.g. "Emergency Fund" → "EF"). */
export function initials(name: string, max = 2): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, max)
    .join('')
    .toUpperCase();
}

/**
 * The swatches the Categories form offers, and the pool a category created from
 * an import picks from. Category colour is identity, not chrome, so hex is
 * allowed here (AGENTS.md §1).
 */
export const CATEGORY_PALETTE = [
  '#3FBF7F', '#5AA3FF', '#C58CFF', '#FF8A65', '#F5B544',
  '#6FB8FF', '#7BD3B3', '#E36F8E', '#A4D453', '#9C8CFF',
  '#8E97A8', '#4FB3E0', '#FF6B6B', '#FFD700', '#00CED1',
] as const

/** A palette colour for a category created without the user choosing one. */
export function randomCategoryColor(): string {
  return CATEGORY_PALETTE[Math.floor(Math.random() * CATEGORY_PALETTE.length)]
}
