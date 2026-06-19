import { useState, useEffect } from 'react'
import type { MaquinaAdmin, ApiError } from '../../types'
import { adminGetMachines, adminCreateMachine, adminUpdateMachine, adminDeleteMachine } from '../../services/api'
import { MaquinaModal } from './MaquinaModal'

interface Props {
  onSessionExpired: () => void
}

export function TabMaquinas({ onSessionExpired }: Props) {
  const [machines, setMachines] = useState<MaquinaAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MaquinaAdmin | undefined>(undefined)

  useEffect(() => {
    adminGetMachines()
      .then(data => setMachines(data))
      .catch(err => {
        if ((err as ApiError).code === 'SESSION_EXPIRED') onSessionExpired()
      })
      .finally(() => setLoading(false))
  }, [onSessionExpired])

  function openCreate() {
    setEditing(undefined)
    setModalOpen(true)
  }

  function openEdit(machine: MaquinaAdmin) {
    setEditing(machine)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(undefined)
  }

  async function handleSave(data: Omit<MaquinaAdmin, 'id' | 'creadaAt'>): Promise<void> {
    if (editing) {
      const updated = await adminUpdateMachine(editing.id, data)
      setMachines(prev => prev.map(m => m.id === editing.id ? updated : m))
    } else {
      const created = await adminCreateMachine(data)
      setMachines(prev => [...prev, created])
    }
  }

  async function handleToggle(machine: MaquinaAdmin) {
    const activeCount = machines.filter(m => m.activa).length
    const isLastActive = machine.activa && activeCount === 1

    const confirmMsg = isLastActive
      ? 'Atención: esta es la única máquina activa. El cotizador quedará sin máquinas disponibles.\n\n¿Desactivar igualmente?'
      : `¿${machine.activa ? 'Desactivar' : 'Activar'} "${machine.nombre}"?`

    if (!confirm(confirmMsg)) return

    try {
      if (machine.activa) {
        await adminDeleteMachine(machine.id)
        setMachines(prev => prev.map(m => m.id === machine.id ? { ...m, activa: false } : m))
      } else {
        const updated = await adminUpdateMachine(machine.id, { activa: true })
        setMachines(prev => prev.map(m => m.id === machine.id ? updated : m))
      }
    } catch (err) {
      if ((err as ApiError).code === 'SESSION_EXPIRED') onSessionExpired()
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500 py-8 text-center">Cargando máquinas…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={openCreate}
          className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          + Agregar máquina
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="pb-2 pr-4 font-semibold text-gray-600">Nombre</th>
              <th className="pb-2 pr-4 font-semibold text-gray-600">Capacidad</th>
              <th className="pb-2 pr-4 font-semibold text-gray-600">Costo (USD)</th>
              <th className="pb-2 pr-4 font-semibold text-gray-600">Amortización</th>
              <th className="pb-2 pr-4 font-semibold text-gray-600">Estado</th>
              <th className="pb-2 font-semibold text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {machines.map(m => (
              <tr key={m.id}>
                <td className="py-3 pr-4 font-medium text-gray-900">{m.nombre}</td>
                <td className="py-3 pr-4 text-gray-700">{m.capacidadXmm}×{m.capacidadYmm}×{m.capacidadZmm} mm</td>
                <td className="py-3 pr-4 text-gray-700">{m.costoUsd.toLocaleString('es-AR')}</td>
                <td className="py-3 pr-4 text-gray-700">{m.mesesAmortizacion} meses</td>
                <td className="py-3 pr-4">
                  {m.activa
                    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Activa</span>
                    : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactiva</span>
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
                    {m.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <MaquinaModal
          maquina={editing}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
