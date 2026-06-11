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
  test('shell uses an icon rail until the full desktop breakpoint', () => {
    const sidebar = source('components/shell/Sidebar.tsx');
    const header = source('components/shell/Header.tsx');

    expect(sidebar).toContain('hidden sm:flex w-16 lg:w-[220px]');
    expect(sidebar).toContain("import { LogoMark } from '@/components/shell/LogoMark';");
    expect(sidebar).toContain('hidden lg:block h-9 w-auto');
    expect(sidebar).toContain('<LogoMark size={24} className="lg:hidden text-primary" />');
    expect(sidebar).toContain('hidden lg:block flex-1 text-left');
    expect(sidebar).toContain('hidden lg:inline-flex');
    expect(sidebar).toContain('lg:hidden absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-warning');
    expect(sidebar).toContain('title={item.label}');
    expect(sidebar).toContain('aria-label={item.label}');
    expect(sidebar).toContain('justify-center p-2 lg:justify-start lg:gap-2.5 lg:pl-2.5 lg:pr-2 lg:py-2');
    expect(sidebar).toContain('justify-center lg:justify-start lg:gap-2 px-0 lg:px-3');
    expect(sidebar).toContain('min-h-11 lg:min-h-0');
    expect(sidebar).toContain('title="Quick add"');
    expect(sidebar).toContain('aria-label="Quick add (N)"');

    expect(occurrences(header, 'hidden lg:block')).toBeGreaterThanOrEqual(2);
    expect(header).toContain('w-11 h-11 xl:w-9 xl:h-9');
  });

  test('dashboard restores desktop spans at lg while keeping tablet rows balanced', () => {
    const dashboard = source('app/(app)/dashboard/page.tsx');
    const chart = source('app/(app)/dashboard/DashboardChartSection.tsx');

    expect(dashboard).toContain('grid grid-cols-2 xl:grid-cols-4');
    expect(chart).toContain('col-span-12 lg:col-span-7');
    expect(dashboard).toContain('col-span-12 md:col-span-6 lg:col-span-5');
    expect(dashboard).toContain('col-span-12 md:col-span-6 lg:col-span-4');
    expect(dashboard).toContain('col-span-12 md:col-span-6 lg:col-span-3');
  });

  test('transactions use a four-column tablet table and six-column desktop table', () => {
    const tx = source('components/transactions/TransactionsView.tsx');

    expect(tx).toContain('px-4 sm:px-6 lg:px-8');
    expect(tx).toContain('hidden sm:grid grid-cols-[90px_1fr_130px_32px] lg:grid-cols-[100px_1fr_180px_120px_140px_40px]');
    expect(tx).toContain('grid-cols-[1fr_auto_auto] sm:grid-cols-[90px_1fr_130px_32px] lg:grid-cols-[100px_1fr_180px_120px_140px_40px]');
    expect(tx).toContain('hidden lg:block');
    expect(tx).toContain('hidden lg:flex');
    expect(tx).toContain('lg:hidden w-2 h-2 rounded-full shrink-0');
    expect(tx).toContain('lg:hidden text-[11px] text-muted-foreground flex items-center gap-1 pl-3.5');
    expect(tx).toContain('sm:hidden mono');
    expect(tx).toContain('sm:hidden text-border');
    expect(tx).toContain('lg:hidden text-[10.5px] text-muted-foreground tabular mt-0.5');
    expect(tx).toContain('h-10 xl:h-8');
    expect(tx).toContain('text-base xl:text-[12px]');
    expect(tx).toContain('h-11 w-11 xl:h-9 xl:w-9');

    // Filter bar: two intentional rows below xl, single desktop row at xl
    expect(tx).toContain('p-3 flex flex-col xl:flex-row xl:items-center gap-2 rounded-xl');
    expect(tx).toContain('flex flex-col md:flex-row md:items-center gap-2');
    expect(tx).toContain('flex items-center gap-2 flex-wrap xl:flex-1');
    expect(source('components/ui/Segmented.tsx')).toContain('h-10 xl:h-8');
  });

  test('recurring, settings, and supporting pages keep tablet-friendly padding and grids', () => {
    expect(source('app/(app)/recurring/RecurringView.tsx')).toContain('px-4 sm:px-6 lg:px-8');
    expect(source('app/(app)/recurring/RecurringView.tsx')).toContain('grid grid-cols-1 lg:grid-cols-[auto_1fr]');

    const settings = source('app/(app)/settings/SettingsView.tsx');
    expect(settings).toContain('grid grid-cols-[auto_1fr_auto] lg:grid-cols-[auto_1fr_auto_auto_auto]');
    expect(settings).toContain('hidden lg:flex items-center gap-0.5');
    expect(settings).toContain('hidden lg:block w-[150px]');
    expect(settings).toContain('lg:hidden px-1 pb-3.5');

    expect(source('app/(app)/renewals/RenewalsView.tsx')).toContain('px-4 sm:px-6 lg:px-8');
    expect(source('app/(app)/categories/CategoriesView.tsx')).toContain('px-4 sm:px-6 lg:px-8');
    expect(source('app/(app)/insights/page.tsx')).toContain('px-4 sm:px-6 lg:px-8 py-4 sm:py-6');
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
