import type {} from '@luckylillia/plugin-sdk'
import type {} from '@luckylillia/plugin-nt-protocol/contracts'
import { Context } from 'cordis'
import { EmailSchema, type EmailSettings } from './config'
import { EmailNotificationService } from './notifications'
import { createEmailRoutes, EMAIL_API } from './testRoutes'

export const name = '@luckylillia/plugin-ntqq-offline-email'
export const Config = EmailSchema
export type Config = EmailSettings

// Keep the settings test available while the enabled plugin waits for the NTQQ protocol or an account login.
// These branches belong to this entry, so disabling/unloading it removes both routes and notifications.
export function apply(ctx: Context, config: EmailSettings) {
  ctx.inject(['webuiServer'], ctx => { ctx.webuiServer.route(EMAIL_API, createEmailRoutes(ctx, () => config)) })
  ctx.inject(['qqProtocol'], ctx => { ctx.plugin(EmailNotificationService, config) })
}
