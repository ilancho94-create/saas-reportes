// src/lib/upload-guards.ts
//
// Guards de uploads para /api/process(-edit).
// - Límite duro de tamaño (defensa contra DoS / zip-bomb / costo de Vercel).
// - Validación de extensión por tipo de archivo esperado.
//
// Las MIME types reportadas por el cliente no son confiables — usamos la
// extensión del filename (que sí controlamos en el form) + el tamaño.
// Magic-bytes check verdadero requeriría leer cabeceras de XLSX/CSV, que
// es overkill para esta etapa.

const MB = 1024 * 1024

// Por tipo de archivo: extensiones aceptadas y tamaño máximo.
// Tamaños generosos pero acotados — un sales summary de Toast pesa <1MB,
// kitchen_details puede ir a 5-8MB en restaurantes con muchos tickets.
const RULES: Record<string, { exts: string[]; maxBytes: number }> = {
  sales:                { exts: ['xlsx'],          maxBytes: 5 * MB },
  labor:                { exts: ['csv'],           maxBytes: 5 * MB },
  cogs:                 { exts: ['xlsx'],          maxBytes: 5 * MB },
  voids:                { exts: ['csv'],           maxBytes: 5 * MB },
  discounts:            { exts: ['csv'],           maxBytes: 5 * MB },
  waste:                { exts: ['xlsx'],          maxBytes: 5 * MB },
  inventory:            { exts: ['xlsx'],          maxBytes: 5 * MB },
  avt:                  { exts: ['xlsx', 'csv'],   maxBytes: 5 * MB },
  product_mix:          { exts: ['xlsx'],          maxBytes: 5 * MB },
  menu_analysis:        { exts: ['xlsx'],          maxBytes: 5 * MB },
  receiving:            { exts: ['csv'],           maxBytes: 5 * MB },
  employee_performance: { exts: ['xlsx'],          maxBytes: 5 * MB },
  kitchen_details:      { exts: ['csv'],           maxBytes: 15 * MB },
}

export type UploadValidationError = { fileType: string; reason: string }

/**
 * Devuelve `null` si el archivo es válido o un objeto de error si no.
 * Diseñado para usarse adentro del try/catch de cada sección en /api/process.
 */
export function validateUpload(fileType: string, file: File): UploadValidationError | null {
  const rule = RULES[fileType]
  if (!rule) {
    return { fileType, reason: 'Tipo de archivo no reconocido' }
  }
  const name = (file.name || '').toLowerCase()
  const ext = name.split('.').pop() || ''
  if (!rule.exts.includes(ext)) {
    return { fileType, reason: `Extensión inválida (esperaba ${rule.exts.join(' o ')})` }
  }
  if (file.size <= 0) {
    return { fileType, reason: 'Archivo vacío' }
  }
  if (file.size > rule.maxBytes) {
    const mb = (rule.maxBytes / MB).toFixed(0)
    return { fileType, reason: `Archivo excede el límite de ${mb}MB` }
  }
  return null
}
