export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma';
import { GeneralSettings } from '../GeneralSettings';
import { OwnerNamesSettings } from '../OwnerNamesSettings';

export default async function GeneralSettingsPage() {
  const [settings, rates, owner] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.exchangeRate.findMany({ orderBy: { fromCurrency: 'asc' } }),
    prisma.user.findFirst({ select: { displayName: true } }),
  ]);

  return (
    <GeneralSettings
      anchorCurrency={settings?.anchorCurrency ?? 'HUF'}
      exchangeRates={rates.map((r: (typeof rates)[number]) => ({
        id: r.id,
        from: r.fromCurrency,
        to: r.toCurrency,
        rate: Number(r.rate),
        mode: r.mode,
        provider: r.provider,
        updatedAt: r.updatedAt.toISOString(),
      }))}
      fxAutoSync={settings?.fxAutoSync ?? true}
      openingBalance={Number(settings?.openingBalance ?? 0)}
      openingBalanceCurrency={settings?.openingBalanceCurrency ?? settings?.anchorCurrency ?? 'HUF'}
      openingBalanceMonth={settings?.openingBalanceMonth ?? null}
    >
      <OwnerNamesSettings displayName={owner?.displayName ?? ''} instanceName={settings?.instanceName ?? ''} />
    </GeneralSettings>
  );
}
