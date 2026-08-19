import { describe, expect, it } from 'vitest'

import { notificationEventFromArgs } from '@/runtime/notify-cli'

describe('notification CLI', () => {
  it('builds a typed system event without reading webhook environment variables', () => {
    expect(notificationEventFromArgs(['system-alert', 'Startup failed', 'stage=migrate · exit 1'])).toEqual({
      type: 'systemAlerts',
      title: 'Startup failed',
      description: 'stage=migrate · exit 1',
    })
  })

  it('rejects incomplete or unknown commands', () => {
    expect(notificationEventFromArgs(['system-alert', 'Missing description'])).toBeNull()
    expect(notificationEventFromArgs(['discord-webhook-env'])).toBeNull()
  })
})
