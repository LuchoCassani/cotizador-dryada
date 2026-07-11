import { useState, useEffect } from 'react'
import { pdf } from '@react-pdf/renderer'
import { Topbar } from './components/layout/Topbar'
import { AccentBar } from './components/layout/AccentBar'
import { StepsBar } from './components/layout/StepsBar'
import { PantallaInicio } from './components/screens/PantallaInicio'
import { PasoSubirSTL } from './components/screens/PasoSubirSTL'
import { PasoCotizar } from './components/screens/PasoCotizar'
import { PasoResultado } from './components/screens/PasoResultado'
import { AdminLogin } from './components/screens/AdminLogin'
import { PanelAdmin } from './components/screens/PanelAdmin'
import { CotizadorLogin } from './components/screens/CotizadorLogin'
import { CotizacionPDF } from './components/pdf/CotizacionPDF'
import { numeroCotizacion } from './utils/format'
import { getCotizadorAuthStatus, cotizadorLogin } from './services/api'
import type { Step, UploadResult, CotizacionResult } from './types'
import './App.css'

export default function App() {
  const [mode, setMode] = useState<'cotizacion' | 'admin'>('cotizacion')
  const [adminAuthenticated, setAdminAuthenticated] = useState(() => !!sessionStorage.getItem('admin_token'))
  // null = verificando, false = requiere login, true = autenticado
  const [cotizadorAuthenticated, setCotizadorAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    getCotizadorAuthStatus()
      .then(({ requiresPassword }) => {
        if (!requiresPassword) {
          // COTIZADOR_AUTH_DISABLED=true: acceso abierto, opt-in explícito del operador
          cotizadorLogin('').then(({ token }) => {
            sessionStorage.setItem('cotizador_auth', JSON.stringify({ token, passwordRequired: false }))
            setCotizadorAuthenticated(true)
          }).catch(() => setCotizadorAuthenticated(false))
        } else {
          // Verificar si la sesión guardada fue obtenida con password (no un token stale)
          try {
            const stored = JSON.parse(sessionStorage.getItem('cotizador_auth') ?? '{}')
            if (stored.passwordRequired === true && stored.token) {
              setCotizadorAuthenticated(true)
              return
            }
          } catch { /* malformed */ }
          // Token inexistente o stale (emitido sin password) — limpiar y pedir login
          sessionStorage.removeItem('cotizador_auth')
          sessionStorage.removeItem('cotizador_token')
          setCotizadorAuthenticated(false)
        }
      })
      .catch(() => setCotizadorAuthenticated(false))
  }, [])
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

  function handleNuevaCotizacion() {
    setUploadResult(null)
    setStlFile(null)
    setQuoteResult(null)
    setObservaciones('')
    setStep(1)
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
        <Topbar empleado={empleado} onAdminClick={() => setMode('admin')} />
        <AccentBar />
        {mode === 'cotizacion' && <StepsBar step={step} />}

        <main className="flex-1 flex flex-col">
          {mode === 'admin' ? (
            adminAuthenticated ? (
              <PanelAdmin
                onBack={() => setMode('cotizacion')}
                onSessionExpired={() => setAdminAuthenticated(false)}
              />
            ) : (
              <AdminLogin onLogin={() => setAdminAuthenticated(true)} onBack={() => setMode('cotizacion')} />
            )
          ) : cotizadorAuthenticated === null ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Cargando…</div>
          ) : !cotizadorAuthenticated ? (
            <CotizadorLogin onLogin={() => setCotizadorAuthenticated(true)} />
          ) : (
            <>
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
                  onNuevaCotizacion={handleNuevaCotizacion}
                  onGeneratePdf={handleGeneratePdf}
                  onDownloadPdf={handleDownloadPdf}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
