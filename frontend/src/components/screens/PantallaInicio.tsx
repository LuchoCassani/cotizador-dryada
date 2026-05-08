import { useState } from 'react'
import { IconBox, IconUser, IconArrowRight } from '@tabler/icons-react'

interface Props {
  onStart: (empleado: string) => void
}

export function PantallaInicio({ onStart }: Props) {
  const [nombre, setNombre] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = nombre.trim()
    if (trimmed) onStart(trimmed)
  }

  return (
    <div className="flex-1 flex items-center justify-center py-10 px-6">
      <div className="w-full max-w-[360px] text-center">
        <div className="w-16 h-16 rounded-2xl bg-dryada-violet-tint flex items-center justify-center mx-auto mb-5">
          <IconBox size={28} className="text-dryada-violet" aria-hidden />
        </div>

        <p className="text-[22px] font-medium text-dryada-gray-900 mb-1.5">
          Cotizador Dryada
        </p>
        <p className="text-[14px] text-dryada-gray-400 mb-8">
          Ingresá tu nombre para comenzar
        </p>

        <form onSubmit={handleSubmit}>
          <div className="text-left mb-4">
            <label htmlFor="emp-name" className="block text-[12px] font-medium text-dryada-gray-700 mb-1.5 flex items-center gap-1">
              <IconUser size={13} aria-hidden />
              Tu nombre
            </label>
            <input
              id="emp-name"
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Ana López"
              className="w-full border border-dryada-gray-100 rounded-lg px-3 py-2 text-[14px] text-dryada-gray-900 bg-white focus:outline-none focus:border-dryada-violet focus:ring-2 focus:ring-dryada-violet/10"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={!nombre.trim()}
            className="w-full bg-dryada-violet text-white rounded-lg px-5 py-2.5 text-[14px] font-medium flex items-center justify-center gap-1.5 hover:bg-[#5A2A8F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <IconArrowRight size={16} aria-hidden />
            Comenzar cotización
          </button>
        </form>
      </div>
    </div>
  )
}
