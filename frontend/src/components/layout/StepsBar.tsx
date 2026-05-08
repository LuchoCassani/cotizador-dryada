import { IconCheck } from '@tabler/icons-react'
import type { Step } from '../../types'

const PASOS = ['Subir STL', 'Cotización', 'Resultado'] as const

interface Props {
  step: Step
}

export function StepsBar({ step }: Props) {
  if (step === 0) return null

  return (
    <div className="bg-white border-b border-dryada-gray-100 px-6 h-11 flex items-center gap-0 flex-shrink-0">
      {PASOS.map((label, i) => {
        const num = i + 1
        const done = step > num
        const active = step === num

        return (
          <div key={label} className="flex items-center">
            <div className={`flex items-center gap-1.5 text-[12px] ${done ? 'text-dryada-gray-700' : active ? 'text-dryada-violet' : 'text-dryada-gray-400'}`}>
              <div className={`
                w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-medium flex-shrink-0
                ${done ? 'border-dryada-violet bg-dryada-violet text-white' : ''}
                ${active ? 'border-dryada-violet bg-dryada-violet-tint text-dryada-violet' : ''}
                ${!done && !active ? 'border-dryada-gray-100 text-dryada-gray-400' : ''}
              `}>
                {done ? <IconCheck size={10} /> : num}
              </div>
              <span>{label}</span>
            </div>

            {i < PASOS.length - 1 && (
              <div className={`w-6 h-[1.5px] mx-3 ${step > num ? 'bg-dryada-violet' : 'bg-dryada-gray-100'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
