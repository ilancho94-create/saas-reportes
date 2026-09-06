'use client'

// Pastilla ⚠N que abre un popover accesible por click, tap y teclado
// (Enter/Space). aria-label + title siguen presentes para lectores de
// pantalla y para el hover en desktop; el popover garantiza que el
// usuario táctil también vea la explicación.

import { useEffect, useRef, useState } from 'react'
import { formatDiagLine } from '@/lib/costo-uso/ui-helpers'

export function DiagBadge({
  items,
  tone = 'warning',
}: {
  items: any[]
  tone?: 'warning' | 'info' | 'error'
}) {
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
    tone === 'error'
      ? 'bg-red-950/80 border border-red-800 text-red-300'
      : tone === 'warning'
        ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
        : 'bg-sky-950/80 border border-sky-800 text-sky-300'
  const label = items.map(formatDiagLine).join('; ')

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
        <span aria-hidden="true">⚠</span>
        {items.length}
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Detalles del hallazgo"
          data-testid="diag-badge-popover"
          className="absolute z-30 top-full left-0 mt-1 w-64 max-w-[80vw] rounded-lg border border-amber-800 bg-gray-950 shadow-xl p-3 space-y-1.5"
        >
          {items.map((it, i) => (
            <p key={i} className="text-amber-100 text-xs leading-snug" data-testid="diag-badge-item">
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
