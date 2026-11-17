import { Context, Service } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailNotificationService } from '../src/notifications'
import { DEFAULT_EMAIL_CONFIG, EmailConfigManager } from '../src/config'

vi.mock('../src/config', async importOriginal => ({
  ...await importOriginal<object>(),
  // The handlers under test only look at the manager
  EmailConfigManager: class {
    getConfig = vi.fn(() => ({ enabled: true }))
  },
}))

vi.mock('../src/service', () => ({
  EmailService: class {
    sendOfflineNotification = vi.fn(async () => ({ success: true }))
  },
}))

describe('session expiration notifications', () => {
  // The protocol owns its current identity; notifications do not wait for a login service.
  const account = { uin: '123456', uid: 'test-uid', nick: 'TestBot', online: true }

  beforeEach(() => {
    vi.useFakeTimers()
    account.online = true
  })

  it('coalesces simultaneous offline events while SMTP is still sending', async () => {
    const ctx = new Context()
    const onDisconnect = vi.fn()
    ctx.provide('qqProtocol', { selfInfo: account, onDisconnect, offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    const send = vi.mocked(email.getEmailService().sendOfflineNotification)
    const pending = Promise.withResolvers<{ success: boolean }>()
    send.mockReturnValueOnce(pending.promise)
    await ctx.parallel('qq/session-expired', 'expired')
    await ctx.parallel('nt/kicked-offline', { tipsDesc: 'kicked' })
    onDisconnect.mock.calls[0][1](10000)
    expect(send).toHaveBeenCalledOnce()
    // A new login must rearm even while the previous login's send is still pending.
    await ctx.parallel('qq/online')
    await ctx.parallel('qq/session-expired', 'new disconnect')
    expect(send).toHaveBeenCalledTimes(2)
    pending.resolve({ success: true })
    await Promise.resolve()
    await ctx.parallel('qq/session-expired', 'duplicate')
    expect(send).toHaveBeenCalledTimes(2)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(['qq/session-expired', 'nt/kicked-offline'] as const)(
    'sends the reason once and rearms after login for %s',
    async (event) => {
      const ctx = new Context()
      const onDisconnect = vi.fn()
      ctx.provide('qqProtocol', { selfInfo: account, onDisconnect, offDisconnect: vi.fn() })
      const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
      const send = vi.mocked(email.getEmailService().sendOfflineNotification)
      const reason = 'Test authentication failure'
      const emitOffline = () =>
        event === 'qq/session-expired'
          ? ctx.parallel(event, reason)
          : ctx.parallel(event, { tipsDesc: reason, tipsTitle: 'Offline', kickedType: 1001 })

      account.online = false
      await emitOffline()
      expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ uin: '123456' }), reason)
      await emitOffline()
      onDisconnect.mock.calls[0][1](10000)
      expect(send).toHaveBeenCalledTimes(1)

      account.online = true
      await ctx.parallel('qq/online')
      account.online = false
      await emitOffline()
      expect(send).toHaveBeenCalledTimes(2)
    },
  )

  it('respects disabled email notifications', async () => {
    const ctx = new Context()
    ctx.provide('qqProtocol', { selfInfo: account, onDisconnect: vi.fn(), offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    vi.mocked(email.getConfigManager().getConfig).mockReturnValue({ enabled: false } as ReturnType<
      EmailConfigManager['getConfig']
    >)
    account.online = false
    await ctx.parallel('qq/session-expired', 'Test authentication failure')
    expect(email.getEmailService().sendOfflineNotification).not.toHaveBeenCalled()
  })

  it('ignores connection failures before the first login', async () => {
    const ctx = new Context()
    const selfInfo = { uin: '', uid: '', nick: '', online: false }
    const onDisconnect = vi.fn().mockReturnValue('watcher')
    ctx.provide('qqProtocol', { selfInfo, onDisconnect, offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    const send = vi.mocked(email.getEmailService().sendOfflineNotification)

    await ctx.parallel('qq/session-expired', 'Not logged in')
    onDisconnect.mock.calls[0][1](10000)
    expect(send).not.toHaveBeenCalled()

    Object.assign(selfInfo, account)
    await ctx.parallel('qq/online')
    selfInfo.online = false
    await ctx.parallel('qq/session-expired', 'Expired after login')
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ uin: '123456', uid: 'test-uid' }),
      'Expired after login',
    )
  })

  it('rearms connection timeout notices on each successful reconnect', async () => {
    const ctx = new Context()
    const onDisconnect = vi.fn()
    ctx.provide('qqProtocol', { selfInfo: account, onDisconnect, offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    const send = vi.mocked(email.getEmailService().sendOfflineNotification)

    account.online = false
    onDisconnect.mock.calls[0][1](10000)
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    account.online = true
    await ctx.parallel('qq/online')
    account.online = false
    onDisconnect.mock.calls[0][1](10000)
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('removes its disconnect callback and stays silent when disabled', async () => {
    const ctx = new Context()
    const onDisconnect = vi.fn().mockReturnValue('watcher')
    const offDisconnect = vi.fn()
    ctx.provide('qqProtocol', { selfInfo: account, onDisconnect, offDisconnect })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    const dispose = await email[Service.init]()
    dispose()
    expect(offDisconnect).toHaveBeenCalledExactlyOnceWith('watcher')
    onDisconnect.mock.calls[0][1](10000)
    expect(email.getEmailService().sendOfflineNotification).not.toHaveBeenCalled()
  })

  it('does not notify after an intentional logout', async () => {
    const ctx = new Context()
    const selfInfo = { ...account }
    const onDisconnect = vi.fn()
    ctx.provide('qqProtocol', { selfInfo, onDisconnect, offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    Object.assign(selfInfo, { uin: '', uid: '', nick: '', online: false })
    await ctx.parallel('qq/logout')
    onDisconnect.mock.calls[0][1](10000)
    await ctx.parallel('qq/session-expired', 'Already logged out')
    expect(email.getEmailService().sendOfflineNotification).not.toHaveBeenCalled()
  })
})
