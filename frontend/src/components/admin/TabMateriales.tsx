import { useState, useEffect } from 'react'
import type { MaterialAdmin, ApiError } from '../../types'
import { adminGetMaterials, adminCreateMaterial, adminUpdateMaterial, adminDeleteMaterial } from '../../services/api'
import { MaterialModal } from './MaterialModal'

interface Props {
  onSessionExpired: () => void
}

export function TabMateriales({ onSessionExpired }: Props) {
  const [materials, setMaterials] = useState<MaterialAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MaterialAdmin | undefined>(undefined)

  useEffect(() => {
    adminGetMaterials()
      .then(data => setMaterials(data))
      .catch(err => {
        if ((err as ApiError).code === 'SESSION_EXPIRED') onSessionExpired()
      })
      .finally(() => setLoading(false))
  }, [onSessionExpired])

  function openCreate() {
    setEditing(undefined)
    setModalOpen(true)
  }

  function openEdit(material: MaterialAdmin) {
    setEditing(material)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(undefined)
  }

  async function handleSave(data: Omit<MaterialAdmin, 'id' | 'creadaAt' | 'actualizadaAt'>): Promise<void> {
    if (editing) {
      const updated = await adminUpdateMaterial(editing.id, data)
      setMaterials(prev => prev.map(m => m.id === editing.id ? updated : m))
    } else {
      const created = await adminCreateMaterial(data)
      setMaterials(prev => [...prev, created])
    }
  }

  async function handleToggle(material: MaterialAdmin) {
    const activeCount = materials.filter(m => m.activo).length
    const isLastActive = material.activo && activeCount === 1

    const confirmMsg = isLastActive
      ? 'Atención: este es el único material activo. El cotizador quedará sin materiales disponibles.\n\n¿Desactivar igualmente?'
      : `¿${material.activo ? 'Desactivar' : 'Activar'} "${material.nombre}"?`

    if (!confirm(confirmMsg)) return

    try {
      if (material.activo) {
        await adminDeleteMaterial(material.id)
        setMaterials(prev => prev.map(m => m.id === material.id ? { ...m, activo: false } : m))
      } else {
        const updated = await adminUpdateMaterial(material.id, { activo: true })
        setMaterials(prev => prev.map(m => m.id === material.id ? updated : m))
      }
    } catch (err) {
      if ((err as ApiError).code === 'SESSION_EXPIRED') onSessionExpired()
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500 py-8 text-center">Cargando materiales…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={openCreate}
          className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          + Agregar material
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="pb-2 pr-4 font-semibold text-gray-600">Nombre</th>
              <th className="pb-2 pr-4 font-semibold text-gray-600">Precio (EUR)</th>
              <th className="pb-2 pr-4 font-semibold text-gray-600">Densidad (g/cm³)</th>
              <th className="pb-2 pr-4 font-semibold text-gray-600">Estado</th>
              <th className="pb-2 font-semibold text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {materials.map(m => (
              <tr key={m.id}>
                <td className="py-3 pr-4 font-medium text-gray-900">{m.nombre}</td>
                <td className="py-3 pr-4 text-gray-700">{m.precioPorCartucho750gEUR.toFixed(2)}</td>
                <td className="py-3 pr-4 text-gray-700">{m.densidadGCm3.toFixed(3)}</td>
                <td className="py-3 pr-4">
                  {m.activo
                    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Activo</span>
                    : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactivo</span>
                  }
                </td>
                <td className="py-3 flex gap-3">
                  <button
                    onClick={() => openEdit(m)}
                    className="text-violet-600 hover:text-violet-800 text-sm font-medium"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggle(m)}
                    className="text-gray-500 hover:text-gray-700 text-sm"
                  >
                    {m.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <MaterialModal
          material={editing}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
