import { useState } from 'react'
import { Topbar } from './components/layout/Topbar'
import { AccentBar } from './components/layout/AccentBar'
import { StepsBar } from './components/layout/StepsBar'
import { PantallaInicio } from './components/screens/PantallaInicio'
import { PasoSubirSTL } from './components/screens/PasoSubirSTL'
import { PasoCotizar } from './components/screens/PasoCotizar'
import { PasoResultado } from './components/screens/PasoResultado'
import type { Step, UploadResult, CotizacionResult } from './types'
import './App.css'

export default function App() {
  const [step, setStep] = useState<Step>(0)
  const [empleado, setEmpleado] = useState('')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [_stlFile, setStlFile] = useState<File | null>(null)
  const [quoteResult, setQuoteResult] = useState<CotizacionResult | null>(null)

  function handleStart(nombre: string) {
    setEmpleado(nombre)
    setStep(1)
  }

  function handleAnalysis(result: UploadResult, file: File) {
    setUploadResult(result)
    setStlFile(file)
    setStep(2)
  }

  function handleQuote(result: CotizacionResult) {
    setQuoteResult(result)
    setStep(3)
  }

  // El PDF se genera en PasoResultado con @react-pdf/renderer — se pasa como callback
  async function handleGeneratePdf(): Promise<string> {
    // TODO F3-T6: implementar con @react-pdf/renderer y retornar base64
    return ''
  }

  function handleDownloadPdf() {
    // TODO F3-T6: implementar descarga directa desde el browser
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
