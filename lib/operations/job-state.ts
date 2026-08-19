import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { jobStateSchema, type JobId, type JobState } from '@/lib/operations/schedule'

export const JOB_STATE_DIRECTORY = '/data/jobs'

export async function readJobState(
  jobId: JobId,
  directory = JOB_STATE_DIRECTORY,
): Promise<JobState | null> {
  try {
    const parsed = jobStateSchema.safeParse(JSON.parse(await readFile(join(directory, `${jobId}.json`), 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function writeJobState(
  input: JobState,
  directory = JOB_STATE_DIRECTORY,
): Promise<JobState> {
  const state = jobStateSchema.parse(input)
  const path = join(directory, `${state.jobId}.json`)
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600)
  return state
}
