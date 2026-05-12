import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CotizacionResult, UploadResult, Complejidad } from '../../types'
import { numeroCotizacion, fmtUSD, fmtGramos, fmtFecha } from '../../utils/format'

// Paleta del design system — solo violeta y naranja en el PDF, sin gradientes
const V  = '#7C3FBE'
const O  = '#E8602A'
const G50  = '#F7F6F4'
const G100 = '#E2E0DC'
const G400 = '#9E9C97'
const G700 = '#4A4845'
const G900 = '#1E1C1A'

const s = StyleSheet.create({
  page: {
    paddingTop: 40, paddingBottom: 60, paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: G700,
    backgroundColor: '#FFFFFF',
  },

  // ── Header ──────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoDry:  { fontSize: 17, fontFamily: 'Helvetica-Bold', color: V },
  logoSlash:{ fontSize: 17, color: G400 },
  logoAda:  { fontSize: 17, fontFamily: 'Helvetica-Bold', color: O },
  logoSub:  { fontSize: 8, color: G400, marginLeft: 5, marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  numero: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: G900 },
  fecha:  { fontSize: 8, color: G400, marginTop: 3 },

  // ── Separador violeta ────────────────────────────────
  sep: { height: 2, backgroundColor: V, marginBottom: 14 },

  // ── Grilla de info (2 columnas) ──────────────────────
  infoGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  infoBox: {
    flex: 1,
    backgroundColor: G50,
    borderRadius: 6,
    padding: 10,
  },
  infoTitle: {
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: V,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 7,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  infoLabel: { fontSize: 8, color: G400 },
  infoValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: G900 },

  // ── Sección: título ──────────────────────────────────
  secTitle: {
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: V,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 6,
  },

  // ── Tabla de desglose ────────────────────────────────
  table: {
    borderWidth: 0.5, borderColor: G100, borderStyle: 'solid',
    borderRadius: 6, marginBottom: 12,
  },
  tr: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 6,
    borderBottomWidth: 0.5, borderBottomColor: G100, borderBottomStyle: 'solid',
  },
  trLast: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: G50,
  },
  tdLabel:     { fontSize: 8, color: G400 },
  tdLabelBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: G900 },
  tdValue:     { fontSize: 8, fontFamily: 'Courier', color: G700 },
  tdValueBold: { fontSize: 8, fontFamily: 'Courier-Bold', color: G900 },

  // ── Caja precio final ────────────────────────────────
  resultBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FCEEF6',
    borderWidth: 1, borderColor: O, borderStyle: 'solid',
    borderRadius: 8, padding: 14,
    marginBottom: 12,
  },
  resultLeft:  {},
  resultLabel: { fontSize: 9, color: '#7A2A0A' },
  resultDetail:{ fontSize: 8, color: '#7A2A0A', marginTop: 3 },
  resultPrice: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: O },

  // ── Observaciones ────────────────────────────────────
  obsBox: {
    backgroundColor: G50, borderRadius: 6,
    padding: 10, marginBottom: 10,
  },
  obsTitle: {
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: V,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  obsText: { fontSize: 8, color: G700, lineHeight: 1.5 },

  // ── Advertencia pieza compleja ───────────────────────
  warnBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 0.5, borderColor: '#FECACA', borderStyle: 'solid',
    borderRadius: 6, padding: 8, marginBottom: 10,
  },
  warnText: { fontSize: 8, color: '#991B1B', lineHeight: 1.5 },

  // ── Footer ──────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 24, left: 40, right: 40,
    borderTopWidth: 0.5, borderTopColor: G100, borderTopStyle: 'solid',
    paddingTop: 8,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: G400 },
})

const LABELS_COMPLEJIDAD: Record<Complejidad, string> = {
  simple:   'Pieza simple',
  moderada: 'Pieza moderada',
  compleja: 'Pieza compleja',
}

interface Props {
  quoteResult: CotizacionResult
  uploadResult: UploadResult
  empleado: string
  stlFileName: string
  observaciones?: string
}

export function CotizacionPDF({ quoteResult, uploadResult, empleado, stlFileName, observaciones }: Props) {
  const numero = numeroCotizacion(quoteResult.id)
  const { gramosInfill, gramosParedes, gramosTotal, costoMaterialUSD, costoInicioUSD,
          precioUnitarioUSD, precioFinalUSD, material, cantidad, complejidad } = quoteResult
  const { boundingBox } = uploadResult

  return (
    <Document title={`Cotización ${numero} — Dryada`} author="Cotizador Dryada">
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <View style={s.logoRow}>
              <Text style={s.logoDry}>DRY</Text>
              <Text style={s.logoSlash}>/</Text>
              <Text style={s.logoAda}>ADA</Text>
              <Text style={s.logoSub}>Cotizador 3D</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.numero}>{numero}</Text>
            <Text style={s.fecha}>{fmtFecha()}</Text>
          </View>
        </View>

        {/* Separador */}
        <View style={s.sep} />

        {/* Info grid */}
        <View style={s.infoGrid}>
          {/* Col izquierda: vendedor + modelo */}
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Vendedor</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Nombre</Text>
              <Text style={s.infoValue}>{empleado}</Text>
            </View>
            <Text style={[s.infoTitle, { marginTop: 8 }]}>Modelo</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Archivo</Text>
              <Text style={s.infoValue}>{stlFileName}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Dimensiones</Text>
              <Text style={s.infoValue}>
                {boundingBox.x.toFixed(0)}×{boundingBox.y.toFixed(0)}×{boundingBox.z.toFixed(0)} mm
              </Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Complejidad</Text>
              <Text style={s.infoValue}>{LABELS_COMPLEJIDAD[complejidad]}</Text>
            </View>
          </View>

          {/* Col derecha: material + parámetros */}
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Material</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Material</Text>
              <Text style={s.infoValue}>{material.nombre}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Precio / g</Text>
              <Text style={s.infoValue}>{fmtUSD(material.precioGramo)}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Cantidad</Text>
              <Text style={s.infoValue}>{cantidad} {cantidad === 1 ? 'unidad' : 'unidades'}</Text>
            </View>
            <Text style={[s.infoTitle, { marginTop: 8 }]}>Parámetros</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Relleno</Text>
              <Text style={s.infoValue}>10%</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Perímetros</Text>
              <Text style={s.infoValue}>2 × 0.4 mm</Text>
            </View>
          </View>
        </View>

        {/* Desglose */}
        <Text style={s.secTitle}>Desglose de cálculo</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={s.tdLabel}>Gramos infill (10%)</Text>
            <Text style={s.tdValue}>{fmtGramos(gramosInfill)}</Text>
          </View>
          <View style={s.tr}>
            <Text style={s.tdLabel}>Gramos paredes (2 × 0.4 mm)</Text>
            <Text style={s.tdValue}>{fmtGramos(gramosParedes)}</Text>
          </View>
          <View style={s.tr}>
            <Text style={s.tdLabel}>Peso total estimado</Text>
            <Text style={s.tdValue}>{fmtGramos(gramosTotal)}</Text>
          </View>
          <View style={s.tr}>
            <Text style={s.tdLabel}>Costo material ({material.nombre} {fmtUSD(material.precioGramo)}/g)</Text>
            <Text style={s.tdValue}>{fmtUSD(costoMaterialUSD)}</Text>
          </View>
          <View style={s.tr}>
            <Text style={s.tdLabel}>Costo inicio de impresión</Text>
            <Text style={s.tdValue}>{fmtUSD(costoInicioUSD)}</Text>
          </View>
          <View style={s.trLast}>
            <Text style={s.tdLabelBold}>Precio unitario</Text>
            <Text style={s.tdValueBold}>{fmtUSD(precioUnitarioUSD)}</Text>
          </View>
        </View>

        {/* Precio final */}
        <View style={s.resultBox}>
          <View style={s.resultLeft}>
            <Text style={s.resultLabel}>Precio final</Text>
            <Text style={s.resultDetail}>{cantidad} {cantidad === 1 ? 'unidad' : 'unidades'} × {fmtUSD(precioUnitarioUSD)} c/u</Text>
          </View>
          <Text style={s.resultPrice}>{fmtUSD(precioFinalUSD)} USD</Text>
        </View>

        {/* Observaciones */}
        {observaciones && (
          <View style={s.obsBox}>
            <Text style={s.obsTitle}>Observaciones</Text>
            <Text style={s.obsText}>{observaciones}</Text>
          </View>
        )}

        {/* Advertencia si compleja */}
        {complejidad === 'compleja' && (
          <View style={s.warnBox}>
            <Text style={s.warnText}>
              ⚠ NOTA: Esta pieza fue clasificada como compleja. La estimación de peso puede tener un margen de error de hasta ±15%. Se recomienda validar con el equipo de producción antes de confirmar al cliente.
            </Text>
          </View>
        )}

        {complejidad === 'moderada' && (
          <View style={s.warnBox}>
            <Text style={s.warnText}>
              Nota: Esta pieza fue clasificada como moderada. La estimación puede tener un margen de error de hasta ±10%.
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Dryada 3DPrinter — cotizador@dryada.com</Text>
          <Text style={s.footerText}>Cotización válida por 15 días · {numero}</Text>
        </View>

      </Page>
    </Document>
  )
}
