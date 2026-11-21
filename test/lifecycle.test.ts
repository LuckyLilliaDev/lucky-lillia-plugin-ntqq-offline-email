import { Context, Service } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as EmailPlugin from '../src/index'
import { EMAIL_API } from '../src/testRoutes'
import type { FetchHandler } from '@luckylillia-dev/plugin-sdk'

const smtp = vi.hoisted(() => ({ send: vi.fn(async () => ({ messageId: 'mock-id' })) }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: smtp.send }) } }))

const settings = {
  smtp: { host: 'smtp.example.com', port: 587, secure: false, auth: { user: 'test', pass: 'stored-password' } },
  from: 'bot@example.com', to: 'owner@example.com',
}
let ctx: Context
let routes: Map<string, FetchHandler>
let watchers: Map<string, (duration: number) => void>

class MockWebui extends Service {
  constructor(ctx: Context) { super(ctx, 'webuiServer') }
  route(prefix: string, handler: FetchHandler) {
    return this.ctx.effect(() => { routes.set(prefix, handler); return () => { routes.delete(prefix) } })
  }
}
class MockProtocol extends Service {
  selfInfo = { uin: '', uid: '', nick: '', online: false }
  constructor(ctx: Context) { super(ctx, 'qqProtocol') }
  [Service.init]() { return () => { watchers.clear() } }
  onDisconnect(_timeout: number, callback: (duration: number) => void) { watchers.set('test', callback); return 'test' }
  offDisconnect(id: string) { watchers.delete(id) }
}

beforeEach(async () => {
  ctx = new Context()
  routes = new Map()
  watchers = new Map()
  await ctx.plugin(MockWebui)
})
afterEach(async () => { await ctx.fiber.dispose() })
const testEmail = () => routes.get(EMAIL_API)!.fetch(new Request('http://localhost' + EMAIL_API + '/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
}))

describe('standalone notification plugin', () => {
  it('tests SMTP before NTQQ is available and removes its route when disabled', async () => {
    const entry = await ctx.plugin(EmailPlugin, settings)
    expect(ctx.get('emailNotification')).toBeUndefined()
    expect((await testEmail()).status).toBe(200)
    expect(smtp.send).toHaveBeenCalledOnce()
    await entry.dispose()
    expect(routes.size).toBe(0)
  })

  it('starts and stops protocol monitoring independently from the test-email route', async () => {
    await ctx.plugin(EmailPlugin, settings)
    const protocol = await ctx.plugin(MockProtocol)
    await vi.waitFor(() => expect(watchers.size).toBe(1))
    await vi.waitFor(() => expect(ctx.get('emailNotification')).toBeDefined())
    await ctx.parallel('qq/session-expired', 'not logged in')
    expect(smtp.send).not.toHaveBeenCalled()
    await protocol.dispose()
    expect(ctx.get('emailNotification')).toBeUndefined()
    expect(watchers.size).toBe(0)
    expect(routes.has(EMAIL_API)).toBe(true)
  })

  it('does not send for logout or unloading the notification plugin', async () => {
    await ctx.plugin(MockProtocol)
    const entry = await ctx.plugin(EmailPlugin, settings)
    Object.assign(ctx.qqProtocol.selfInfo, { uin: '123', uid: 'u_123', online: true })
    await ctx.parallel('qq/online')
    await ctx.parallel('qq/logout')
    watchers.get('test')!(10000)
    await entry.dispose()
    expect(smtp.send).not.toHaveBeenCalled()
    expect(watchers.size).toBe(0)
    expect(routes.size).toBe(0)
  })
})
