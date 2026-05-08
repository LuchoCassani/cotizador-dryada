import { useRef, useState } from 'react'
import { IconUpload, IconFile, IconFileCheck, IconArrowRight, IconAlertTriangle, IconLoader2 } from '@tabler/icons-react'
import { ModelViewer } from '../viewer/ModelViewer'
import { uploadStl } from '../../services/api'
import type { UploadResult, Complejidad } from '../../types'

const MAX_MB = 50

interface Props {
  onAnalysis: (result: UploadResult, file: File) => void
}

function BadgeComplejidad({ complejidad }: { complejidad: Complejidad }) {
  const styles: Record<Complejidad, string> = {
    simple:   'bg-dryada-violet-tint text-[#5A2A8F]',
    moderada: 'bg-[#FFF3E0] text-[#92400E]',
    compleja: 'bg-dryada-orange-tint text-[#7A2A0A]',
  }
  const labels: Record<Complejidad, string> = {
    simple: 'Simple',
    moderada: 'Moderada',
    compleja: 'Compleja',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${styles[complejidad]}`}>
      {labels[complejidad]}
    </span>
  )
}

export function PasoSubirSTL({ onAnalysis }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(f: File) {
    if (!f.name.toLowerCase().endsWith('.stl')) {
      setError('Solo se aceptan archivos .stl')
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera el límite de ${MAX_MB} MB`)
      return
    }

    setError(null)
    setLoading(true)
    setFile(f)
    try {
      const analysis = await uploadStl(f)
      setResult(analysis)
    } catch (err: unknown) {
      const msg = (err as { error?: string })?.error ?? 'Error al procesar el archivo'
      setError(msg)
      setFile(null)
    } finally {
      setLoading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) processFile(f)
  }

  return (
    <div className="flex-1 p-6 md:p-8">
      <div className="flex gap-5 items-start">
        {/* Columna izquierda: dropzone + resultado */}
        <div className="flex-[1.1] min-w-0">
          <p className="text-[15px] font-medium text-dryada-gray-900 mb-1">Subir modelo STL</p>
          <p className="text-[12px] text-dryada-gray-400 mb-4">Arrastrá el archivo o hacé click para seleccionar</p>

          {!result && !loading && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-[1.5px] border-dashed rounded-xl p-10 text-center transition-colors ${
                dragOver
                  ? 'border-dryada-violet bg-dryada-violet-tint'
                  : 'border-dryada-gray-100 bg-dryada-gray-50'
              }`}
            >
              <IconUpload size={32} className="text-dryada-gray-400 mx-auto mb-3" aria-hidden />
              <p className="text-[14px] text-dryada-gray-700 mb-1">Arrastrá tu archivo .STL acá</p>
              <p className="text-[12px] text-dryada-gray-400 mb-4">Máximo {MAX_MB} MB · solo archivos .stl</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 border border-dryada-violet text-dryada-violet rounded-lg px-5 py-2 text-[14px] font-medium hover:bg-dryada-violet-tint transition-colors"
              >
                <IconFile size={15} aria-hidden />
                Seleccionar archivo
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".stl"
                className="hidden"
                onChange={handleChange}
              />
            </div>
          )}

          {loading && (
            <div className="border-[1.5px] border-dryada-violet-light bg-dryada-violet-tint rounded-xl p-10 text-center">
              <IconLoader2 size={28} className="text-dryada-violet mx-auto mb-2 animate-spin" aria-hidden />
              <p className="text-[13px] text-dryada-violet">Analizando modelo...</p>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 bg-[#FEF2F2] border border-[#FEE2E2] rounded-lg px-4 py-3 text-[13px] text-[#991B1B]">
              <IconAlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && file && (
            <div className="mt-0 bg-white border border-dryada-gray-100 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <IconFileCheck size={16} className="text-dryada-violet" aria-hidden />
                  <span className="text-[13px] font-medium text-dryada-gray-900">{file.name}</span>
                </div>
                <BadgeComplejidad complejidad={result.complejidad} />
              </div>

              {result.advertencias.includes('unidades_probables_pulgadas') && (
                <div className="mb-3 flex items-start gap-2 bg-[#FFFBEB] border border-[#FEF3C7] rounded-lg px-3 py-2 text-[12px] text-[#92400E]">
                  <IconAlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>El modelo parece estar en pulgadas. Verificá las dimensiones antes de cotizar.</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-dryada-gray-50 rounded-lg p-3.5">
                  <p className="text-[11px] text-dryada-gray-400 mb-1">Volumen</p>
                  <p className="text-[18px] font-medium text-dryada-violet font-mono">{result.volumenCm3.toFixed(2)} cm³</p>
                </div>
                <div className="bg-dryada-gray-50 rounded-lg p-3.5">
                  <p className="text-[11px] text-dryada-gray-400 mb-1">Área sup.</p>
                  <p className="text-[18px] font-medium text-dryada-gray-700 font-mono">{result.areaCm2.toFixed(1)} cm²</p>
                </div>
                <div className="bg-dryada-gray-50 rounded-lg p-3.5">
                  <p className="text-[11px] text-dryada-gray-400 mb-1">Bounding box</p>
                  <p className="text-[13px] font-medium text-dryada-gray-700 font-mono leading-tight mt-1">
                    {result.boundingBox.x.toFixed(0)}×{result.boundingBox.y.toFixed(0)}×{result.boundingBox.z.toFixed(0)} mm
                  </p>
                </div>
              </div>

              <div className="mt-3 text-right">
                <button
                  type="button"
                  onClick={() => onAnalysis(result, file)}
                  className="inline-flex items-center gap-1.5 bg-dryada-violet text-white rounded-lg px-5 py-2.5 text-[14px] font-medium hover:bg-[#5A2A8F] transition-colors"
                >
                  Configurar cotización
                  <IconArrowRight size={15} aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Columna derecha: visor 3D */}
        <div className="flex-[0.9] min-w-0">
          <p className="text-[12px] font-medium text-dryada-gray-700 mb-2">Vista previa 3D</p>
          <div className="h-[220px]">
            <ModelViewer file={file} />
          </div>
        </div>
      </div>
    </div>
  )
}
