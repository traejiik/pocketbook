import { prisma } from '@/lib/prisma';
import { pingOllama, listOllamaModels } from '@/lib/ollama';
import { SettingsView } from './SettingsView';
import { getDatabaseSize } from '@/server-actions/settings';
import { readFileSync } from 'fs';

export default async function SettingsPage() {
  const [settings, rates, dbSize] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.exchangeRate.findMany({ orderBy: { fromCurrency: 'asc' } }),
    getDatabaseSize(),
  ]);

  const ollamaUrl = settings?.ollamaUrl ?? 'http://ollama:11434';
  const [ollamaConnected, ollamaModels] = await Promise.all([
    pingOllama(ollamaUrl),
    listOllamaModels(ollamaUrl),
  ]);

  // Read last-backup mtime from /data/last-backup if it exists
  let lastBackup = '—';
  try {
    const stat = readFileSync('/data/last-backup');
    lastBackup = stat ? new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  } catch {
    // file not found — placeholder
  }

  const FALLBACK_MODELS = [
    { name: 'llama3.1:8b', size: 4_900_000_000 },
    { name: 'mistral:7b', size: 4_100_000_000 },
    { name: 'qwen2.5:14b', size: 8_700_000_000 },
  ];

  const models = ollamaModels.length > 0 ? ollamaModels : FALLBACK_MODELS;

  return (
    <SettingsView
      anchorCurrency={settings?.anchorCurrency ?? 'HUF'}
      exchangeRates={rates.map(r => ({
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
      dbSize={dbSize}
      lastBackup={lastBackup}
      version="v0.1.0"
    />
  );
}
