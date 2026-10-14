'use client'

// Aviso cuando el rango solicitado no produce ningún cierre.
// Bifurca según si existe una referencia inicial (anchor previo)
// disponible, o no.

export function UnclosedRangeCard({
  selectedWeeks,
  anchorReferenceWeek,
  anchorReferenceWeekEnd,
}: {
  selectedWeeks: string[]
  anchorReferenceWeek: string | null
  anchorReferenceWeekEnd: string | null
}) {
  return (
    <div
      className="bg-amber-950/40 border border-amber-800 rounded-xl p-5"
      data-testid="unclosed-range-card"
    >
      <p className="text-amber-200 text-sm font-semibold">Rango sin cierre de inventario</p>
      {anchorReferenceWeek ? (
        <>
          <p className="text-amber-100/80 text-xs mt-1" data-testid="unclosed-with-anchor">
            Ninguna de las semanas seleccionadas ({selectedWeeks.join(', ')}) trajo conteo de inventario, así que <strong>falta un conteo final para cerrar el período</strong>.
          </p>
          <p className="text-amber-100/70 text-xs mt-2">
            Referencia inicial disponible: cierre de la semana {anchorReferenceWeek}
            {anchorReferenceWeekEnd ? ' (' + anchorReferenceWeekEnd + ')' : ''}. Se aplicará al próximo conteo que se cargue.
          </p>
        </>
      ) : (
        <p className="text-amber-100/80 text-xs mt-1" data-testid="unclosed-no-anchor">
          Ninguna de las semanas seleccionadas ({selectedWeeks.join(', ')}) trajo conteo de inventario, y tampoco hay un conteo anterior fuera del rango que sirva como referencia inicial.
        </p>
      )}
      <p className="text-amber-100/60 text-xs mt-2">
        Las ventas y compras aparecen en las otras vistas pero no producen consumo consolidado hasta que se cargue el próximo inventario.
      </p>
    </div>
  )
}
