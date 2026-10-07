export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma';
import { pingOllama, listOllamaModels } from '@/lib/ollama';
import { AiSettings } from '../AiSettings';

// Shown only when Ollama is unreachable, so these are suggestions rather than
// an inventory. Sizes are nominal download sizes for display.
const FALLBACK_MODELS = [
  { name: 'llama3.2:latest', size: 2_000_000_000 },
  { name: 'qwen3.5:4b', size: 2_600_000_000 },
  { name: 'mistral:7b', size: 4_100_000_000 },
];

export default async function AiSettingsPage() {
  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });

  const ollamaUrl = settings?.ollamaUrl ?? 'http://ollama:11434';
  const [ollamaConnected, ollamaModels] = await Promise.all([
    pingOllama(ollamaUrl),
    listOllamaModels(ollamaUrl),
  ]);

  return (
    <AiSettings
      ollamaUrl={ollamaUrl}
      ollamaConnected={ollamaConnected}
      ollamaModel={settings?.ollamaModel ?? 'llama3.1:8b'}
      ollamaModels={ollamaModels.length > 0 ? ollamaModels : FALLBACK_MODELS}
      autoInsightsMonthly={settings?.autoInsightsMonthly ?? true}
    />
  );
}
