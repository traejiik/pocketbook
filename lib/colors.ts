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

/**
 * First letter (or digit) of up to `max` words, uppercased: "Emergency Fund" → "EF".
 * Punctuation never counts as an initial — "Food & Groceries" → "FG",
 * "Allowance (Home)" → "AH" — and a word with no letter or digit is skipped.
 * A name with no letters at all (an emoji, say) falls back to its first character.
 */
export function initials(name: string, max = 2): string {
  const letters = name
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((ch): ch is string => !!ch);
  if (letters.length === 0) return Array.from(name.trim())[0] ?? '';
  return letters.slice(0, max).join('').toUpperCase();
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
