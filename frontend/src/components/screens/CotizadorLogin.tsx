import { useState } from 'react'
import { cotizadorLogin } from '../../services/api'

interface Props {
  onLogin: () => void
}

export function CotizadorLogin({ onLogin }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { token } = await cotizadorLogin(password)
      sessionStorage.setItem('cotizador_token', token)
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
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-widest text-violet-600 uppercase mb-1">DRY / ADA</p>
          <h1 className="text-xl font-semibold text-gray-900">Cotizador 3D</h1>
          <p className="text-sm text-gray-500 mt-1">Ingresá la clave de acceso para continuar</p>
        </div>

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
            />
            {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {loading ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
