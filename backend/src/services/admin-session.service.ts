import { randomBytes } from 'crypto'

interface Session {
  expiresAt: number
}

export class AdminSessionService {
  private sessions = new Map<string, Session>()

  createSession(): string {
    const token = randomBytes(32).toString('hex')
    this.sessions.set(token, { expiresAt: Date.now() + 8 * 60 * 60 * 1000 })
    return token
  }

  isValid(token: string): boolean {
    const session = this.sessions.get(token)
    if (!session) return false
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token)
      return false
    }
    return true
  }

  revoke(token: string): void {
    this.sessions.delete(token)
  }
}

export const adminSessionService = new AdminSessionService()
