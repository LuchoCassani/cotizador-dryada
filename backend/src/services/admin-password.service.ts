import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import type Database from 'better-sqlite3'

const scryptAsync = promisify(scrypt)
const KEY_LEN = 64

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const key = await scryptAsync(password, salt, KEY_LEN) as Buffer
  return `${salt}:${key.toString('hex')}`
}

async function verifyHash(password: string, stored: string): Promise<boolean> {
  const [salt, storedKey] = stored.split(':')
  const key = await scryptAsync(password, salt, KEY_LEN) as Buffer
  const storedBuf = Buffer.from(storedKey, 'hex')
  return key.length === storedBuf.length && timingSafeEqual(key, storedBuf)
}

export class AdminPasswordService {
  constructor(private db: Database.Database) {}

  async verifyLogin(password: string): Promise<{ match: boolean; configured: boolean }> {
    const row = this.db
      .prepare('SELECT valor FROM configuracion WHERE clave = ?')
      .get('admin_password_hash') as { valor: string } | undefined

    if (row) {
      return { match: await verifyHash(password, row.valor), configured: true }
    }

    const envPassword = process.env.ADMIN_PASSWORD
    if (!envPassword) return { match: false, configured: false }

    const expected = Buffer.from(envPassword)
    const received = Buffer.from(password)
    const match = expected.length === received.length && timingSafeEqual(expected, received)
    return { match, configured: true }
  }

  async change(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    const { match } = await this.verifyLogin(currentPassword)
    if (!match) return { ok: false, error: 'Contraseña actual incorrecta' }
    const newHash = await hashPassword(newPassword)
    this.db
      .prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)')
      .run('admin_password_hash', newHash)
    return { ok: true }
  }
}
