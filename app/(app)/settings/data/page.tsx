export const dynamic = 'force-dynamic'

import { getDatabaseSize } from '@/server-actions/settings';
import { readBackupStatus } from '@/lib/operations/backup';
import { nextOccurrence } from '@/lib/operations/schedule';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSettings } from '../DataSettings';

export default async function DataSettingsPage() {
  const [dbSize, backupStatus] = await Promise.all([getDatabaseSize(), readBackupStatus()]);

  return (
    <DataSettings
      backupStatus={backupStatus}
      nextBackupRun={nextOccurrence('backup', new Date()).scheduledFor}
      dbSize={dbSize}
      version={`v${JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version}`}
    />
  );
}
