import { IconUser, IconSettings } from '@tabler/icons-react'

interface Props {
  empleado: string
  onAdminClick?: () => void
}

export function Topbar({ empleado, onAdminClick }: Props) {
  return (
    <header className="bg-white border-b border-dryada-gray-100 px-6 h-[52px] flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[17px] font-medium text-dryada-violet tracking-tight">DRY</span>
        <span className="text-[17px] font-light text-dryada-gray-400">/</span>
        <span className="text-[17px] font-medium text-dryada-orange tracking-tight">ADA</span>
        <span className="text-[11px] text-dryada-gray-400 ml-0.5">Cotizador 3D</span>
      </div>

      <div className="flex items-center gap-3">
        {empleado && (
          <div className="flex items-center gap-1.5 text-[12px] text-dryada-gray-400">
            <IconUser size={14} aria-hidden />
            <span className="text-dryada-gray-700">{empleado}</span>
          </div>
        )}
        {onAdminClick && (
          <button
            onClick={onAdminClick}
            title="Panel de administración"
            className="flex items-center gap-1 text-[12px] text-dryada-gray-400 hover:text-dryada-gray-700 transition-colors"
          >
            <IconSettings size={14} aria-hidden />
            <span>Admin</span>
          </button>
        )}
      </div>
    </header>
  )
}
