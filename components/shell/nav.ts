import {
  LayoutGrid,
  List,
  Repeat,
  CalendarDays,
  PiggyBank,
  Tag,
  Sparkles,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavChild {
  id: string;
  label: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Subpages at `/<id>/<child.id>`. The parent link opens the first child. */
  children?: NavChild[];
}

// Settings subpages. The desktop sidebar and the open tablet drawer render
// them as a tree; below 1025px the settings layout shows them as a chip row.
export const SETTINGS_SECTIONS: NavChild[] = [
  { id: 'general', label: 'General' },
  { id: 'ai-insights', label: 'AI insights' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'data', label: 'Data' },
  { id: 'security', label: 'Security' },
];

// Single source of truth for primary navigation (sidebar, tablet rail,
// mobile top bar + tab bar). Dashboard uses the 4-square grid glyph per v5.
export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'transactions', label: 'Transactions', icon: List },
  { id: 'recurring', label: 'Recurring', icon: Repeat },
  { id: 'renewals', label: 'Renewals', icon: CalendarDays },
  { id: 'savings', label: 'Savings', icon: PiggyBank },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'insights', label: 'AI Insights', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings, children: SETTINGS_SECTIONS },
];

const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.id, n.label]));

/** Active nav id from a pathname (`/transactions?q=…` → `transactions`). */
export function navIdForPath(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  return seg;
}

/** Active child id from a pathname (`/settings/data` → `data`), or null. */
export function subNavIdForPath(pathname: string): string | null {
  return pathname.split('/').filter(Boolean)[1] ?? null;
}

/** Href for a nav item: its first child when it has subpages. */
export function hrefFor(item: NavItem): string {
  return item.children?.length ? `/${item.id}/${item.children[0].id}` : `/${item.id}`;
}

/**
 * View-transition type for moving between two children of one section: the
 * content slides the way the list reads (later child → forward). Only tag
 * links inside the section — entering it from elsewhere is a page change.
 */
export function siblingTransitionTypes(
  children: NavChild[],
  fromId: string | null,
  toId: string,
): string[] | undefined {
  const from = children.findIndex((c) => c.id === fromId);
  const to = children.findIndex((c) => c.id === toId);
  if (from < 0 || to < 0 || from === to) return undefined;
  return [to > from ? 'section-forward' : 'section-back'];
}

/** Page title for the header / mobile top bar. */
export function titleForPath(pathname: string): string {
  return TITLES[navIdForPath(pathname)] ?? 'Pocketbook';
}
