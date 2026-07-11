import { describe, it, expect, beforeEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { StlAnalysis } from '../../src/services/stl-processor'
import type { CotizacionInput, CotizacionResult } from '../../src/services/quote.service'

let _uploadCache: Map<string, StlAnalysis>
let _quoteService: { calcularCotizacion: ReturnType<typeof vi.fn> }

vi.mock('../../src/app', () => ({
  get uploadCache() { return _uploadCache },
  get quoteService() { return _quoteService },
}))

const { quoteRoute } = await import('../../src/routes/quote.route')

const STL_ANALYSIS: StlAnalysis = {
  uploadId: 'upload-1',
  volumenCm3: 8,
  areaCm2: 24,
  boundingBox: { x: 20, y: 20, z: 20 },
  complejidad: 'simple',
  advertencias: [],
}

const QUOTE_RESULT: CotizacionResult = {
  id: 'quote-1',
  gramosInfill: 1,
  gramosParedes: 2,
  gramosTotal: 3,
  costoMaterialUSD: 1,
  costoManoObraUSD: 1,
  costoAmortizacionUSD: 1,
  costoInicioUSD: 1,
  precioUnitarioUSD: 10,
  precioFinalUSD: 10,
  precioFinalARS: 15000,
  material: { id: 'mat-1', nombre: 'PLA', precioGramo: 0.5 },
  maquina: { id: 'maq-1', nombre: 'Máquina 1' },
  cantidad: 1,
  volumenCm3: 8,
  areaCm2: 24,
  complejidad: 'simple',
  advertencias: [],
  weightSource: 'prusaslicer',
}

const VALID_BODY = {
  uploadId: 'upload-1',
  materialId: 'mat-1',
  maquinaId: 'maq-1',
  cantidad: 1,
  empleadoId: 'empleado-1',
}

function parseSseEvents(body: string): unknown[] {
  return body
    .split('\n\n')
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.startsWith('data: '))
    .map(chunk => JSON.parse(chunk.slice(6)))
}

let app: FastifyInstance

beforeEach(async () => {
  _uploadCache = new Map()
  _quoteService = { calcularCotizacion: vi.fn() }
  app = Fastify({ logger: false })
  await app.register(quoteRoute)
  await app.ready()
})

describe('POST /api/quote', () => {
  it('uploadId inexistente en cache devuelve 404 UPLOAD_NOT_FOUND (respuesta JSON normal, no SSE)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/quote', payload: VALID_BODY })

    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/json')
    expect(JSON.parse(res.body).code).toBe('UPLOAD_NOT_FOUND')
    expect(_quoteService.calcularCotizacion).not.toHaveBeenCalled()
  })

  it('body inválido (falta empleadoId) devuelve 400 antes de tocar el cache', async () => {
    const { empleadoId: _empleadoId, ...bodySinEmpleado } = VALID_BODY
    const res = await app.inject({ method: 'POST', url: '/api/quote', payload: bodySinEmpleado })

    expect(res.statusCode).toBe(400)
  })

  it('caso éxito: responde con Content-Type text/event-stream y un evento done con el resultado', async () => {
    _uploadCache.set('upload-1', STL_ANALYSIS)
    _quoteService.calcularCotizacion.mockResolvedValue(QUOTE_RESULT)

    const res = await app.inject({ method: 'POST', url: '/api/quote', payload: VALID_BODY })

    expect(res.headers['content-type']).toBe('text/event-stream')
    const events = parseSseEvents(res.body)
    expect(events).toEqual([{ type: 'done', result: QUOTE_RESULT }])
  })

  it('emite eventos progress en orden antes del evento done', async () => {
    _uploadCache.set('upload-1', STL_ANALYSIS)
    _quoteService.calcularCotizacion.mockImplementation(async (input: CotizacionInput) => {
      input.onProgress?.(10, 'Processing triangulated mesh')
      input.onProgress?.(45, 'Making infill')
      return QUOTE_RESULT
    })

    const res = await app.inject({ method: 'POST', url: '/api/quote', payload: VALID_BODY })

    const events = parseSseEvents(res.body)
    expect(events).toEqual([
      { type: 'progress', pct: 10, etapa: 'Processing triangulated mesh' },
      { type: 'progress', pct: 45, etapa: 'Making infill' },
      { type: 'done', result: QUOTE_RESULT },
    ])
  })

  it('caso error: calcularCotizacion rechaza → emite evento error, sin romper la conexión', async () => {
    _uploadCache.set('upload-1', STL_ANALYSIS)
    _quoteService.calcularCotizacion.mockRejectedValue(new Error('Material no encontrado.'))

    const res = await app.inject({ method: 'POST', url: '/api/quote', payload: VALID_BODY })

    expect(res.headers['content-type']).toBe('text/event-stream')
    const events = parseSseEvents(res.body)
    expect(events).toEqual([{ type: 'error', message: 'Material no encontrado.', code: 'QUOTE_ERROR' }])
  })

  it('pasa uploadId, materialId, maquinaId, cantidad, empleadoId y observaciones a calcularCotizacion', async () => {
    _uploadCache.set('upload-1', STL_ANALYSIS)
    _quoteService.calcularCotizacion.mockResolvedValue(QUOTE_RESULT)

    await app.inject({
      method: 'POST',
      url: '/api/quote',
      payload: { ...VALID_BODY, observaciones: 'urgente' },
    })

    expect(_quoteService.calcularCotizacion).toHaveBeenCalledWith(
      expect.objectContaining({
        stlAnalysis: STL_ANALYSIS,
        materialId: 'mat-1',
        maquinaId: 'maq-1',
        cantidad: 1,
        empleadoId: 'empleado-1',
        observaciones: 'urgente',
      })
    )
  })
})
