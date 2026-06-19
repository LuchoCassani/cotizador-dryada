import { useState } from 'react'
import type { MaterialAdmin, ApiError } from '../../types'

interface Props {
  material?: MaterialAdmin
  onSave: (data: Omit<MaterialAdmin, 'id' | 'creadaAt' | 'actualizadaAt'>) => Promise<void>
  onClose: () => void
}

export function MaterialModal({ material, onSave, onClose }: Props) {
  const [nombre, setNombre] = useState(material?.nombre ?? '')
  const [precio, setPrecio] = useState(material?.precioPorCartucho750gEUR?.toString() ?? '')
  const [densidad, setDensidad] = useState(material?.densidadGCm3?.toString() ?? '')
  const [activo, setActivo] = useState(material?.activo ?? true)
  const [errors, setErrors] = useState<{ nombre?: string; precio?: string; densidad?: string; form?: string }>({})
  const [saving, setSaving] = useState(false)

  function clearFieldError(field: keyof typeof errors) {
    setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: typeof errors = {}

    if (!nombre.trim()) newErrors.nombre = 'El nombre es requerido'
    const precioNum = parseFloat(precio)
    if (isNaN(precioNum) || precioNum <= 0) newErrors.precio = 'El precio debe ser mayor a 0'
    const densidadNum = parseFloat(densidad)
    if (isNaN(densidadNum) || densidadNum <= 0) newErrors.densidad = 'La densidad debe ser mayor a 0'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSaving(true)
    try {
      await onSave({ nombre: nombre.trim(), precioPorCartucho750gEUR: precioNum, densidadGCm3: densidadNum, activo })
      onClose()
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.code === 'DUPLICATE_NAME') {
        setErrors({ nombre: 'Ya existe un material con ese nombre' })
      } else {
        setErrors({ form: 'Error al guardar. Intentá de nuevo.' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {material ? 'Editar material' : 'Nuevo material'}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio por cartucho 750g (EUR)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={precio}
              onChange={e => { setPrecio(e.target.value); clearFieldError('precio') }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            {errors.precio && <p className="mt-1 text-xs text-red-600">{errors.precio}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Densidad (g/cm³)</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={densidad}
              onChange={e => { setDensidad(e.target.value); clearFieldError('densidad') }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            {errors.densidad && <p className="mt-1 text-xs text-red-600">{errors.densidad}</p>}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="material-activo"
              checked={activo}
              onChange={e => setActivo(e.target.checked)}
              className="w-4 h-4 accent-violet-600"
            />
            <label htmlFor="material-activo" className="text-sm text-gray-700">Material activo</label>
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
