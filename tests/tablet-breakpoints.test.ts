import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const root = process.cwd();

function source(file: string) {
  return readFileSync(path.join(root, file), 'utf8');
}

function occurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

function expectBefore(haystack: string, first: string, second: string) {
  expect(haystack.indexOf(first)).toBeGreaterThanOrEqual(0);
  expect(haystack.indexOf(second)).toBeGreaterThanOrEqual(0);
  expect(haystack.indexOf(first)).toBeLessThan(haystack.indexOf(second));
}

describe('tablet breakpoint contract', () => {
  test('shell swaps mobile, tablet rail, and desktop sidebar at v5 breakpoints', () => {
    const appShell = source('components/shell/AppShell.tsx');
    const sidebar = source('components/shell/Sidebar.tsx');
    const tabletRail = source('components/shell/TabletRail.tsx');
    const mobileNav = source('components/shell/MobileNav.tsx');
    const mobileTopBar = source('components/shell/MobileTopBar.tsx');
    const header = source('components/shell/Header.tsx');

    expect(appShell).toContain('w-full flex flex-col md:h-dvh md:flex-row md:overflow-hidden');
    expect(appShell).toContain('className="hidden md:flex min-[1025px]:!hidden"');
    expect(appShell).toContain('className="hidden min-[1025px]:flex"');
    expect(appShell).toContain('<Header displayName={displayName} className="hidden md:flex" />');
    expect(appShell).toContain('<MobileTopBar displayName={displayName} />');
    expect(appShell).toContain('pb-24 md:pb-0');

    expect(tabletRail).toContain("const STORAGE_KEY = 'pb-rail-collapsed';");
    expect(tabletRail).toContain("collapsed ? 'w-[76px]' : 'w-[232px]'");
    expect(tabletRail).toContain("collapsed ? 'justify-center' : 'gap-2.5 px-3'");
    expect(tabletRail).toContain('aria-label={collapsed ? \'Expand sidebar\' : \'Collapse sidebar\'}');
    expect(tabletRail).toContain('absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-warning');

    expect(tabletRail).toContain("'shrink-0 flex-col pt-5 pb-4 px-3 bg-card border-r border-border/55 transition-[width] duration-200'");
    expect(sidebar).toContain("'w-[224px] shrink-0 flex-col pt-5 pb-4 px-3 bg-card border-r border-border/55'");
    expect(sidebar).toContain("import { LogoMark } from '@/components/shell/LogoMark';");
    expect(sidebar).toContain('text-[15px] font-semibold tracking-tight');
    expect(sidebar).toContain('renewal-badge mono text-[10.5px] tabular');
    expect(sidebar).toContain('aria-label="Add transaction (N)"');

    expect(mobileNav).toContain('md:hidden fixed bottom-0 inset-x-0');
    expect(mobileNav).toContain('Home');
    expect(mobileNav).toContain('Transactions');
    expect(mobileNav).toContain('Recurring');
    expect(mobileNav).toContain('More');
    expect(mobileNav).toContain('side="bottom"');
    expect(mobileNav).toContain('max-w-[402px]');
    expect(mobileNav).toContain('!rounded-t-[24px]');
    expect(mobileNav).toContain('h-1.5 w-10 rounded-full bg-border');

    expect(mobileTopBar).toContain('md:hidden sticky top-0');
    expect(mobileTopBar).toContain('titleForPath(pathname)');
    // The date subtitle was removed from the mobile top bar
    expect(mobileTopBar).not.toContain('subtitleForPath');
    expect(source('components/shell/NotificationsBell.tsx')).toContain('!rounded-t-[24px]');
    expect(source('components/shell/NotificationsBell.tsx')).toContain('h-1.5 w-10 rounded-full bg-border');
    expect(source('components/shell/ProfileMenu.tsx')).toContain('!rounded-t-[24px]');
    expect(source('components/shell/ProfileMenu.tsx')).toContain('h-1.5 w-10 rounded-full bg-border');

    expect(header).toContain('h-[68px] shrink-0 items-center gap-4 pl-7 pr-6');
    expect(header).toContain('w-[148px] shrink-0');
    expect(header).toContain('max-w-[400px]');
    expect(header).toContain('<NotificationsBell />');
    expect(header).toContain('<ProfileMenu displayName={displayName} />');
  });

  test('dashboard reflows to the v5 tablet prototype at md and restores desktop spans at lg', () => {
    const dashboard = source('app/(app)/dashboard/page.tsx');
    const chart = source('app/(app)/dashboard/DashboardChartSection.tsx');

    // KPI strip goes four-up from tablet (was lg-only)
    expect(dashboard).toContain('grid grid-cols-2 md:grid-cols-4');

    // Chart renders two variants: horizontal category bars below lg (mobile + tablet),
    // and the vertical pill-bars + Net-trend toggle from lg up. Only one is ever visible.
    expect(chart).toContain('col-span-12 md:col-span-6 lg:hidden');
    expect(chart).toContain('hidden lg:block col-span-12 lg:col-span-7');
    expect(chart).toContain('h-2.5 rounded-full overflow-hidden bg-secondary'); // horizontal bar track
    expect(chart).toContain('Net trend'); // desktop-only toggle
    // Both variants show only the top 4 categories and say so when more exist
    expect(chart).toContain('byCategory.slice(0, 4)');
    expect(chart).toContain('`Top ${topCats.length} of ${catCount}`');

    // Tablet pairs: Expenses|Gauge, Renewals|Recent, Reminder|AI.
    // md:order-* sequences the cards into those rows; lg:order-none restores DOM order for the desktop spans.
    // The gauge also gets order-first so it sits right under the KPIs on mobile.
    expect(dashboard).toContain('col-span-12 md:col-span-6 lg:col-span-4 order-first md:order-2 lg:order-none');
    expect(dashboard).toContain('col-span-12 md:col-span-6 lg:col-span-5 md:order-3 lg:order-none');
    expect(dashboard).toContain('col-span-12 md:col-span-6 lg:col-span-5 md:order-4 lg:order-none');

    // Reminder/AI: full-width 2-up grid on tablet, stacked 3-col rail on desktop
    expect(dashboard).toContain('col-span-12 lg:col-span-3 md:order-5 lg:order-none');
    expect(dashboard).toContain('md:grid md:grid-cols-2 lg:flex lg:flex-col');

    // AI card shows an adaptation of its real state — never the prototype's hardcoded sentence
    expect(dashboard).toContain('Generate fresh commentary on where the money went');
    expect(dashboard).not.toContain('tracking a strong net month');

    expect(chart).toContain('pt-9');
    expect(chart).toContain('h-[212px]');
    expect(chart).toContain('top-0 left-1/2 -translate-x-1/2');
  });

  test('transactions render dedicated mobile, tablet, and desktop ledger tiers', () => {
    const tx = source('components/transactions/TransactionsView.tsx');

    // Shared container; mobile padding below md, v5 padding from md up
    expect(tx).toContain('px-4 md:px-7 pb-9 pt-1 max-w-[1320px] mx-auto');

    // Three breakpoint tiers, each gated by Tailwind visibility (no JS detection)
    expect(tx).toContain('<MobileTransactions');
    expect(tx).toContain('hidden md:block lg:hidden md:max-w-[920px] md:mx-auto');
    expect(tx).toContain('hidden lg:block');

    // Per-tier grids
    expect(tx).toContain("const DESKTOP_GRID = 'grid-cols-[110px_1fr_220px_150px_130px_36px]'");
    expect(tx).toContain("const TABLET_GRID = 'grid-cols-[80px_1fr_190px_130px]'");

    // Tablet rows carry a 32px category avatar; desktop keeps the In-HUF column + card spacing
    expect(tx).toContain('<CategoryAvatar name={tx.category.name} color={tx.category.color} size={32} />');
    expect(tx).toContain('<CalmCard className="mt-4 overflow-hidden">');

    // Shared month/net pill replaces the loose nav + plain-text net
    expect(tx).toContain('<MonthNetStrip');
    const strip = source('components/transactions/MonthNetStrip.tsx');
    expect(strip).toContain('bg-card border border-border/45');
    expect(strip).toContain("net >= 0 ? 'text-income' : 'text-expense'");

    // Mobile tier: 36px avatar rows + animated floating search overlay
    const mobile = source('components/transactions/MobileTransactions.tsx');
    expect(mobile).toContain('color={tx.category.color} size={36}');
    expect(mobile).toContain('Type to search all transactions');
    expect(mobile).toContain('aria-label="Search transactions"');

    // Segmented control keeps the v5 desktop pill sizing and gains a 40px touch variant
    const segmented = source('components/ui/segmented.tsx');
    expect(segmented).toContain('h-[26px]');
    expect(segmented).toContain('h-[34px]');
  });

  test('recurring, settings, and supporting pages adopt v5 padding and grids', () => {
    const recurring = source('app/(app)/recurring/RecurringView.tsx');
    expect(recurring).toContain('px-4 lg:px-7 pb-9 pt-1');
    expect(recurring).toContain('<RecurringBudget');
    expect(recurring).toContain('<CommitmentsLane rules={rules}');
    // Archived: compact flat rows on mobile, grouped cards on md+
    expect(recurring).toContain('function ArchivedCompactRow');
    expect(recurring).toContain('mt-3 space-y-5 hidden md:block');
    const recurringBudget = source('app/(app)/recurring/RecurringBudget.tsx');
    expect(recurringBudget).toContain('md:grid-cols-[320px_minmax(0,1fr)]');
    expect(recurringBudget).not.toContain('min-[900px]:grid-cols');
    expect(recurringBudget).not.toContain('lg:grid-cols-[320px_1fr]');
    expect(recurringBudget).toContain('gap-3 min-[1025px]:gap-4');
    expect(recurringBudget).toContain('px-3.5 py-4 min-[1025px]:p-5');
    expect(recurringBudget).toContain('min-h-[112px] min-[1025px]:min-h-[150px]');
    expect(recurringBudget).toContain('text-[24px] min-[1025px]:text-[33px]');
    expect(recurringBudget).toContain('text-[11px] min-[1025px]:text-[15px] text-muted-foreground font-medium ml-1');
    // Committed card shows top 4 + Other; mobile shows the % inline (top-right)
    expect(recurringBudget).toContain('budget.expensesByCategory.slice(0, 4)');
    expect(recurringBudget).toContain('md:hidden tabular text-[34px]');
    // KPI hints have a short mobile variant; warning has no "next 7 days" chip
    expect(recurringBudget).toContain('After save + spend');
    expect(recurringBudget).toContain('due in 7 days');
    expect(recurringBudget).not.toContain('next 7 days');

    const settings = source('app/(app)/settings/SettingsView.tsx');
    expect(settings).toContain('px-4 lg:px-7 pb-9 pt-1');
    expect(settings).toContain('grid grid-cols-[auto_1fr_auto] lg:grid-cols-[auto_1fr_auto_auto_auto]');
    expect(settings).toContain('hidden lg:flex items-center gap-0.5');
    expect(settings).toContain('hidden lg:block w-[150px]');
    expect(settings).toContain('lg:hidden px-1 pb-3.5');

    expect(source('app/(app)/renewals/RenewalsView.tsx')).toContain('px-4 lg:px-7 pb-9 pt-1');
    expect(source('app/(app)/categories/CategoriesView.tsx')).toContain('px-4 lg:px-7 pb-9 pt-1');
    expect(source('app/(app)/insights/page.tsx')).toContain('px-4 lg:px-7 pb-9 pt-1');
  });

  test('transaction form controls stay touch-sized through tablet widths', () => {
    const form = source('components/forms/TransactionForm.tsx');

    expect(form).toContain("useIsMobile('(max-width: 1024px)'");
    expect(form).toContain("side={useBottomSheet ? 'bottom' : 'right'}");
    expect(form).toContain('max-w-[560px]');
    expect(form).toContain('max-h-[92dvh]');
    expect(form).toContain('!rounded-t-[24px]');
    expect(form).toContain('h-1.5 w-10 rounded-full bg-border');
    expect(form).toContain("{editingTx ? 'Edit transaction' : 'Add transaction'}");
    expect(form).toContain("{editingTx ? `id · ${editingTx.id}` : 'Record a one-off or recurring entry'}");
    expect(form).toContain('h-11 xl:h-8');
    expect(form).toContain('h-11 xl:h-9');
    expect(form).toContain('py-2 xl:py-1');
    expect(form).toContain('text-base xl:text-[13px]');
    expect(form).toContain('min-[1025px]:!w-[420px] min-[1025px]:!max-w-[420px]');
    expectBefore(form, 'htmlFor="tx-description"', 'htmlFor="tx-amount"');
    expectBefore(form, 'htmlFor="tx-amount"', 'htmlFor="tx-date"');
  });

  test('recurring keeps tablet sheets and mobile rule list faithful to v5', () => {
    const recurring = source('app/(app)/recurring/RecurringView.tsx');

    expect(recurring).toContain('max-w-[920px] min-[1025px]:max-w-[1240px]');
    expect(recurring).toContain('space-y-5');
    expect(recurring).toContain('Subscriptions, installments, and recurring income.');
    expect(recurring).toContain('ruleCountLabel');
    expect(recurring).toContain("useIsMobile('(max-width: 1024px)'");
    expect(recurring).toContain("side={useBottomSheet ? 'bottom' : 'right'}");
    expect(recurring).toContain('max-w-[560px]');
    expect(recurring).toContain('max-h-[92dvh]');
    expect(recurring).toContain('!rounded-t-[24px]');
    expect(recurring).toContain('h-1.5 w-10 rounded-full bg-border');
    expect(recurring).toContain('function CompactRuleRow');
    expect(recurring).toContain('<CalmCard className="overflow-hidden md:hidden">');
    expect(recurring).toContain("label: `Expenses • ${expenseRules.length}`");
    expect(recurring).toContain("label: `Income • ${incomeRules.length}`");
    expect(recurring).toContain("label: `Savings • ${savingsRules.length}`");
    expect(recurring).not.toContain("label: `Exp · ${expenseRules.length}`");
    expect(recurring).not.toContain("label: `Inc · ${incomeRules.length}`");
    expect(recurring).not.toContain("label: `Sav · ${savingsRules.length}`");
    expect(recurring).toContain('hidden md:grid grid-cols-1 md:grid-cols-2 min-[1025px]:grid-cols-3 gap-4');
    expect(recurring).toContain('w-full inline-flex items-center justify-center gap-2 h-11 rounded-[12px]');
    expect(recurring).toContain('renderSegmentedField');
    expect(recurring).toContain('Subscriptions, installments and recurring income');
  });

  test('focused v5 polish contracts stay in place across supporting screens', () => {
    const timeline = source('components/finance/TimelineStrip.tsx');
    expect(timeline).toContain('calm-card p-6');
    expect(timeline).toContain('text-[10px] mono uppercase tracking-[0.12em]');
    expect(timeline).toContain('Math.min(98');
    expect(timeline).toContain('boxShadow: \'0 0 0 3px hsl(var(--card))\'');

    const categories = source('app/(app)/categories/CategoriesView.tsx');
    // 4e7eeff removed the fixed max-w-[860px] inner column so categories now
    // flows in the shared responsive page container.
    expect(categories).toContain('max-w-[1320px] mx-auto');
    expect(categories).toContain('text-[10px] mono uppercase tracking-[0.12em]');
    expect(categories).toContain('kindLabel(category.kind)');
    expect(categories).not.toContain('category.color.toUpperCase()');

    const insights = source('app/(app)/insights/page.tsx');
    expect(insights).toContain('max-w-[860px]');

    const settings = source('app/(app)/settings/SettingsView.tsx');
    expect(settings).toContain('calm-card p-6');
    expect(settings).not.toContain('Loader2');
    expect(settings).not.toContain('animate-spin');
  });
});
