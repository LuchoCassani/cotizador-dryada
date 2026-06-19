import { useState, useEffect } from 'react'
import type { ParametrosGlobales, ApiError } from '../../types'
import { adminGetParams, adminUpdateParams } from '../../services/api'

interface Props {
  onSessionExpired: () => void
}

type FormValues = Record<string, string>
type FieldErrors = Record<string, string>

const FIELDS: { key: keyof Omit<ParametrosGlobales, 'actualizadaAt'>; label: string; group: string }[] = [
  { key: 'tasaEurUsd', label: 'Tasa EUR → USD', group: 'Tasas de cambio' },
  { key: 'tasaArsUsd', label: 'Tasa ARS → USD', group: 'Tasas de cambio' },
  { key: 'tarifaManoObraUsdHora', label: 'Tarifa mano de obra (USD/h)', group: 'Mano de obra' },
  { key: 'horasPorPieza', label: 'Horas por pieza', group: 'Mano de obra' },
  { key: 'desperdicioPct', label: 'Desperdicio (%)', group: 'Costos y ganancia' },
  { key: 'costosAdicionalesUsd', label: 'Costos adicionales (USD)', group: 'Costos y ganancia' },
  { key: 'coeficienteGanancia', label: 'Coeficiente de ganancia', group: 'Costos y ganancia' },
  { key: 'piezasPorDiaEstimadas', label: 'Piezas por día estimadas', group: 'Costos y ganancia' },
]

const GROUPS = ['Tasas de cambio', 'Mano de obra', 'Costos y ganancia']

function paramsToForm(p: ParametrosGlobales): FormValues {
  return Object.fromEntries(FIELDS.map(f => [f.key, p[f.key].toString()]))
}

export function TabParametros({ onSessionExpired }: Props) {
  const [original, setOriginal] = useState<ParametrosGlobales | null>(null)
  const [form, setForm] = useState<FormValues>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    adminGetParams()
      .then(data => {
        setOriginal(data)
        setForm(paramsToForm(data))
      })
      .catch(err => {
        if ((err as ApiError).code === 'SESSION_EXPIRED') onSessionExpired()
      })
  }, [onSessionExpired])

  function handleChange(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => { const next = { ...prev }; delete next[key]; return next })
    setSaved(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: FieldErrors = {}

    for (const { key } of FIELDS) {
      const num = parseFloat(form[key] ?? '')
      if (isNaN(num)) {
        newErrors[key] = 'Valor inválido'
      } else if (key === 'desperdicioPct') {
        if (num < 0 || num > 100) newErrors[key] = 'Debe estar entre 0 y 100'
      } else if (num <= 0) {
        newErrors[key] = 'Debe ser mayor a 0'
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const changed = FIELDS.reduce<Partial<Omit<ParametrosGlobales, 'actualizadaAt'>>>((acc, { key }) => {
      const num = parseFloat(form[key])
      if (original && num !== original[key]) acc[key] = num as never
      return acc
    }, {})

    if (Object.keys(changed).length === 0) {
      setSaved(true)
      return
    }

    setSaving(true)
    try {
      const updated = await adminUpdateParams(changed)
      setOriginal(updated)
      setForm(paramsToForm(updated))
      setSaved(true)
    } catch (err) {
      if ((err as ApiError).code === 'SESSION_EXPIRED') onSessionExpired()
    } finally {
      setSaving(false)
    }
  }

  if (!original) {
    return <p className="text-sm text-gray-500 py-8 text-center">Cargando parámetros…</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {GROUPS.map(group => (
        <div key={group}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{group}</h3>
          <div className="space-y-3">
            {FIELDS.filter(f => f.group === group).map(({ key, label }) => (
              <div key={key} className="flex items-center gap-4">
                <label className="text-sm text-gray-700 w-56 shrink-0">{label}</label>
                <div className="flex-1">
                  <input
                    type="number"
                    step="any"
                    value={form[key] ?? ''}
                    onChange={e => handleChange(key, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                  {errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {original.actualizadaAt && (
        <p className="text-xs text-gray-400">
          Última actualización: {new Date(original.actualizadaAt).toLocaleString('es-AR')}
        </p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium py-2 px-6 rounded-lg transition-colors"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {saved && <p className="text-sm text-green-600 font-medium">Cambios guardados</p>}
      </div>
    </form>
  )
}
