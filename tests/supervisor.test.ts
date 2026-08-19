import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { createInternalJobToken, superviseChildren, type ManagedChild } from '@/runtime/supervisor'

class FakeChild extends EventEmitter implements ManagedChild {
  killedWith: NodeJS.Signals[] = []
  kill(signal: NodeJS.Signals) {
    this.killedWith.push(signal)
    return true
  }
}

describe('runtime supervisor', () => {
  it('generates a 256-bit internal token without external configuration', () => {
    expect(createInternalJobToken(() => Buffer.alloc(32, 0xab))).toBe('ab'.repeat(32))
  })

  it('terminates the sibling and exits non-zero when a child dies unexpectedly', async () => {
    const web = new FakeChild()
    const worker = new FakeChild()
    const notify = vi.fn().mockResolvedValue({ delivered: true })
    const exit = vi.fn()
    superviseChildren({ web, worker, notify, exit, now: () => 1_000 })

    worker.emit('exit', 7, null)
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))

    expect(web.killedWith).toContain('SIGTERM')
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'systemAlerts',
      title: 'Pocketbook scheduler stopped',
    }))
  })

  it('forwards a planned shutdown signal to both children', () => {
    const web = new FakeChild()
    const worker = new FakeChild()
    const control = superviseChildren({
      web,
      worker,
      notify: vi.fn(),
      exit: vi.fn(),
      now: () => 1_000,
    })

    control.shutdown('SIGTERM')

    expect(web.killedWith).toEqual(['SIGTERM'])
    expect(worker.killedWith).toEqual(['SIGTERM'])
  })

  it('exits cleanly after both children stop during a planned shutdown', () => {
    const web = new FakeChild()
    const worker = new FakeChild()
    const exit = vi.fn()
    const control = superviseChildren({
      web,
      worker,
      notify: vi.fn(),
      exit,
      now: () => 1_000,
    })

    control.shutdown('SIGTERM')
    web.emit('exit', 0, null)
    expect(exit).not.toHaveBeenCalled()
    worker.emit('exit', 0, null)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('fails the service when worker heartbeats stop', async () => {
    const web = new FakeChild()
    const worker = new FakeChild()
    const exit = vi.fn()
    const control = superviseChildren({
      web,
      worker,
      notify: vi.fn().mockResolvedValue({ delivered: true }),
      exit,
      now: () => 1_000,
      heartbeatTimeoutMs: 180_000,
    })
    control.heartbeat(1_000)

    await control.checkHeartbeat(181_001)

    expect(web.killedWith).toContain('SIGTERM')
    expect(worker.killedWith).toContain('SIGTERM')
    expect(exit).toHaveBeenCalledWith(1)
  })
})
