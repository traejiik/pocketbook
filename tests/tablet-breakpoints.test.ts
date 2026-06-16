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

describe('tablet breakpoint contract', () => {
  test('shell swaps mobile, tablet rail, and desktop sidebar at v5 breakpoints', () => {
    const appShell = source('components/shell/AppShell.tsx');
    const sidebar = source('components/shell/Sidebar.tsx');
    const tabletRail = source('components/shell/TabletRail.tsx');
    const mobileNav = source('components/shell/MobileNav.tsx');
    const mobileTopBar = source('components/shell/MobileTopBar.tsx');
    const header = source('components/shell/Header.tsx');

    expect(appShell).toContain('w-full h-dvh flex flex-col md:flex-row');
    expect(appShell).toContain('className="hidden md:flex lg:hidden"');
    expect(appShell).toContain('className="hidden lg:flex"');
    expect(appShell).toContain('<Header displayName={displayName} className="hidden md:flex" />');
    expect(appShell).toContain('<MobileTopBar displayName={displayName} />');
    expect(appShell).toContain('pb-24 md:pb-0');

    expect(tabletRail).toContain("const STORAGE_KEY = 'pb-rail-collapsed';");
    expect(tabletRail).toContain("collapsed ? 'w-[76px]' : 'w-[232px]'");
    expect(tabletRail).toContain("collapsed ? 'justify-center' : 'gap-2.5 px-3'");
    expect(tabletRail).toContain('aria-label={collapsed ? \'Expand sidebar\' : \'Collapse sidebar\'}');
    expect(tabletRail).toContain('absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-warning');

    expect(sidebar).toContain("'w-[224px] shrink-0 flex flex-col pt-5 pb-4 px-3 bg-card border-r border-border/55'");
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

    expect(mobileTopBar).toContain('md:hidden sticky top-0');
    expect(header).toContain('h-[68px] shrink-0 items-center gap-4 pl-7 pr-6');
    expect(header).toContain('w-[148px] shrink-0');
    expect(header).toContain('max-w-[400px]');
    expect(header).toContain('<NotificationsBell />');
    expect(header).toContain('<ProfileMenu displayName={displayName} />');
  });

  test('dashboard restores desktop spans at lg while keeping tablet rows balanced', () => {
    const dashboard = source('app/(app)/dashboard/page.tsx');
    const chart = source('app/(app)/dashboard/DashboardChartSection.tsx');

    expect(dashboard).toContain('grid grid-cols-2 lg:grid-cols-4');
    expect(chart).toContain('col-span-12 lg:col-span-7');
    expect(dashboard).toContain('col-span-12 md:col-span-6 lg:col-span-5');
    expect(dashboard).toContain('col-span-12 md:col-span-6 lg:col-span-4');
    expect(dashboard).toContain('col-span-12 md:col-span-6 lg:col-span-3');
  });

  test('transactions render a calm single-card ledger with a v5 desktop grid', () => {
    const tx = source('components/transactions/TransactionsView.tsx');

    expect(tx).toContain('px-4 lg:px-7 pb-9 pt-1 max-w-[1320px] mx-auto');
    expect(tx).toContain("const ROW_GRID = 'lg:grid-cols-[100px_1fr_190px_130px_120px_32px]'");
    expect(tx).toContain('grid-cols-[1fr_auto]');
    expect(tx).toContain('hidden lg:grid');
    expect(tx).toContain('hidden lg:block mono text-[12px] text-muted-foreground tabular');
    expect(tx).toContain('hidden lg:flex items-center gap-1.5 text-[12px] text-muted-foreground');
    expect(tx).toContain('<CalmCard className="mt-4 overflow-hidden">');

    // Segmented control adopts the v5 pill sizing
    expect(source('components/ui/segmented.tsx')).toContain('h-[26px]');
  });

  test('recurring, settings, and supporting pages adopt v5 padding and grids', () => {
    const recurring = source('app/(app)/recurring/RecurringView.tsx');
    expect(recurring).toContain('px-4 lg:px-7 pb-9 pt-1');
    expect(recurring).toContain('<RecurringBudget');
    expect(recurring).toContain('<CommitmentsLane rules={rules}');
    expect(source('app/(app)/recurring/RecurringBudget.tsx')).toContain('lg:grid-cols-[320px_1fr]');

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

    expect(form).toContain('h-11 xl:h-8');
    expect(form).toContain('h-11 xl:h-9');
    expect(form).toContain('py-2 xl:py-1');
    expect(form).toContain('text-base xl:text-[13px]');
    expect(form).toContain('w-full sm:w-[440px] sm:max-w-[440px]');
  });
});
