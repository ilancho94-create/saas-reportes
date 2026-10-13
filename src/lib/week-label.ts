// Helper: formatear una semana ISO 'YYYY-Www' quitando el año para
// mostrarla compacta (p.ej. 'W40' en vez de '2026-W40').
// Antes había `.replace('2026-', '')` disperso en varias pantallas;
// cuando pase 2027 esos "replace('2026-', '')" dejarían de funcionar.
export function shortWeek(week: string | null | undefined): string {
  if (!week) return ''
  return String(week).replace(/^\d{4}-/, '')
}
