import { useState } from 'react'
import { IconArrowLeft, IconFileDownload, IconSend, IconAlertTriangle, IconX, IconLoader2, IconCircleCheck, IconMail } from '@tabler/icons-react'
import { sendEmail } from '../../services/api'
import type { CotizacionResult, Complejidad } from '../../types'

interface Props {
  result: CotizacionResult
  empleado: string
  onBack: () => void
  onGeneratePdf: () => Promise<string>
  onDownloadPdf: () => void
}

function BadgeComplejidad({ complejidad }: { complejidad: Complejidad }) {
  const styles: Record<Complejidad, string> = {
    simple:   'bg-dryada-violet-tint text-[#5A2A8F]',
    moderada: 'bg-[#FFF3E0] text-[#92400E]',
    compleja: 'bg-dryada-orange-tint text-[#7A2A0A]',
  }
  const labels: Record<Complejidad, string> = {
    simple: 'Pieza simple',
    moderada: 'Pieza moderada',
    compleja: 'Pieza compleja — margen de error ±15%',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${styles[complejidad]}`}>
      {complejidad === 'compleja' && <IconAlertTriangle size={11} />}
      {labels[complejidad]}
    </span>
  )
}

function ModalEmail({ quoteId, onClose, onGeneratePdf }: {
  quoteId: string
  onClose: () => void
  onGeneratePdf: () => Promise<string>
}) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const pdfBase64 = await onGeneratePdf()
      await sendEmail(quoteId, email, pdfBase64)
      setEnviado(true)
    } catch (err: unknown) {
      const msg = (err as { error?: string })?.error ?? 'No se pudo enviar el email. Intentá de nuevo.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/35 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-[340px] border border-dryada-gray-100">
        {enviado ? (
          <div className="text-center py-4">
            <IconCircleCheck size={40} className="text-[#065F46] mx-auto mb-3" />
            <p className="text-[15px] font-medium text-dryada-gray-900 mb-1">Email enviado</p>
            <p className="text-[13px] text-dryada-gray-400 mb-5">La cotización fue enviada a {email}</p>
            <button onClick={onClose} className="bg-dryada-violet text-white rounded-lg px-5 py-2 text-[14px] font-medium hover:bg-[#5A2A8F] transition-colors">
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[15px] font-medium text-dryada-gray-900">Enviar cotización</p>
              <button onClick={onClose} className="text-dryada-gray-400 hover:text-dryada-gray-700 transition-colors" aria-label="Cerrar">
                <IconX size={18} />
              </button>
            </div>
            <p className="text-[12px] text-dryada-gray-400 mb-4">Se enviará el PDF de la cotización al destinatario.</p>

            <form onSubmit={handleEnviar}>
              <label htmlFor="email-dest" className="block text-[12px] font-medium text-dryada-gray-700 mb-1.5 flex items-center gap-1">
                <IconMail size={13} aria-hidden />
                Email del cliente
              </label>
              <input
                id="email-dest"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="cliente@empresa.com"
                className="w-full border border-dryada-gray-100 rounded-lg px-3 py-2 text-[14px] text-dryada-gray-900 bg-white focus:outline-none focus:border-dryada-violet focus:ring-2 focus:ring-dryada-violet/10 mb-4"
              />

              {error && (
                <p className="text-[12px] text-[#991B1B] bg-[#FEF2F2] rounded-lg px-3 py-2 mb-4">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-dryada-violet text-dryada-violet rounded-lg py-2 text-[14px] font-medium hover:bg-dryada-violet-tint transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-dryada-violet text-white rounded-lg py-2 text-[14px] font-medium hover:bg-[#5A2A8F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <IconLoader2 size={14} className="animate-spin" /> : <IconSend size={14} />}
                  Enviar
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function fmtUSD(value: number) {
  return `$${value.toFixed(2)}`
}

function fmtGramos(value: number) {
  return `${value.toFixed(2)} g`
}

function numeroCorto(id: string) {
  const year = new Date().getFullYear()
  const short = id.replace(/-/g, '').slice(0, 4).toUpperCase()
  return `DRY-${year}-${short}`
}

export function PasoResultado({ result, empleado, onBack, onGeneratePdf, onDownloadPdf }: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  const numero = numeroCorto(result.id)

  return (
    <div className="flex-1 p-6 md:p-8">
      {/* Banner complejidad compleja — siempre primero si aplica */}
      {result.complejidad === 'compleja' && (
        <div className="flex items-start gap-2 bg-dryada-orange-tint border border-[#F0A0C8] rounded-xl px-4 py-3 mb-5 text-[13px] text-[#7A2A0A]">
          <IconAlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Pieza compleja:</strong> la estimación puede tener un margen de error de hasta ±15%. Revisá con producción antes de confirmar al cliente.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2.5">
        <div>
          <p className="text-[15px] font-medium text-dryada-gray-900">Cotización {numero}</p>
          <p className="text-[12px] text-dryada-gray-400">
            {result.material.nombre} · {result.cantidad} {result.cantidad === 1 ? 'unidad' : 'unidades'}
          </p>
        </div>
        <BadgeComplejidad complejidad={result.complejidad} />
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
        <div className="bg-dryada-gray-50 rounded-lg p-3.5">
          <p className="text-[11px] text-dryada-gray-400 mb-1">Peso estimado</p>
          <p className="text-[22px] font-medium text-dryada-violet font-mono">{fmtGramos(result.gramosTotal)}</p>
        </div>
        <div className="bg-dryada-gray-50 rounded-lg p-3.5">
          <p className="text-[11px] text-dryada-gray-400 mb-1">Costo material</p>
          <p className="text-[18px] font-medium text-dryada-gray-700 font-mono">{fmtUSD(result.costoMaterialUSD)}</p>
        </div>
        <div className="bg-dryada-gray-50 rounded-lg p-3.5">
          <p className="text-[11px] text-dryada-gray-400 mb-1">Precio unitario</p>
          <p className="text-[18px] font-medium text-dryada-gray-700 font-mono">{fmtUSD(result.precioUnitarioUSD)}</p>
        </div>
        <div className="bg-dryada-orange-tint rounded-lg p-3.5">
          <p className="text-[11px] text-[#7A2A0A] mb-1">Precio final</p>
          <p className="text-[26px] font-medium text-dryada-orange font-mono">{fmtUSD(result.precioFinalUSD)}</p>
          <p className="text-[10px] text-[#7A2A0A] mt-0.5">USD · {result.cantidad} {result.cantidad === 1 ? 'unidad' : 'unidades'}</p>
        </div>
      </div>

      {/* Desglose */}
      <div className="bg-white border border-dryada-gray-100 rounded-xl p-5 mb-5">
        <p className="text-[12px] font-medium text-dryada-gray-700 mb-3">Desglose de cálculo</p>
        <table className="w-full text-[12px] border-collapse">
          {[
            ['Gramos infill (10%)', fmtGramos(result.gramosInfill)],
            ['Gramos paredes (2 × 0.4 mm)', fmtGramos(result.gramosParedes)],
            [`Peso total × ${result.material.nombre} $${result.material.precioGramo}/g`, fmtUSD(result.costoMaterialUSD)],
            ['Costo inicio de impresión', fmtUSD(result.costoInicioUSD)],
          ].map(([label, value]) => (
            <tr key={label} className="border-b border-dryada-gray-100">
              <td className="py-1.5 text-dryada-gray-400">{label}</td>
              <td className="py-1.5 text-right text-dryada-gray-700 font-mono">{value}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-2 font-medium text-dryada-gray-900">Precio unitario</td>
            <td className="pt-2 text-right font-medium text-dryada-gray-900 font-mono">{fmtUSD(result.precioUnitarioUSD)}</td>
          </tr>
        </table>
      </div>

      {/* Empleado */}
      <p className="text-[11px] text-dryada-gray-400 mb-5">
        Generado por <span className="text-dryada-gray-700">{empleado}</span> · {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
      </p>

      {/* Acciones */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 border border-dryada-violet text-dryada-violet rounded-lg px-5 py-2.5 text-[14px] font-medium hover:bg-dryada-violet-tint transition-colors"
        >
          <IconArrowLeft size={15} aria-hidden />
          Editar
        </button>
        <button
          type="button"
          onClick={onDownloadPdf}
          className="inline-flex items-center gap-1.5 bg-dryada-orange text-white rounded-lg px-5 py-2.5 text-[14px] font-medium hover:bg-[#C94E1F] transition-colors"
        >
          <IconFileDownload size={15} aria-hidden />
          Descargar PDF
        </button>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 bg-dryada-violet text-white rounded-lg px-5 py-2.5 text-[14px] font-medium hover:bg-[#5A2A8F] transition-colors"
        >
          <IconSend size={15} aria-hidden />
          Enviar por email
        </button>
      </div>

      {modalOpen && (
        <ModalEmail
          quoteId={result.id}
          onClose={() => setModalOpen(false)}
          onGeneratePdf={onGeneratePdf}
        />
      )}
    </div>
  )
}
