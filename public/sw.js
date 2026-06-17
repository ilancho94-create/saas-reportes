// Service Worker MÍNIMO INERTE.
//
// No tiene fetch handler ni clients.claim a propósito:
// - Sin fetch handler, el browser no enruta requests por aquí (overhead 0).
// - Sin clients.claim, el nuevo SW solo toma control en la siguiente
//   navegación, sin re-interpretar requests in-flight.
// - skipWaiting está para que usuarios con SW viejo se actualicen sin
//   tener que cerrar todas las pestañas.
//
// Chrome 89+ acepta un SW sin fetch handler como "installable".
//
// Cuando se implemente offline strategy (post-auditoría), aquí se agregan
// los listeners de fetch con cache-first/network-first por ruta.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', () => {
  // No clients.claim — el SW nuevo aplica solo en la siguiente navegación.
})
