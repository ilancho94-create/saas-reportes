// Página "no encontrado" para el segmento sandbox.
// En producción, cualquier ruta bajo /dashboard/costo-uso/sandbox/ cae
// aquí, con status HTTP 404 devuelto por Next automáticamente cuando el
// server component llama notFound().

export default function SandboxNotFound() {
  return null
}
