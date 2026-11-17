import net from 'node:net'
import { describe, expect, it } from 'vitest'
import { EmailConfigManager } from '../src/config'
import { EmailService } from '../src/service'

describe('SMTP delivery', () => {
  it('sends a test message through a local SMTP server without external delivery', async () => {
    const messages: string[] = []
    const sockets = new Set<net.Socket>()
    const server = net.createServer(socket => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      socket.setEncoding('utf8')
      socket.write('220 localhost SMTP test\r\n')
      let buffer = ''
      let data = false
      let message = ''
      socket.on('data', chunk => {
        buffer += chunk
        let end: number
        while ((end = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (data) {
            if (line === '.') { messages.push(message); data = false; socket.write('250 queued\r\n') }
            else message += line + '\r\n'
          } else if (/^(EHLO|HELO)/.test(line)) socket.write('250-localhost\r\n250 PIPELINING\r\n')
          else if (/^DATA/.test(line)) { data = true; socket.write('354 end with dot\r\n') }
          else if (/^QUIT/.test(line)) socket.end('221 bye\r\n')
          else socket.write('250 OK\r\n')
        }
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as net.AddressInfo).port
      const service = new EmailService(new EmailConfigManager(() => ({ enabled: true,
        smtp: { host: '127.0.0.1', port, secure: false, auth: { user: '', pass: '' } },
        from: 'bot@example.com', to: 'owner@example.com',
      })))
      const result = await service.sendTestEmail()
      expect(result).toMatchObject({ success: true, messageId: expect.any(String) })
      expect(messages).toHaveLength(1)
      expect(messages[0]).toContain('From: bot@example.com')
      expect(messages[0]).toContain('To: owner@example.com')
      expect(messages[0]).toContain('Subject: ')
    } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
