import { describe, expect, it } from 'vitest'
import { checkEmail, DEFAULT_EMAIL_CONFIG, EmailSchema } from '../src/config'

const { enabled: _enabled, ...blank } = DEFAULT_EMAIL_CONFIG
const usable = { smtp: { host: 'smtp.test.com', port: 465, secure: true, auth: { user: 'me@test.com', pass: 'real-pass' } }, from: 'bot@test.com', to: 'me@test.com' }

describe('email settings', () => {
  it('has schema defaults equal to the defaults the service has always used', () => {
    expect(new EmailSchema()).toEqual(blank)
  })

  it('only insists on a usable SMTP setup when asked to: while notifications are on, or for a test email', () => {
    expect(checkEmail(blank, false)).toEqual([])
    expect(checkEmail(blank, true).map(issue => issue.path.join('.'))).toEqual(['smtp.host', 'from', 'to'])
    expect(checkEmail(usable, true)).toEqual([])
  })
})

