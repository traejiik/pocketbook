import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hashNotificationIdentity } from '@/lib/notifications/verification'
import { DEFAULT_NOTIFICATION_EVENTS, type NotificationConfigV2 } from '@/lib/notifications/types'

const authMock = vi.hoisted(() => vi.fn())
const configState = vi.hoisted(() => ({
  config: null as NotificationConfigV2 | null,
  writeCount: 0,
  firstWriteBarrier: null as null | {
    reached: () => void
    release: Promise<void>
  },
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/notifications/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications/config')>()
  return {
    ...actual,
    readNotificationConfig: vi.fn(async () => ({
      status: 'ready' as const,
      config: structuredClone(configState.config),
    })),
    writeNotificationConfig: vi.fn(async (input: NotificationConfigV2) => {
      configState.writeCount += 1
      if (configState.writeCount === 1 && configState.firstWriteBarrier) {
        configState.firstWriteBarrier.reached()
        await configState.firstWriteBarrier.release
      }
      configState.config = structuredClone(input)
      return structuredClone(input)
    }),
  }
})

const identity = {
  webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
  username: 'Pocketbook',
  avatarUrl: null,
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('notification settings mutation ordering', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    configState.config = {
      version: 2,
      enabled: true,
      ...identity,
      events: DEFAULT_NOTIFICATION_EVENTS,
      verification: {
        identityHash: hashNotificationIdentity(identity),
        verifiedAt: '2026-08-19T12:00:00.000Z',
      },
    }
    configState.writeCount = 0
    configState.firstWriteBarrier = null
    vi.resetModules()
  })

  it('does not let a stale Save undo a later Disconnect', async () => {
    const saveReachedWrite = deferred()
    const releaseSave = deferred()
    configState.firstWriteBarrier = {
      reached: () => saveReachedWrite.resolve(),
      release: releaseSave.promise,
    }
    const { disconnectDiscordNotifications, saveNotificationSettings } = await import(
      '@/server-actions/notifications'
    )

    const savePromise = saveNotificationSettings({
      enabled: false,
      ...identity,
      events: { ...DEFAULT_NOTIFICATION_EVENTS, backupCompleted: false },
    })
    await saveReachedWrite.promise

    const disconnectPromise = disconnectDiscordNotifications()
    for (let index = 0; index < 4; index += 1) await Promise.resolve()
    releaseSave.resolve()

    await expect(savePromise).resolves.toEqual(expect.objectContaining({ ok: true }))
    await expect(disconnectPromise).resolves.toEqual(expect.objectContaining({ ok: true }))
    expect(configState.config).toEqual(expect.objectContaining({
      enabled: false,
      webhookUrl: null,
      verification: null,
    }))
  })
})
