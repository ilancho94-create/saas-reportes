'use client'

// Banner "Resumen del período" con panel desplegable de incidencias.
// Compartido entre la página productiva y la ruta sandbox.

import { useState } from 'react'
import {
  CATEGORY_LABELS,
  DIAG_LABELS,
} from '@/lib/costo-uso/ui-helpers'

function fmt(n: any) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  const abs = Math.abs(num)
  const s = '$' + abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return num < 0 ? '-' + s : s
}

export function RangeSummary({
  rangeDiagnostics,
  requestedLabel,
  effectiveLabel,
  externalAnchorWeek,
  defaultOpen = false,
}: {
  rangeDiagnostics: any
  requestedLabel: string | null
  effectiveLabel: string | null
  externalAnchorWeek: string | null   // no-null si periodSeries[0].anchorWeek < requestedRange.from
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen)
  if (!rangeDiagnostics) return null

  const items: any[] = rangeDiagnostics.items || []
  const checks: Record<string, string> = rangeDiagnostics.checks || {}
  const intervalExtended = items.find(i => i.type === 'interval_extended')
  const unclosedTail = items.find(i => i.type === 'unclosed_tail')
  const notDeterminedCount = Object.values(checks).filter(v => v === 'not_determinable').length
  const presentCount = items.length
  const noIncidencesDetected = presentCount === 0 && notDeterminedCount === 0

  return (
    <div
      className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm"
      data-testid="range-summary"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-1">
            Resumen del período
          </p>
          {requestedLabel && effectiveLabel && requestedLabel !== effectiveLabel ? (
            <p className="text-gray-300">
              Solicitado: <span className="text-white" data-testid="requested-label">{requestedLabel}</span>
              <span className="text-gray-500 mx-2">·</span>
              Analizado: <span className="text-white" data-testid="effective-label">{effectiveLabel}</span>
            </p>
          ) : requestedLabel ? (
            <p className="text-gray-300">Rango: <span className="text-white">{requestedLabel}</span></p>
          ) : null}
          {externalAnchorWeek && (
            <p className="text-amber-300 text-xs mt-1" data-testid="ext-anchor-note">
              Inventario inicial de referencia: cierre de la semana {externalAnchorWeek} (fuera del rango seleccionado). Sus compras y ventas <strong>no</strong> se incluyen en el consumo.
            </p>
          )}
          {intervalExtended && !externalAnchorWeek && (
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
          onClick={() => setOpen(v => !v)}
          className={
            'shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ' +
            (presentCount > 0 || notDeterminedCount > 0
              ? 'bg-amber-950/60 border-amber-800 text-amber-200 hover:bg-amber-900/60'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700')
          }
          aria-expanded={open}
          aria-controls="diag-panel"
          data-testid="toggle-diag-panel"
        >
          {presentCount > 0
            ? `${presentCount} incidencia${presentCount !== 1 ? 's' : ''} · ${open ? 'Ocultar' : 'Ver'} detalle`
            : notDeterminedCount > 0
              ? `${notDeterminedCount} comprobación${notDeterminedCount !== 1 ? 'es' : ''} no determinable${notDeterminedCount !== 1 ? 's' : ''} · ${open ? 'Ocultar' : 'Ver'} detalle`
              : 'Sin incidencias detectadas'}
        </button>
      </div>
      {noIncidencesDetected && (
        <p className="text-gray-500 text-xs mt-2">
          Nota: “sin incidencias detectadas” no equivale a exactitud financiera validada.
        </p>
      )}
      {open && (
        <div
          id="diag-panel"
          className="mt-3 border-t border-gray-800 pt-3 space-y-2"
          data-testid="diag-panel"
        >
          {items.length === 0 && (
            <p className="text-gray-400 text-xs">Sin incidencias emitidas por el motor para este rango.</p>
          )}
          {items.map((it, idx) => {
            const meta = DIAG_LABELS[it.type] || { title: it.type, hint: '' }
            return (
              <div
                key={idx}
                className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2"
                data-testid={'diag-item-' + it.type}
              >
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
                    Uso negativo publicado: {fmt(it.evidence?.bruto)}
                  </p>
                )}
                {it.type === 'missing_week' && it.evidence?.previousWeekEnd && it.evidence?.nextWeekStart && (
                  <p className="text-gray-500 text-xs mt-1">
                    Entre {String(it.evidence.previousWeekEnd)} y {String(it.evidence.nextWeekStart)} ({String(it.evidence.estimatedMissingWeeks)} semana(s) sin reportar).
                  </p>
                )}
                {it.type === 'coverage_gap_days' && (
                  <p className="text-gray-500 text-xs mt-1">
                    Entre {String(it.evidence?.previousWeekEnd)} y {String(it.evidence?.nextWeekStart)} ({String(it.evidence?.uncoveredDays)} día(s) sin cobertura).
                  </p>
                )}
                {it.type === 'unmatched_pmix_items' && (
                  <p className="text-gray-500 text-xs mt-1">
                    {String(it.evidence?.count)} ítem(s) · teórico agregado: {fmt(it.evidence?.totalTheoCost)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
