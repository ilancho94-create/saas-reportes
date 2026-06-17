// Service Worker mínimo para habilitar la instalación PWA.
// No implementa estrategia de caché offline todavía — eso vendrá en una
// fase posterior junto con la optimización de velocidad y costos.
// La sola presencia de este SW + el manifest.json es suficiente para que
// Chrome dispare el evento beforeinstallprompt y se pueda agregar a inicio.

const CACHE_NAME = 'restaurant-xray-v1'

self.addEventListener('install', (event) => {
  // Activar inmediatamente, sin esperar a que se cierren las pestañas viejas
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Tomar control de pestañas abiertas inmediatamente
  event.waitUntil(self.clients.claim())
  // Limpieza de cachés viejas (por si en el futuro agregamos versiones)
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
})

self.addEventListener('fetch', (event) => {
  // Pasa todo a la red sin tocar. Cuando agreguemos offline strategy,
  // aquí va el switch entre cache-first / network-first según ruta.
  return
})
