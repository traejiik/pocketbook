import {
  LayoutGrid,
  List,
  Repeat2,
  CalendarDays,
  Tag,
  Sparkles,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

// Single source of truth for primary navigation (sidebar, tablet rail,
// mobile top bar + tab bar). Dashboard uses the 4-square grid glyph per v5.
export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'transactions', label: 'Transactions', icon: List },
  { id: 'recurring', label: 'Recurring', icon: Repeat2 },
  { id: 'renewals', label: 'Renewals', icon: CalendarDays },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'insights', label: 'AI Insights', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.id, n.label]));

/** Active nav id from a pathname (`/transactions?q=…` → `transactions`). */
export function navIdForPath(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  return seg;
}

/** Page title for the header / mobile top bar. */
export function titleForPath(pathname: string): string {
  return TITLES[navIdForPath(pathname)] ?? 'Pocketbook';
}
