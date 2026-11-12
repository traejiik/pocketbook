import { EventEmitter } from 'node:events'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { describe, expect, it, vi } from 'vitest'

import { createInternalJobToken, superviseChildren, type ManagedChild } from '@/runtime/supervisor'
import { frameNextStartup } from '@/runtime/next-startup'

class FakeChild extends EventEmitter implements ManagedChild {
  killedWith: NodeJS.Signals[] = []
  kill(signal: NodeJS.Signals) {
    this.killedWith.push(signal)
    return true
  }
}

describe('runtime supervisor', () => {
  it('frames the original Next.js banner across chunk boundaries and streams later logs unchanged', async () => {
    const title = '\x1b[35m▲ Next.js 16.2.6\x1b[39m\n'
    const addresses = '- Local:         http://localhost:3000\n- Network:       http://0.0.0.0:3000\n'
    const ready = '\x1b[32m✓\x1b[39m Ready in 0ms\n'
    const boot = 'INFO [boot] pocketbook starting\n'
    const banner = Buffer.from(title + addresses + ready)
    const output: string[] = []

    await pipeline(
      Readable.from([Buffer.from('before\n'), banner.subarray(0, 6), banner.subarray(6), Buffer.from(boot)]),
      frameNextStartup(),
      new Writable({ write(chunk, _encoding, done) { output.push(chunk.toString()); done() } }),
    )

    expect(output).toEqual(['before\n', `\n${title}${addresses}${ready}\n`, boot])
  })

  it('forwards a partial banner if the web child exits before reporting readiness', async () => {
    const partial = '▲ Next.js 16.2.6\n- Local: http://localhost:3000\n'
    const output: string[] = []
    await pipeline(
      Readable.from([Buffer.from(partial)]),
      frameNextStartup(),
      new Writable({ write(chunk, _encoding, done) { output.push(chunk.toString()); done() } }),
    )
    expect(output.join('')).toBe(partial)
  })

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
