'use server'

import { revalidatePath } from 'next/cache'

import { runBackup } from '@/lib/operations/backup'
import { requireAuthenticatedUser } from '@/lib/require-auth'
import { logger } from '@/lib/logger'

const log = logger('backup')

export async function runBackupNow() {
  await requireAuthenticatedUser()
  log.info('manual backup requested')
  const result = await runBackup({ source: 'manual' })
  revalidatePath('/settings')
  return result
}
