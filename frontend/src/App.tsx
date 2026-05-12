import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { Topbar } from './components/layout/Topbar'
import { AccentBar } from './components/layout/AccentBar'
import { StepsBar } from './components/layout/StepsBar'
import { PantallaInicio } from './components/screens/PantallaInicio'
import { PasoSubirSTL } from './components/screens/PasoSubirSTL'
import { PasoCotizar } from './components/screens/PasoCotizar'
import { PasoResultado } from './components/screens/PasoResultado'
import { CotizacionPDF } from './components/pdf/CotizacionPDF'
import { numeroCotizacion } from './utils/format'
import type { Step, UploadResult, CotizacionResult } from './types'
import './App.css'

export default function App() {
  const [step, setStep] = useState<Step>(0)
  const [empleado, setEmpleado] = useState('')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [stlFile, setStlFile] = useState<File | null>(null)
  const [quoteResult, setQuoteResult] = useState<CotizacionResult | null>(null)
  const [observaciones, setObservaciones] = useState('')

  function handleStart(nombre: string) {
    setEmpleado(nombre)
    setStep(1)
  }

  function handleAnalysis(result: UploadResult, file: File) {
    setUploadResult(result)
    setStlFile(file)
    setStep(2)
  }

  function handleQuote(result: CotizacionResult, obs: string) {
    setQuoteResult(result)
    setObservaciones(obs)
    setStep(3)
  }

  function buildPdfElement() {
    return (
      <CotizacionPDF
        quoteResult={quoteResult!}
        uploadResult={uploadResult!}
        empleado={empleado}
        stlFileName={stlFile?.name ?? ''}
        observaciones={observaciones || undefined}
      />
    )
  }

  async function handleGeneratePdf(): Promise<string> {
    const blob = await pdf(buildPdfElement()).toBlob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  async function handleDownloadPdf(): Promise<void> {
    const blob = await pdf(buildPdfElement()).toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cotizacion-dryada-${numeroCotizacion(quoteResult!.id)}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-dryada-gray-50 flex flex-col">
      <div className="max-w-[1280px] w-full mx-auto flex flex-col min-h-screen bg-white border-x border-dryada-gray-100">
        <Topbar empleado={empleado} />
        <AccentBar />
        <StepsBar step={step} />

        <main className="flex-1 flex flex-col">
          {step === 0 && (
            <PantallaInicio onStart={handleStart} />
          )}
          {step === 1 && (
            <PasoSubirSTL onAnalysis={handleAnalysis} />
          )}
          {step === 2 && uploadResult && (
            <PasoCotizar
              uploadResult={uploadResult}
              empleado={empleado}
              onQuote={handleQuote}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && quoteResult && (
            <PasoResultado
              result={quoteResult}
              empleado={empleado}
              onBack={() => setStep(2)}
              onGeneratePdf={handleGeneratePdf}
              onDownloadPdf={handleDownloadPdf}
            />
          )}
        </main>
      </div>
    </div>
  )
}
