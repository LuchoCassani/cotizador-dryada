import { useState } from 'react'
import { TabMateriales } from '../admin/TabMateriales'
import { TabMaquinas } from '../admin/TabMaquinas'
import { TabParametros } from '../admin/TabParametros'
import { TabSeguridad } from '../admin/TabSeguridad'

type Tab = 'materiales' | 'maquinas' | 'parametros' | 'seguridad'

const TABS: { id: Tab; label: string }[] = [
  { id: 'materiales', label: 'Materiales' },
  { id: 'maquinas', label: 'Máquinas' },
  { id: 'parametros', label: 'Parámetros' },
  { id: 'seguridad', label: 'Seguridad' },
]

interface Props {
  onBack: () => void
  onSessionExpired: () => void
}

export function PanelAdmin({ onBack, onSessionExpired }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('materiales')

  function handleCerrarSesion() {
    sessionStorage.removeItem('admin_token')
    onSessionExpired()
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Volver al cotizador
          </button>
          <h1 className="text-base font-semibold text-gray-900">Panel de administración</h1>
        </div>
        <button
          onClick={handleCerrarSesion}
          className="text-sm text-red-600 hover:text-red-800 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>

      <div className="border-b border-gray-200 px-6">
        <nav className="flex">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-violet-600 text-violet-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'materiales' && <TabMateriales onSessionExpired={onSessionExpired} />}
        {activeTab === 'maquinas' && <TabMaquinas onSessionExpired={onSessionExpired} />}
        {activeTab === 'parametros' && <TabParametros onSessionExpired={onSessionExpired} />}
        {activeTab === 'seguridad' && <TabSeguridad onSessionExpired={onSessionExpired} />}
      </div>
    </div>
  )
}
