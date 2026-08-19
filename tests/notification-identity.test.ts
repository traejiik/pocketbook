import { describe, expect, it } from 'vitest'

import {
  normaliseNotificationIdentity,
  notificationIdentityKey,
} from '@/lib/notifications/identity'

describe('notification identity', () => {
  it('normalises whitespace and blank avatar values deterministically', () => {
    expect(normaliseNotificationIdentity({
      webhookUrl: '  https://discord.com/api/webhooks/123/token  ',
      username: '  Pocketbook Home  ',
      avatarUrl: '   ',
    })).toEqual({
      webhookUrl: 'https://discord.com/api/webhooks/123/token',
      username: 'Pocketbook Home',
      avatarUrl: null,
    })
  })

  it('changes the key for each identity edit', () => {
    const original = notificationIdentityKey({
      webhookUrl: 'https://discord.com/api/webhooks/123/token',
      username: 'Pocketbook',
      avatarUrl: null,
    })

    expect(notificationIdentityKey({
      webhookUrl: 'https://discord.com/api/webhooks/456/token',
      username: 'Pocketbook',
      avatarUrl: null,
    })).not.toBe(original)
    expect(notificationIdentityKey({
      webhookUrl: 'https://discord.com/api/webhooks/123/token',
      username: 'Pocketbook Home',
      avatarUrl: null,
    })).not.toBe(original)
    expect(notificationIdentityKey({
      webhookUrl: 'https://discord.com/api/webhooks/123/token',
      username: 'Pocketbook',
      avatarUrl: 'https://example.com/pocketbook.png',
    })).not.toBe(original)
  })
})
