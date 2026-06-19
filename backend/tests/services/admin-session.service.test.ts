import { describe, it, expect, beforeEach } from 'vitest'
import { AdminSessionService } from '../../src/services/admin-session.service'

describe('AdminSessionService', () => {
  let service: AdminSessionService

  beforeEach(() => {
    service = new AdminSessionService()
  })

  it('createSession() devuelve string de 64 chars hexadecimales', () => {
    const token = service.createSession()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('isValid() devuelve true para token recién creado', () => {
    const token = service.createSession()
    expect(service.isValid(token)).toBe(true)
  })

  it('isValid() devuelve false para token inexistente', () => {
    expect(service.isValid('token-desconocido')).toBe(false)
  })

  it('isValid() devuelve false y elimina el token cuando está expirado', () => {
    const token = service.createSession()
    const sessions = (service as unknown as { sessions: Map<string, { expiresAt: number }> }).sessions
    sessions.set(token, { expiresAt: Date.now() - 1000 })

    expect(service.isValid(token)).toBe(false)
    expect(sessions.has(token)).toBe(false)
  })

  it('revoke() invalida un token válido', () => {
    const token = service.createSession()
    expect(service.isValid(token)).toBe(true)
    service.revoke(token)
    expect(service.isValid(token)).toBe(false)
  })
})
