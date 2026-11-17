import { Context } from 'cordis'
import { Hono } from 'hono'
import { checkEmail, EmailConfigManager, EmailSchema, type EmailSettings } from './config'
import { EmailService } from './service'

export const EMAIL_API = '/api/ntqq-offline-email'

// Config comes from this entry's apply(), including its real password. No host-private plugin/config API.
export function createEmailRoutes(ctx: Context, storedConfig: () => EmailSettings): Hono {
  const router = new Hono().basePath(EMAIL_API)
  router.post('/test', async c => {
    try {
      const body = await c.req.json().catch(() => ({})) as { config?: unknown }
      let config: EmailSettings
      try {
        config = new EmailSchema(structuredClone(body?.config ?? storedConfig()) as EmailSettings)
      } catch {
        return c.json({ success: false, message: '邮件设置格式不正确' }, 400)
      }
      // Fixed secret fields are masked with this public placeholder by the plugin configuration API.
      if (config.smtp.auth.pass === '********' || !config.smtp.auth.pass) {
        config.smtp.auth.pass = storedConfig().smtp.auth.pass
      }
      const issues = checkEmail(config, true)
      if (issues.length) return c.json({ success: false, message: issues.map(issue => issue.message).join(', ') }, 400)
      const service = new EmailService(new EmailConfigManager(() => ({ ...config, enabled: true })), ctx.logger)
      const result = await service.sendTestEmail()
      if (result.success) return c.json({ success: true, data: { messageId: result.messageId }, message: '测试邮件发送成功' })
      return c.json({ success: false, message: result.error || '测试邮件发送失败' }, 400)
    } catch (error) {
      ctx.logger.error('[NTQQOfflineEmail] 测试邮件发送失败', error)
      return c.json({ success: false, message: error instanceof Error ? error.message : '测试邮件发送失败' }, 500)
    }
  })
  return router
}
