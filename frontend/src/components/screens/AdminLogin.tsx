import { useState } from 'react'
import { adminLogin } from '../../services/api'

interface Props {
  onLogin: () => void
  onBack: () => void
}

export function AdminLogin({ onLogin, onBack }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const session = await adminLogin(password)
      sessionStorage.setItem('admin_token', session.token)
      onLogin()
    } catch {
      setError('Contraseña incorrecta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Panel de administración</h1>
        <p className="text-sm text-gray-500 mb-6">Ingresá tu contraseña para continuar</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              autoFocus
              required
            />
            {error && (
              <p className="mt-1.5 text-sm text-red-600">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {loading ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>

        <button
          onClick={onBack}
          className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Volver al cotizador
        </button>
      </div>
    </div>
  )
}
