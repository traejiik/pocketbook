export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma';
import { pingOllama, listOllamaModels } from '@/lib/ollama';
import { SettingsView } from './SettingsView';
import { getDatabaseSize } from '@/server-actions/settings';
import { readNotificationConfig, toAuthenticatedNotificationSettings } from '@/lib/notifications/config';
import { readBackupStatus } from '@/lib/operations/backup';
import { nextOccurrence } from '@/lib/operations/schedule';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function SettingsPage() {
  const [settings, rates, dbSize, notificationConfig, backupStatus] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.exchangeRate.findMany({ orderBy: { fromCurrency: 'asc' } }),
    getDatabaseSize(),
    readNotificationConfig(),
    readBackupStatus(),
  ]);

  const ollamaUrl = settings?.ollamaUrl ?? 'http://ollama:11434';
  const [ollamaConnected, ollamaModels] = await Promise.all([
    pingOllama(ollamaUrl),
    listOllamaModels(ollamaUrl),
  ]);

  // Shown only when Ollama is unreachable, so these are suggestions rather than
  // an inventory. Sizes are nominal download sizes for display.
  const FALLBACK_MODELS = [
    { name: 'llama3.2:latest', size: 2_000_000_000 },
    { name: 'qwen3.5:4b', size: 2_600_000_000 },
    { name: 'mistral:7b', size: 4_100_000_000 },
  ];

  const models = ollamaModels.length > 0 ? ollamaModels : FALLBACK_MODELS;

  return (
    <SettingsView
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
      ollamaUrl={ollamaUrl}
      ollamaConnected={ollamaConnected}
      ollamaModel={settings?.ollamaModel ?? 'llama3.1:8b'}
      ollamaModels={models}
      autoInsightsMonthly={settings?.autoInsightsMonthly ?? true}
      notificationSettings={toAuthenticatedNotificationSettings(notificationConfig.config, notificationConfig.status)}
      backupStatus={backupStatus}
      nextBackupRun={nextOccurrence('backup', new Date()).scheduledFor}
      dbSize={dbSize}
      version={`v${JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version}`}
    />
  );
}
