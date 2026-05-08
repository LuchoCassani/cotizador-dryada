import { useEffect, useState } from 'react'
import { IconFlask, IconStack2, IconNotes, IconArrowLeft, IconCalculator, IconLoader2, IconFileCheck } from '@tabler/icons-react'
import { getMaterials, createQuote } from '../../services/api'
import type { Material, UploadResult, CotizacionResult, Complejidad } from '../../types'

interface Props {
  uploadResult: UploadResult
  empleado: string
  onQuote: (result: CotizacionResult) => void
  onBack: () => void
}

function BadgeComplejidad({ complejidad }: { complejidad: Complejidad }) {
  const styles: Record<Complejidad, string> = {
    simple:   'bg-dryada-violet-tint text-[#5A2A8F]',
    moderada: 'bg-[#FFF3E0] text-[#92400E]',
    compleja: 'bg-dryada-orange-tint text-[#7A2A0A]',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[complejidad]}`}>
      {complejidad.charAt(0).toUpperCase() + complejidad.slice(1)}
    </span>
  )
}

export function PasoCotizar({ uploadResult, empleado, onQuote, onBack }: Props) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [materialId, setMaterialId] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [observaciones, setObservaciones] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMaterials().then(list => {
      setMaterials(list)
      if (list.length > 0) setMaterialId(list[0].id)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await createQuote({
        uploadId: uploadResult.uploadId,
        materialId,
        cantidad,
        empleadoId: empleado,
        observaciones: observaciones.trim() || undefined,
      })
      onQuote(result)
    } catch (err: unknown) {
      const msg = (err as { error?: string })?.error ?? 'Error al calcular la cotización'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 p-6 md:p-8">
      <div className="max-w-[480px]">
        <p className="text-[15px] font-medium text-dryada-gray-900 mb-1">Configurar cotización</p>
        <p className="text-[12px] text-dryada-gray-400 mb-5 flex items-center gap-1.5 flex-wrap">
          <IconFileCheck size={12} className="text-dryada-violet" aria-hidden />
          {uploadResult.volumenCm3.toFixed(2)} cm³
          <span>·</span>
          <BadgeComplejidad complejidad={uploadResult.complejidad} />
        </p>

        <form onSubmit={handleSubmit}>
          <div className="bg-white border border-dryada-gray-100 rounded-xl p-5 mb-4 flex flex-col gap-4">
            {/* Material */}
            <div>
              <label htmlFor="material-sel" className="block text-[12px] font-medium text-dryada-gray-700 mb-1.5 flex items-center gap-1">
                <IconFlask size={13} aria-hidden />
                Material
              </label>
              <select
                id="material-sel"
                value={materialId}
                onChange={e => setMaterialId(e.target.value)}
                className="w-full border border-dryada-gray-100 rounded-lg px-3 py-2 text-[14px] text-dryada-gray-900 bg-white focus:outline-none focus:border-dryada-violet focus:ring-2 focus:ring-dryada-violet/10"
              >
                {materials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} — ${m.precioGramo.toFixed(2)} / g · densidad {m.densidad}
                  </option>
                ))}
              </select>
            </div>

            {/* Cantidad + parámetros fijos */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="cantidad" className="block text-[12px] font-medium text-dryada-gray-700 mb-1.5 flex items-center gap-1">
                  <IconStack2 size={13} aria-hidden />
                  Cantidad
                </label>
                <input
                  id="cantidad"
                  type="number"
                  min={1}
                  max={9999}
                  value={cantidad}
                  onChange={e => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full max-w-[100px] border border-dryada-gray-100 rounded-lg px-3 py-2 text-[14px] text-dryada-gray-900 bg-white focus:outline-none focus:border-dryada-violet focus:ring-2 focus:ring-dryada-violet/10"
                />
              </div>
              <div className="flex-[2]">
                <p className="text-[12px] font-medium text-dryada-gray-700 mb-1.5">Parámetros fijos (N1)</p>
                <p className="text-[12px] text-dryada-gray-400 py-2">10% relleno · 2 perímetros · nozzle 0.4 mm</p>
              </div>
            </div>

            {/* Observaciones */}
            <div>
              <label htmlFor="observaciones" className="block text-[12px] font-medium text-dryada-gray-700 mb-1.5 flex items-center gap-1.5">
                <IconNotes size={13} aria-hidden />
                Observaciones
                <span className="font-normal text-dryada-gray-400">(opcional)</span>
              </label>
              <textarea
                id="observaciones"
                rows={3}
                maxLength={500}
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                placeholder="Ej: cliente necesita entrega urgente"
                className="w-full border border-dryada-gray-100 rounded-lg px-3 py-2 text-[14px] text-dryada-gray-900 bg-white resize-vertical focus:outline-none focus:border-dryada-violet focus:ring-2 focus:ring-dryada-violet/10"
              />
            </div>
          </div>

          {error && (
            <p className="text-[13px] text-[#991B1B] bg-[#FEF2F2] border border-[#FEE2E2] rounded-lg px-4 py-3 mb-4">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 border border-dryada-violet text-dryada-violet rounded-lg px-5 py-2.5 text-[14px] font-medium hover:bg-dryada-violet-tint transition-colors"
            >
              <IconArrowLeft size={15} aria-hidden />
              Volver
            </button>
            <button
              type="submit"
              disabled={loading || !materialId}
              className="inline-flex items-center gap-1.5 bg-dryada-violet text-white rounded-lg px-5 py-2.5 text-[14px] font-medium hover:bg-[#5A2A8F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? <><IconLoader2 size={15} className="animate-spin" aria-hidden />Calculando...</>
                : <><IconCalculator size={15} aria-hidden />Calcular cotización</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
