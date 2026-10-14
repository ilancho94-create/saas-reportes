'use client'

// Cliente de la ruta sandbox. Monta el ENGINE REAL con fixtures y
// reutiliza los COMPONENTES REALES (DiagBadge, RangeSummary,
// UnclosedRangeCard) que también usa /dashboard/costo-uso. La única
// pieza local es la tabla de detalle por categoría, que rinde con
// los mismos labels y helpers de UI que la vista productiva.
// Sin Supabase, sin auth, sin red.

import { useMemo, useState } from 'react'
import { createCostoUsoEngine } from '@/lib/costo-uso/engine'
import {
  CATEGORY_LABELS,
  VARIANCE_REASON_LABEL,
  VARIANCE_REASON_LONG,
} from '@/lib/costo-uso/ui-helpers'
import type { ScenarioInput } from '@/lib/costo-uso/__fixtures__/scenarios'
import { DiagBadge } from '../../_components/DiagBadge'
import { RangeSummary } from '../../_components/RangeSummary'
import { UnclosedRangeCard } from '../../_components/UnclosedRangeCard'

function fmt(n: any) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  const abs = Math.abs(num)
  const s = '$' + abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return num < 0 ? '-' + s : s
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
  const [showDiag, setShowDiag] = useState(true)

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
  const CATEGORIES = engine.CATEGORIES

  function diagItemsFor(scope: { category?: string }): any[] {
    if (!rangeDiagnostics) return []
    return (rangeDiagnostics.items || []).filter((it: any) => {
      if (scope.category && it.category && it.category !== scope.category) return false
      return true
    })
  }

  const first = periodSeries[0]
  const last  = periodSeries[periodSeries.length - 1]
  const requestedLbl = data.requestedRange ? data.requestedRange.from + ' → ' + data.requestedRange.to : null
  const effectiveLbl = first
    ? (first.activityFirstLabel || first.fullWeek) + ' → ' + (last.activityLastLabel || last.fullWeek)
    : null
  const externalAnchor = first?.anchorWeek && data.requestedRange && first.anchorWeek < data.requestedRange.from
    ? first.anchorWeek
    : null
  const anchorForEmpty = filtered[0] ? engine.findAnchorBefore(filtered[0]) : null

  const isMultiWeek = periodSeries.length > 1 || (periodSeries.length === 1 && periodSeries[0].isConsolidated)

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6 bg-black text-white min-h-screen">
      <header className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider">Sandbox visual (development)</p>
          <h1 className="text-2xl font-bold" data-testid="scenario-name">Escenario: {scenario}</h1>
        </div>
        <nav aria-label="Escenarios disponibles" className="text-xs flex flex-wrap gap-1">
          {available.map(n => (
            <a
              key={n}
              href={'/dashboard/costo-uso/sandbox/' + n}
              className={
                'inline-block px-2 py-1 rounded ' +
                (n === scenario ? 'bg-blue-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800')
              }
            >
              {n}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setShowDiag(v => !v)}
          className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
          data-testid="ui-toggle-diag-default-open"
        >
          Panel diag default open: {String(showDiag)}
        </button>
      </header>

      <RangeSummary
        rangeDiagnostics={rangeDiagnostics}
        requestedLabel={requestedLbl}
        effectiveLabel={effectiveLbl}
        externalAnchorWeek={externalAnchor}
        defaultOpen={showDiag}
        key={String(showDiag) + scenario}
      />

      {filtered.length > 0 && periodSeries.length === 0 && (
        <UnclosedRangeCard
          selectedWeeks={filtered.map((w: any) => w.report.week)}
          anchorReferenceWeek={anchorForEmpty?.report?.week || null}
          anchorReferenceWeekEnd={anchorForEmpty?.report?.week_end || null}
        />
      )}

      {detailData && (
        <>
          <p
            className="text-gray-500 text-xs font-semibold uppercase tracking-wider"
            data-testid="period-label"
          >
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
                  ? (VARIANCE_REASON_LABEL[detailData.totalVariacionReason || 'partial_total_theo']) +
                    (detailData.totalVariacionReason === 'partial_total_theo' && (detailData.totalVariacionMissingCategories || []).length > 0
                      ? ' (' + ((detailData.totalVariacionMissingCategories as string[]).map(k => CATEGORY_LABELS[k] || k).join(', ')) + ')'
                      : '')
                  : ''}
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Ventas A&amp;B</p>
              <p className="text-3xl font-bold text-gray-300">{fmt(detailData.totalABSales)}</p>
            </div>
          </div>

          {/* Tabla por categoría — usa DiagBadge compartido. La estructura
              de la fila es equivalente a la de la vista productiva, con
              los mismos data-testid para la verificación Playwright. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cat-table">
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
                          >
                            — {VARIANCE_REASON_LABEL[reason]}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
