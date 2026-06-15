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
