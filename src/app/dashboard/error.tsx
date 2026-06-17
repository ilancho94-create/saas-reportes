'use client'

// Error boundary del dashboard. Captura excepciones de render/data fetching
// que escapan de los try/catch de cada page y le da al usuario opción de
// reintentar sin recargar todo el browser.

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log para Vercel runtime + cualquier reporter futuro.
    console.error('Dashboard error boundary caught:', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-red-900 rounded-2xl p-6 max-w-md w-full">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl">⚠️</span>
          <div>
            <h2 className="text-white font-bold text-base">Algo salió mal</h2>
            <p className="text-gray-400 text-xs mt-1">
              Ocurrió un error inesperado al cargar esta sección.
              {error.digest && <span className="block text-gray-600 mt-1 font-mono">ref: {error.digest}</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg transition"
          >
            Reintentar
          </button>
          <button
            onClick={() => (window.location.href = '/dashboard')}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition"
          >
            Ir a inicio
          </button>
        </div>
      </div>
    </div>
  )
}
