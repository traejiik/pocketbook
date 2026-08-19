'use server'

import { revalidatePath } from 'next/cache'

import { runBackup } from '@/lib/operations/backup'
import { requireAuthenticatedUser } from '@/lib/require-auth'

export async function runBackupNow() {
  await requireAuthenticatedUser()
  const result = await runBackup({ source: 'manual' })
  revalidatePath('/settings')
  return result
}
