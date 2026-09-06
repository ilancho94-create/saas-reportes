// UI helpers compartidos entre la vista productiva y el sandbox de pruebas.
// Sin dependencias de Next, Supabase o el DOM: solo tablas de traducción.

export const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food',
  na_beverage: 'NA Beverage',
  liquor: 'Liquor',
  beer: 'Beer',
  wine: 'Wine',
}

export const DIAG_LABELS: Record<string, { title: string; hint: string }> = {
  missing_week: {
    title: 'Semana(s) faltante(s) entre reportes',
    hint: 'Faltan reportes en el intervalo. El cálculo puede omitir compras y ventas de esas semanas.',
  },
  coverage_gap_days: {
    title: 'Días sin cobertura entre reportes',
    hint: 'Hay días sin reporte entre ambas semanas, pero menos de una semana completa.',
  },
  inverted_dates: {
    title: 'Fechas de reporte fuera de orden',
    hint: 'El inicio de una semana ocurre antes del cierre de la anterior. Revisar el archivo.',
  },
  week_present_no_inventory: {
    title: 'Semana sin conteo de inventario',
    hint: 'Se cargó la semana pero no llegó el inventario. Sus compras y ventas se consolidarán con la próxima semana con inventario.',
  },
  source_missing: {
    title: 'Fuente de datos ausente',
    hint: 'Un archivo o sección no llegó para esta semana. Revisar carga en Upload.',
  },
  field_undetermined: {
    title: 'Dato no comprobable',
    hint: 'El archivo no permite distinguir "cero real" de "campo faltante".',
  },
  inventory_account_missing: {
    title: 'Falta cuenta de inventario esperada',
    hint: 'No se encontró ninguna cuenta R365 para esta categoría en el conteo semanal.',
  },
  unmapped_activity_category: {
    title: 'Categoría con actividad pero sin mapping de ventas',
    hint: 'Llegaron compras/inventario/teórico para una categoría, pero el mapping de ventas no existe. Sus ventas pueden no estar contabilizadas.',
  },
  inventory_carry_mismatch: {
    title: 'Discrepancia entre inventarios',
    hint: 'El inventario inicial de referencia (cierre anterior) no coincide con el inventario inicial declarado del siguiente reporte.',
  },
  theo_cost_source_missing: {
    title: 'Product Mix ausente',
    hint: 'No hay Product Mix cargado para esta semana. La variación por categoría no se puede calcular.',
  },
  theo_cost_partial: {
    title: 'Costo teórico incompleto',
    hint: 'El Product Mix no trae asignación teórica para esta categoría. La variación no es interpretable.',
  },
  unmatched_pmix_items: {
    title: 'Items sin correspondencia en Product Mix',
    hint: 'Hay items vendidos cuyo costo teórico no se pudo atribuir a una categoría.',
  },
  unclosed_tail: {
    title: 'Semanas sin cierre al final del rango',
    hint: 'Estas semanas se cargaron sin inventario y aún no hay una semana posterior que las consolide.',
  },
  negative_gross_consumption: {
    title: 'Consumo antes de ajustarlo a cero',
    hint: 'El cálculo (inventario inicial + compras − inventario final) dio negativo y se muestra como 0. Puede indicar problemas de conteo, factura tardía o transferencia entre unidades.',
  },
  duplicate_week: {
    title: 'Semana con más de un reporte cargado',
    hint: 'Se recibieron múltiples reportes para la misma semana. Puede afectar el cálculo del inventario de referencia.',
  },
  interval_extended: {
    title: 'Intervalo analizado es mayor al solicitado',
    hint: 'El cálculo requiere un inventario anterior fuera de las fechas seleccionadas. Se está usando como referencia.',
  },
}

export const VARIANCE_REASON_LABEL: Record<string, string> = {
  ok: 'variación calculable',
  no_theo_source: 'no calculable · sin Product Mix',
  partial_theo: 'no calculable · costo teórico incompleto en la categoría',
  zero_sales: 'no calculable · ventas iguales a cero',
  negative_sales: 'no calculable · ventas negativas con la regla actual',
  partial_total_theo: 'no calculable · falta teórico en al menos una categoría con ventas',
  no_initial_inventory: 'no calculable · sin inventario inicial de referencia en la categoría',
}

export const VARIANCE_REASON_LONG: Record<string, string> = {
  ok: 'La variación está calculada como consumo − costo teórico con importes sin redondear.',
  no_theo_source: 'No se cargó Product Mix para esta semana o período. Sin él no podemos calcular la variación.',
  partial_theo: 'Product Mix llegó pero esta categoría no tiene asignación teórica. La variación no es interpretable.',
  zero_sales: 'Las ventas de esta categoría son cero, así que interpretar la variación no aporta información.',
  negative_sales: 'Las ventas son negativas (devoluciones netas). La regla actual del sistema no calcula variación en ese caso.',
  partial_total_theo: 'Al menos una categoría con ventas incluidas no tiene costo teórico. Presentar un total sería omitir información de esa categoría.',
  no_initial_inventory: 'No hay conteo de inventario anterior para esta categoría y el reporte actual no trae el campo previous_value. Sin límite inicial, la variación no es calculable.',
}

export function formatDiagLine(it: any): string {
  const label = DIAG_LABELS[it.type] || { title: it.type, hint: '' }
  const parts: string[] = [label.title]
  if (it.category) parts.push('· ' + (CATEGORY_LABELS[it.category] || it.category))
  if (it.week) parts.push('· semana ' + it.week)
  else if (it.weekRange) parts.push('· entre ' + it.weekRange[0] + ' y ' + it.weekRange[1])
  return parts.join(' ')
}
