'use client'

// Pastilla pequeña que muestra "⚠ N" con label accesible y tooltip.
// Compartida entre la página productiva y la ruta sandbox de pruebas
// visuales — evita divergencia entre lo que se verifica y lo que se
// muestra al usuario.

import { formatDiagLine } from '@/lib/costo-uso/ui-helpers'

export function DiagBadge({
  items,
  tone = 'warning',
}: {
  items: any[]
  tone?: 'warning' | 'info' | 'error'
}) {
  if (!items?.length) return null
  const cls =
    tone === 'error'
      ? 'bg-red-950/80 border border-red-800 text-red-300'
      : tone === 'warning'
        ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
        : 'bg-sky-950/80 border border-sky-800 text-sky-300'
  const label = items.map(formatDiagLine).join('; ')
  return (
    <button
      type="button"
      data-testid="diag-badge"
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls} cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400`}
      aria-label={label}
      title={items.map(formatDiagLine).join('\n')}
    >
      <span aria-hidden="true">⚠</span>
      {items.length}
    </button>
  )
}
