import { useState } from 'react'
import { adminChangePassword } from '../../services/api'

interface Props {
  onSessionExpired: () => void
}

export function TabSeguridad({ onSessionExpired }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (next !== confirm) {
      setError('Las contraseñas nuevas no coinciden')
      return
    }
    if (next.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    setLoading(true)
    try {
      await adminChangePassword(current, next)
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      const e = err as { code?: string; error?: string }
      if (e.code === 'SESSION_EXPIRED') {
        onSessionExpired()
      } else if (e.code === 'ADMIN_UNAUTHORIZED') {
        setError('La contraseña actual es incorrecta')
      } else {
        setError('No se pudo cambiar la contraseña')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Cambiar contraseña</h2>
      <p className="text-sm text-gray-500 mb-6">
        La nueva contraseña se guarda de forma segura. El env var <code className="bg-gray-100 px-1 rounded">ADMIN_PASSWORD</code> del servidor sigue funcionando como contraseña de recuperación.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña actual</label>
          <input
            type="password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
          <input
            type="password"
            value={next}
            onChange={e => setNext(e.target.value)}
            required
            minLength={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nueva contraseña</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">Contraseña cambiada correctamente.</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {loading ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  )
}
