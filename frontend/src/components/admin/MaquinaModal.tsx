import { useState } from 'react'
import type { MaquinaAdmin, ApiError } from '../../types'

interface Props {
  maquina?: MaquinaAdmin
  onSave: (data: Omit<MaquinaAdmin, 'id' | 'creadaAt'>) => Promise<void>
  onClose: () => void
}

export function MaquinaModal({ maquina, onSave, onClose }: Props) {
  const [nombre, setNombre] = useState(maquina?.nombre ?? '')
  const [capX, setCapX] = useState(maquina?.capacidadXmm?.toString() ?? '')
  const [capY, setCapY] = useState(maquina?.capacidadYmm?.toString() ?? '')
  const [capZ, setCapZ] = useState(maquina?.capacidadZmm?.toString() ?? '')
  const [costo, setCosto] = useState(maquina?.costoUsd?.toString() ?? '')
  const [meses, setMeses] = useState(maquina?.mesesAmortizacion?.toString() ?? '')
  const [activa, setActiva] = useState(maquina?.activa ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function clearFieldError(field: string) {
    setErrors(prev => { const next = { ...prev }; delete next[field]; return next })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}

    if (!nombre.trim()) newErrors.nombre = 'El nombre es requerido'
    const xNum = parseFloat(capX)
    if (isNaN(xNum) || xNum <= 0) newErrors.capX = 'Debe ser mayor a 0'
    const yNum = parseFloat(capY)
    if (isNaN(yNum) || yNum <= 0) newErrors.capY = 'Debe ser mayor a 0'
    const zNum = parseFloat(capZ)
    if (isNaN(zNum) || zNum <= 0) newErrors.capZ = 'Debe ser mayor a 0'
    const costoNum = parseFloat(costo)
    if (isNaN(costoNum) || costoNum <= 0) newErrors.costo = 'El costo debe ser mayor a 0'
    const mesesNum = parseInt(meses, 10)
    if (isNaN(mesesNum) || mesesNum < 1) newErrors.meses = 'Los meses deben ser al menos 1'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSaving(true)
    try {
      await onSave({
        nombre: nombre.trim(),
        capacidadXmm: xNum,
        capacidadYmm: yNum,
        capacidadZmm: zNum,
        costoUsd: costoNum,
        mesesAmortizacion: mesesNum,
        activa,
      })
      onClose()
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.code === 'DUPLICATE_NAME') {
        setErrors({ nombre: 'Ya existe una máquina con ese nombre' })
      } else {
        setErrors({ form: 'Error al guardar. Intentá de nuevo.' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {maquina ? 'Editar máquina' : 'Nueva máquina'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={e => { setNombre(e.target.value); clearFieldError('nombre') }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Capacidad X (mm)', value: capX, setter: setCapX, key: 'capX' },
              { label: 'Capacidad Y (mm)', value: capY, setter: setCapY, key: 'capY' },
              { label: 'Capacidad Z (mm)', value: capZ, setter: setCapZ, key: 'capZ' },
            ].map(({ label, value, setter, key }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={value}
                  onChange={e => { setter(e.target.value); clearFieldError(key) }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
                {errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Costo (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={costo}
              onChange={e => { setCosto(e.target.value); clearFieldError('costo') }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            {errors.costo && <p className="mt-1 text-xs text-red-600">{errors.costo}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Meses de amortización</label>
            <input
              type="number"
              step="1"
              min="1"
              value={meses}
              onChange={e => { setMeses(e.target.value); clearFieldError('meses') }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            {errors.meses && <p className="mt-1 text-xs text-red-600">{errors.meses}</p>}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="maquina-activa"
              checked={activa}
              onChange={e => setActiva(e.target.checked)}
              className="w-4 h-4 accent-violet-600"
            />
            <label htmlFor="maquina-activa" className="text-sm text-gray-700">Máquina activa</label>
          </div>

          {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
