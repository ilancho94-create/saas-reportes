import * as fs from 'fs'

export interface KitchenTicket {
  server: string
  check_number: string
  table: string
  station: string
  expediter_level: string
  fired_date: string
  fulfilled_date: string
  fulfillment_seconds: number | null
  day_of_week: string
  hour: number
  date: string
}

export interface KitchenPerformanceResult {
  tickets: KitchenTicket[]
  detected_stations: string[]
  date_warning: string | null
}

function parseTimeToSeconds(t: string): number | null {
  if (!t) return null
  t = t.trim()
  const hrs = t.match(/(\d+)\s*hour/)
  const mins = t.match(/(\d+)\s*minute/)
  const secs = t.match(/(\d+)\s*second/)
  let total = 0
  if (hrs) total += parseInt(hrs[1]) * 3600
  if (mins) total += parseInt(mins[1]) * 60
  if (secs) total += parseInt(secs[1])
  return total > 0 ? total : null
}

function parseRow(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes }
    else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += line[i] }
  }
  result.push(current.trim())
  return result
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAYS_ES: Record<string, string> = {
  Sunday: 'Domingo', Monday: 'Lunes', Tuesday: 'Martes',
  Wednesday: 'Miércoles', Thursday: 'Jueves', Friday: 'Viernes', Saturday: 'Sábado'
}

export function parseKitchenDetailsCsv(csvContent: string): KitchenPerformanceResult {
  const lines = csvContent.split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV de Kitchen Details vacío')

  const headerLine = lines[0]
  const headers = parseRow(headerLine).map(h => h.trim())

  const idx = (name: string) => headers.findIndex(h => h === name)
  const locationIdx = idx('Location')
  const serverIdx = idx('Server')
  const checkIdx = idx('Check #')
  const tableIdx = idx('Table')
  const stationIdx = idx('Station')
  const expediterIdx = idx('Expediter Level')
  const firedIdx = idx('Fired Date')
  const fulfilledIdx = idx('Fulfilled Date')
  const timeIdx = idx('Fulfillment Time')

  if (firedIdx === -1 || timeIdx === -1) {
    throw new Error('CSV de Kitchen Details no tiene las columnas esperadas')
  }

  const tickets: KitchenTicket[] = []
  const stationSet = new Set<string>()

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const row = parseRow(line)
    if (row.length <= timeIdx) continue

    const station = row[stationIdx]?.trim() || ''
    const expediterLevel = row[expediterIdx]?.trim() || ''
    const firedDateStr = row[firedIdx]?.trim() || ''
    const timeStr = row[timeIdx]?.trim() || ''

    if (!firedDateStr || !timeStr) continue

    const seconds = parseTimeToSeconds(timeStr)
    if (seconds === null) continue

    // Filtrar outliers mayores a 2 horas
    if (seconds > 7200) continue

    // Parse date
    let dayOfWeek = ''
    let hour = 0
    let dateStr = ''
    try {
      const d = new Date(firedDateStr)
      if (!isNaN(d.getTime())) {
        dayOfWeek = DAYS_ES[DAYS[d.getDay()]] || DAYS[d.getDay()]
        hour = d.getHours()
        dateStr = d.toISOString().split('T')[0]
      }
    } catch { continue }

    if (station) stationSet.add(station)
    if (expediterLevel === '1') stationSet.add('__expediter__')

    tickets.push({
      server: row[serverIdx]?.trim() || '',
      check_number: row[checkIdx]?.trim() || '',
      table: row[tableIdx]?.trim() || '',
      station,
      expediter_level: expediterLevel,
      fired_date: firedDateStr,
      fulfilled_date: row[fulfilledIdx]?.trim() || '',
      fulfillment_seconds: seconds,
      day_of_week: dayOfWeek,
      hour,
      date: dateStr,
    })
  }

  const detected_stations = Array.from(stationSet).filter(s => s !== '__expediter__')

  return { tickets, detected_stations, date_warning: null }
}