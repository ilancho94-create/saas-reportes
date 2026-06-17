'use client'

import { useEffect, useState } from 'react'

// El tipo `BeforeInstallPromptEvent` no está en la lib de TypeScript estándar.
// Lo declaramos minimalmente.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'rxr_install_dismissed_at'
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 1 semana

export default function InstallBanner() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [dismissed, setDismissed] = useState(true) // empezar oculto, se evalúa en effect

  useEffect(() => {
    // Detección platform
    const ua = window.navigator.userAgent.toLowerCase()
    const iOS = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua)
    setIsIOS(iOS)

    // ¿Ya está instalada y corriendo en standalone?
    const standaloneMQ = window.matchMedia('(display-mode: standalone)').matches
    // iOS Safari usa navigator.standalone, no display-mode
    const iosStandalone = (window.navigator as any).standalone === true
    setIsStandalone(standaloneMQ || iosStandalone)

    // ¿Usuario lo cerró hace poco?
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      if (raw) {
        const at = parseInt(raw, 10)
        if (!isNaN(at) && Date.now() - at < DISMISS_TTL_MS) {
          setDismissed(true)
          return
        }
      }
      setDismissed(false)
    } catch {
      setDismissed(false)
    }

    // Registrar service worker (necesario para que el evento dispare)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Silencioso — no es crítico para el resto de la app
      })
    }

    // Capturar el prompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setIsStandalone(true)
      setInstallEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setDismissed(true)
  }

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === 'accepted') setInstallEvent(null)
    else dismiss()
  }

  // No mostrar si ya instalada, ya cerrado, o sin evento (y no es iOS)
  if (isStandalone || dismissed) return null
  if (!installEvent && !isIOS) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto bg-gray-900 border border-blue-700 rounded-2xl shadow-2xl shadow-black/50 px-4 py-3 flex items-center gap-3">
      <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold leading-tight">Instala Restaurant X-Ray</p>
        <p className="text-gray-400 text-xs leading-snug mt-0.5">
          {isIOS && !installEvent
            ? 'Toca el botón de Compartir y elige "Agregar a Inicio".'
            : 'Acceso desde tu pantalla de inicio, más rápido y sin barra del navegador.'}
        </p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {!isIOS && installEvent && (
          <button
            onClick={install}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap">
            Instalar
          </button>
        )}
        <button
          onClick={dismiss}
          className="text-gray-500 hover:text-gray-300 text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">
          Después
        </button>
      </div>
    </div>
  )
}
