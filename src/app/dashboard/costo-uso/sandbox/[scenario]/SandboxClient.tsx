'use client'

// Cliente de la ruta sandbox. Monta el ENGINE REAL con fixtures y
// renderiza subcomponentes visuales equivalentes a los de /costo-uso,
// con los mismos helpers de UI. No hace fetches ni depende de auth.

import { useMemo, useState } from 'react'
import { createCostoUsoEngine } from '@/lib/costo-uso/engine'
import {
  CATEGORY_LABELS,
  DIAG_LABELS,
  VARIANCE_REASON_LABEL,
  VARIANCE_REASON_LONG,
  formatDiagLine,
} from '@/lib/costo-uso/ui-helpers'
import type { ScenarioInput } from '@/lib/costo-uso/__fixtures__/scenarios'

function fmt(n: any) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  const abs = Math.abs(num)
  const s = '$' + abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return num < 0 ? '-' + s : s
}

function DiagBadge({ items }: { items: any[] }) {
  if (!items.length) return null
  const label = items.map(formatDiagLine).join('; ')
  return (
    <span
      data-testid="diag-badge"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium bg-amber-950/80 border border-amber-800 text-amber-300"
      role="status"
      aria-label={label}
      title={items.map(formatDiagLine).join('\n')}
    >
      <span aria-hidden="true">⚠</span>
      {items.length}
    </span>
  )
}

export default function SandboxClient({
  scenario,
  available,
  data,
}: {
  scenario: string
  available: string[]
  data: ScenarioInput
}) {
  const engine = useMemo(
    () => createCostoUsoEngine({
      weeks: data.weeks,
      mappings: data.mappings,
      adjustments: data.adjustments,
      skippedWeekSet: new Set(data.skippedWeeks.map((s: any) => s.week)),
      opDiscountMappings: data.opDiscountMappings,
      includeOpDiscounts: false,
      operatingDays: data.operatingDays ?? 6,
      costTargets: {},
      requestedRange: data.requestedRange ?? null,
      fiscalYearStart: data.fiscalYearStart ?? null,
    }),
    [data]
  )

  const filtered = useMemo(() => {
    const r = data.requestedRange
    if (!r) return data.weeks
    return data.weeks.filter(w => w.report.week >= r.from && w.report.week <= r.to)
  }, [data])

  const periodSeries = useMemo(() => engine.buildPeriodSeries(filtered), [engine, filtered])
  const detailData = useMemo(() => engine.aggregateSeries(periodSeries), [engine, periodSeries])
  const rangeDiagnostics = useMemo(() => engine.diagnoseRange(filtered, periodSeries), [engine, filtered, periodSeries])
  const [showDiagPanel, setShowDiagPanel] = useState(true) // por defecto abierto en sandbox
  const CATEGORIES = engine.CATEGORIES

  function diagItemsFor(scope: { category?: string }): any[] {
    if (!rangeDiagnostics) return []
    return (rangeDiagnostics.items || []).filter((it: any) => {
      if (scope.category && it.category && it.category !== scope.category) return false
      return true
    })
  }

  const items = rangeDiagnostics?.items || []
  const checks = rangeDiagnostics?.checks || {}
  const intervalExtended = items.find((i: any) => i.type === 'interval_extended')
  const unclosedTail = items.find((i: any) => i.type === 'unclosed_tail')
  const notDeterminedCount = Object.values(checks).filter(v => v === 'not_determinable').length
  const presentCount = items.length
  const noIncidencesDetected = presentCount === 0 && notDeterminedCount === 0
  const requestedLbl = data.requestedRange ? data.requestedRange.from + ' → ' + data.requestedRange.to : null
  const first = periodSeries[0]
  const last  = periodSeries[periodSeries.length - 1]
  const effectiveLbl = first
    ? (first.activityFirstLabel || first.fullWeek) + ' → ' + (last.activityLastLabel || last.fullWeek)
    : null
  const usesExternalAnchor = first?.anchorWeek && data.requestedRange && first.anchorWeek < data.requestedRange.from
  const anchorForEmpty = filtered[0] ? engine.findAnchorBefore(filtered[0]) : null

  const isMultiWeek = periodSeries.length > 1 || (periodSeries.length === 1 && periodSeries[0].isConsolidated)

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6 bg-black text-white min-h-screen">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">Sandbox de pruebas visuales (development)</p>
          <h1 className="text-2xl font-bold" data-testid="scenario-name">Escenario: {scenario}</h1>
        </div>
        <nav aria-label="Escenarios disponibles" className="text-xs">
          {available.map(n => (
            <a
              key={n}
              href={'/dashboard/costo-uso/_sandbox/' + n}
              className={'inline-block mx-1 px-2 py-1 rounded ' + (n === scenario ? 'bg-blue-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800')}
            >
              {n}
            </a>
          ))}
        </nav>
      </header>

      {/* Resumen del período */}
      {rangeDiagnostics && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm" data-testid="range-summary">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-1">Resumen del período</p>
              {requestedLbl && effectiveLbl && requestedLbl !== effectiveLbl ? (
                <p className="text-gray-300">
                  Solicitado: <span className="text-white" data-testid="requested-label">{requestedLbl}</span>
                  <span className="text-gray-500 mx-2">·</span>
                  Analizado: <span className="text-white" data-testid="effective-label">{effectiveLbl}</span>
                </p>
              ) : requestedLbl ? (
                <p className="text-gray-300">Rango: <span className="text-white">{requestedLbl}</span></p>
              ) : null}
              {usesExternalAnchor && (
                <p className="text-amber-300 text-xs mt-1" data-testid="ext-anchor-note">
                  Inventario inicial de referencia: cierre de la semana {first.anchorWeek} (fuera del rango seleccionado). Sus compras y ventas <strong>no</strong> se incluyen en el consumo.
                </p>
              )}
              {intervalExtended && !usesExternalAnchor && (
                <p className="text-amber-300 text-xs mt-1">
                  El cálculo requiere referencia fuera de las fechas seleccionadas.
                </p>
              )}
              {unclosedTail && (
                <p className="text-amber-300 text-xs mt-1" data-testid="unclosed-tail-note">
                  Semanas sin cierre pendientes: {((unclosedTail.evidence?.weeks as string[]) || []).join(', ') || '—'}. Sus datos se consolidarán en el próximo inventario.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowDiagPanel(v => !v)}
              className={'shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition ' + (
                presentCount > 0 || notDeterminedCount > 0
                  ? 'bg-amber-950/60 border-amber-800 text-amber-200 hover:bg-amber-900/60'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              )}
              aria-expanded={showDiagPanel}
              aria-controls="diag-panel"
              data-testid="toggle-diag-panel"
            >
              {presentCount > 0
                ? presentCount + ' incidencia' + (presentCount !== 1 ? 's' : '') + ' · ' + (showDiagPanel ? 'Ocultar' : 'Ver') + ' detalle'
                : notDeterminedCount > 0
                  ? notDeterminedCount + ' comprobación' + (notDeterminedCount !== 1 ? 'es' : '') + ' no determinable' + (notDeterminedCount !== 1 ? 's' : '') + ' · ' + (showDiagPanel ? 'Ocultar' : 'Ver') + ' detalle'
                  : 'Sin incidencias detectadas'}
            </button>
          </div>
          {noIncidencesDetected && (
            <p className="text-gray-500 text-xs mt-2">
              Nota: “sin incidencias detectadas” no equivale a exactitud financiera validada.
            </p>
          )}
          {showDiagPanel && (
            <div id="diag-panel" className="mt-3 border-t border-gray-800 pt-3 space-y-2" data-testid="diag-panel">
              {items.length === 0 && (
                <p className="text-gray-400 text-xs">Sin incidencias emitidas por el motor para este rango.</p>
              )}
              {items.map((it: any, idx: number) => {
                const meta = DIAG_LABELS[it.type] || { title: it.type, hint: '' }
                return (
                  <div key={idx} className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2" data-testid={'diag-item-' + it.type}>
                    <p className="text-gray-100 text-sm font-medium">{meta.title}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {it.category ? (CATEGORY_LABELS[it.category] || it.category) : ''}
                      {it.category && it.week ? ' · ' : ''}
                      {it.week ? 'semana ' + it.week : ''}
                      {!it.week && it.weekRange ? 'entre ' + it.weekRange[0] + ' y ' + it.weekRange[1] : ''}
                    </p>
                    {meta.hint && <p className="text-gray-400 text-xs mt-1">{meta.hint}</p>}
                    {it.type === 'inventory_carry_mismatch' && it.evidence?.anchor && it.evidence?.closing && (
                      <p className="text-gray-500 text-xs mt-1">
                        Inventario final anterior: {fmt(it.evidence.anchor.adjustedValue)}
                        {' · '}Inventario inicial siguiente: {fmt(it.evidence.closing.adjustedValue)}
                        {' · '}Diferencia: {fmt(it.evidence.diff)}
                      </p>
                    )}
                    {it.type === 'negative_gross_consumption' && (
                      <p className="text-gray-500 text-xs mt-1">
                        Consumo antes de ajustar a cero: {fmt(it.evidence?.bruto)}
                      </p>
                    )}
                    {it.type === 'missing_week' && it.evidence?.previousWeekEnd && it.evidence?.nextWeekStart && (
                      <p className="text-gray-500 text-xs mt-1">
                        Entre {String(it.evidence.previousWeekEnd)} y {String(it.evidence.nextWeekStart)} ({String(it.evidence.estimatedMissingWeeks)} semana(s) sin reportar).
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Rango sin cierre */}
      {filtered.length > 0 && periodSeries.length === 0 && (
        <div className="bg-amber-950/40 border border-amber-800 rounded-xl p-5" data-testid="unclosed-range-card">
          <p className="text-amber-200 text-sm font-semibold">Rango sin cierre de inventario</p>
          {anchorForEmpty ? (
            <>
              <p className="text-amber-100/80 text-xs mt-1">
                Ninguna de las semanas seleccionadas ({filtered.map(w => w.report.week).join(', ')}) trajo conteo de inventario, así que <strong>falta un conteo final para cerrar el período</strong>.
              </p>
              <p className="text-amber-100/70 text-xs mt-2">
                Referencia inicial disponible: cierre de la semana {anchorForEmpty.report.week}
                {anchorForEmpty.report.week_end ? ' (' + anchorForEmpty.report.week_end + ')' : ''}. Se aplicará al próximo conteo que se cargue.
              </p>
            </>
          ) : (
            <p className="text-amber-100/80 text-xs mt-1">
              Ninguna de las semanas seleccionadas trajo conteo de inventario, y tampoco hay conteo anterior fuera del rango que sirva como referencia inicial.
            </p>
          )}
        </div>
      )}

      {detailData && (
        <>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
            {(() => {
              const actFirst = detailData.activityFirstLabel || detailData.fullWeek
              const actLast  = detailData.activityLastLabel  || detailData.fullWeek
              const actStart = detailData.activityWeekStart
              const actEnd   = detailData.activityWeekEnd
              if (periodSeries.length > 1) {
                const totalWeeks = periodSeries.reduce((s: number, p: any) => s + (p.periodWeekCount || 1), 0)
                return `Período analizado — ${actFirst} → ${actLast} (${periodSeries.length} cierres, ${totalWeeks} semana(s) de actividad)`
              }
              return `Semana ${detailData.fullWeek}${actStart && actEnd ? ' — actividad ' + actStart + ' al ' + actEnd : ''}`
            })()}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">% Costo Real A&amp;B {isMultiWeek ? '(consolidado)' : ''}</p>
              <p className="text-3xl font-bold text-blue-400" data-testid="total-real-pct">
                {detailData.totalRealPct !== null ? detailData.totalRealPct + '%' : '—'}
              </p>
              <p className="text-gray-600 text-xs mt-1">{fmt(detailData.totalUsoCost)} uso</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">% Costo P.Mix</p>
              <p className="text-3xl font-bold text-green-400" data-testid="total-mix-pct">
                {detailData.totalMixPct !== null ? detailData.totalMixPct + '%' : '—'}
              </p>
              <p className="text-gray-600 text-xs mt-1">{fmt(detailData.totalTheoCost)} teórico</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5" data-testid="total-variacion-card">
              <p className="text-gray-500 text-xs mb-1">Variación $</p>
              <p
                className={
                  'text-3xl font-bold ' +
                  (detailData.totalVariacion === null
                    ? 'text-gray-500'
                    : detailData.totalVariacion > 0
                      ? 'text-red-400'
                      : detailData.totalVariacion < 0
                        ? 'text-green-400'
                        : 'text-gray-400')
                }
                data-testid="total-variacion-value"
              >
                {detailData.totalVariacion !== null ? (detailData.totalVariacion > 0 ? '+' : '') + fmt(detailData.totalVariacion) : '—'}
              </p>
              <p className="text-gray-600 text-xs mt-1" data-testid="total-variacion-reason">
                {detailData.totalVariacion === null
                  ? VARIANCE_REASON_LABEL[detailData.totalVariacionReason || 'partial_total_theo']
                  : ''}
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Ventas A&amp;B</p>
              <p className="text-3xl font-bold text-gray-300">{fmt(detailData.totalABSales)}</p>
            </div>
          </div>

          {/* Tabla por categoría */}
          <table className="w-full text-sm mt-6" data-testid="cat-table">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left py-2">Categoría</th>
                <th className="text-right py-2">Uso $</th>
                <th className="text-right py-2">Teórico $</th>
                <th className="text-right py-2">Ventas $</th>
                <th className="text-right py-2">Variación $</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat => {
                const variacion = detailData[cat.key + '_variacion']
                const reason = detailData[cat.key + '_variacion_reason'] || 'ok'
                return (
                  <tr key={cat.key} className="border-b border-gray-800" data-testid={'row-' + cat.key}>
                    <td className="py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="text-gray-300">{cat.label}</span>
                        <DiagBadge items={diagItemsFor({ category: cat.key })} />
                      </div>
                    </td>
                    <td className="text-right py-2 text-gray-100">{fmt(detailData[cat.key + '_uso'])}</td>
                    <td className="text-right py-2 text-gray-400">{fmt(detailData[cat.key + '_theo_cost'])}</td>
                    <td className="text-right py-2 text-gray-400">{fmt(detailData[cat.key + '_sales'])}</td>
                    <td className="text-right py-2">
                      {variacion !== null ? (
                        <span className={variacion > 0 ? 'text-red-400' : variacion < 0 ? 'text-green-400' : 'text-gray-400'}>
                          {variacion > 0 ? '+' : ''}{fmt(variacion)}
                        </span>
                      ) : (
                        <span
                          className="text-gray-500"
                          data-testid={'row-' + cat.key + '-null-reason'}
                          title={VARIANCE_REASON_LONG[reason]}
                        >— {VARIANCE_REASON_LABEL[reason]}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
