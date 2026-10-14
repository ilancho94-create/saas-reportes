'use client'

// Pastilla ⚠N que abre un popover accesible por click, tap y teclado
// (Enter/Space). aria-label + title siguen presentes para lectores de
// pantalla y para el hover en desktop; el popover garantiza que el
// usuario táctil también vea la explicación.
//
// Tono: si no se pasa, se infiere de los items — todos info → sky,
// cualquier warning/error → amber. Evita que una semana con solo
// avisos informativos aparezca en amarillo como si fuera un problema.

import { useEffect, useRef, useState } from 'react'
import { formatDiagLine, DIAG_LABELS } from '@/lib/costo-uso/ui-helpers'

export function DiagBadge({
  items,
  tone,
}: {
  items: any[]
  tone?: 'warning' | 'info' | 'error'
}) {
  // Infer tone when not forced.
  const inferredTone: 'warning' | 'info' | 'error' = (() => {
    if (!items?.length) return 'warning'
    const sevs = items.map(it => DIAG_LABELS[it.type]?.severity || 'warning')
    if (sevs.includes('error')) return 'error'
    if (sevs.includes('warning')) return 'warning'
    return 'info'
  })()
  const effectiveTone = tone || inferredTone
  const iconChar = effectiveTone === 'info' ? 'ℹ' : '⚠'
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (btnRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!items?.length) return null

  const cls =
    effectiveTone === 'error'
      ? 'bg-red-950/80 border border-red-800 text-red-300'
      : effectiveTone === 'warning'
        ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
        : 'bg-sky-950/80 border border-sky-800 text-sky-300'
  const label = items.map(formatDiagLine).join('; ')
  const popoverCls = effectiveTone === 'info'
    ? 'absolute z-30 top-full left-0 mt-1 w-64 max-w-[80vw] rounded-lg border border-sky-800 bg-gray-950 shadow-xl p-3 space-y-1.5'
    : 'absolute z-30 top-full left-0 mt-1 w-64 max-w-[80vw] rounded-lg border border-amber-800 bg-gray-950 shadow-xl p-3 space-y-1.5'
  const popTextCls = effectiveTone === 'info' ? 'text-sky-100' : 'text-amber-100'

  return (
    <span className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        data-testid="diag-badge"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls} cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        <span aria-hidden="true">{iconChar}</span>
        {items.length}
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Detalles del hallazgo"
          data-testid="diag-badge-popover"
          className={popoverCls}
        >
          {items.map((it, i) => (
            <p key={i} className={`text-xs leading-snug ${popTextCls}`} data-testid="diag-badge-item">
              {formatDiagLine(it)}
            </p>
          ))}
          <button
            type="button"
            onClick={() => { setOpen(false); btnRef.current?.focus() }}
            className="mt-1 w-full text-center text-[10px] text-gray-500 hover:text-gray-300"
          >
            Cerrar
          </button>
        </div>
      )}
    </span>
  )
}
