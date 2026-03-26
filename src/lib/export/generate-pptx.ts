// generate-pptx.ts — v2
// Dark marble style matching Mula Cantina template
// Full week-over-week comparisons (Sn vs Sn-1)
// Install: npm install pptxgenjs

import type { ExportConfig, ExportData, WeekData } from './data-fetcher'
import { fmt$, fmtPct, safeN } from './data-fetcher'

const DEFAULT_BG_URL = 'https://bboikwhfusptkqvdukzc.supabase.co/storage/v1/object/public/restaurant-logos/assets/bg_marble_web.jpg'
const DEFAULT_LOGO_URL = 'https://bboikwhfusptkqvdukzc.supabase.co/storage/v1/object/public/restaurant-logos/assets/logo_mula_white.png'

const C = {
  white: 'FFFFFF', offwhite: 'E8E8E8', gray: '9CA3AF', darkgray: '4B5563',
  green: '4ADE80', red: 'F87171', orange: 'FBA528', blue: '60A5FA', gold: 'F5C842',
  panelDark: '0D0D0D', panelMid: '1A1A1A', headerBg: '111111',
}

function delta$(curr: number, prev: number): string {
  if (!prev) return '—'
  const d = curr - prev
  return (d >= 0 ? '▲ +' : '▼ ') + fmt$(Math.abs(d))
}
function deltaPct(curr: number, prev: number): string {
  if (!prev) return '—'
  const d = curr - prev
  return (d >= 0 ? '▲ +' : '▼ ') + fmtPct(Math.abs(d))
}
function deltaColor(curr: number, prev: number, higherIsBad = false): string {
  if (!prev) return C.gray
  const up = curr > prev
  if (higherIsBad) return up ? C.red : C.green
  return up ? C.green : C.red
}

export async function generatePPTX(config: ExportConfig, dataByRestaurant: ExportData[]) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Restaurant X-Ray'

  const bgUrl = (config.template as any).backgroundUrl || DEFAULT_BG_URL
  const logoUrl = config.template.logoUrl || DEFAULT_LOGO_URL

  for (const data of dataByRestaurant) {
    const current = data.weeks[data.weeks.length - 1]
    const previous = data.weeks.length >= 2 ? data.weeks[data.weeks.length - 2] : null
    const weekLabel = current?.week || ''
    const prevLabel = previous?.week || ''
    const restName = data.restaurant.name

    addCoverSlide(pptx, bgUrl, logoUrl, restName, weekLabel, prevLabel, current, previous)

    for (const section of config.sections) {
      const note = config.notes[section] || ''
      switch (section) {
        case 'executive':  addExecutiveSlide(pptx, bgUrl, logoUrl, restName, weekLabel, prevLabel, current, previous, data, note); break
        case 'ventas':     addVentasSlide(pptx, bgUrl, logoUrl, restName, weekLabel, prevLabel, current, previous, note); break
        case 'labor':      addLaborSlide(pptx, bgUrl, logoUrl, restName, weekLabel, prevLabel, current, previous, note); break
        case 'food_cost':  addFoodCostSlide(pptx, bgUrl, logoUrl, restName, weekLabel, prevLabel, current, previous, note); break
        case 'waste':      addWasteSlide(pptx, bgUrl, logoUrl, restName, weekLabel, prevLabel, current, previous, note); break
        case 'employee':   addEmployeeSlide(pptx, bgUrl, logoUrl, restName, weekLabel, prevLabel, current, previous, note); break
        case 'avt':        addAvtSlide(pptx, bgUrl, logoUrl, restName, weekLabel, prevLabel, current, previous, note); break
        case 'compras':    addComprasSlide(pptx, bgUrl, logoUrl, restName, weekLabel, prevLabel, current, previous, note); break
        case 'kitchen':    addKitchenSlide(pptx, bgUrl, logoUrl, restName, weekLabel, current, note); break
      }
    }
  }

  const fileName = `${dataByRestaurant[0]?.restaurant?.name?.replace(/\s/g, '-')}-${dataByRestaurant[0]?.weeks[dataByRestaurant[0].weeks.length - 1]?.week || 'reporte'}.pptx`
  await pptx.writeFile({ fileName })
}

function baseSlide(pptx: any, bgUrl: string, logoUrl: string): any {
  const slide = pptx.addSlide()
  slide.addImage({ path: bgUrl, x: 0, y: 0, w: 13.33, h: 7.5 })
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: '000000', transparency: 55 }, line: { color: '000000', transparency: 100 } })
  slide.addImage({ path: logoUrl, x: 11.5, y: 0.12, w: 1.7, h: 0.56, sizing: { type: 'contain', w: 1.7, h: 0.56 } })
  slide.addText('FOR INTERNAL USE ONLY', { x: 0.3, y: 7.18, w: 10, h: 0.25, fontSize: 7, color: '555555', italic: true })
  return slide
}

function sectionHeader(slide: any, title: string, subtitle: string) {
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.85, fill: { color: '000000', transparency: 35 }, line: { color: '000000', transparency: 100 } })
  slide.addText(title, { x: 0.35, y: 0.08, w: 8, h: 0.65, fontSize: 26, color: C.white, bold: true, fontFace: 'Arial Black' })
  slide.addText(subtitle, { x: 8.5, y: 0.22, w: 4.6, h: 0.4, fontSize: 11, color: C.gray, align: 'right' })
}

function addNote(slide: any, note: string) {
  if (!note) return
  slide.addShape('rect', { x: 0.3, y: 6.8, w: 12.7, h: 0.5, fill: { color: 'FEF3C7', transparency: 20 }, line: { color: 'D97706', transparency: 0 } })
  slide.addText('📝 ' + note, { x: 0.5, y: 6.85, w: 12.3, h: 0.38, fontSize: 10, color: 'FEF3C7', italic: true })
}

function panel(slide: any, x: number, y: number, w: number, h: number, transparency = 60) {
  slide.addShape('rect', { x, y, w, h, fill: { color: C.panelDark, transparency }, line: { color: '333333', transparency: 40 } })
}

function kpiBox(slide: any, x: number, y: number, w: number, h: number,
  label: string, value: string, sub: string, deltaVal?: string, deltaClr?: string) {
  panel(slide, x, y, w, h, 55)
  slide.addText(label.toUpperCase(), { x: x + 0.15, y: y + 0.12, w: w - 0.3, h: 0.22, fontSize: 8, color: C.gray, charSpacing: 1.5 })
  slide.addText(value, { x: x + 0.15, y: y + 0.32, w: w - 0.3, h: 0.65, fontSize: 28, color: C.white, bold: true })
  if (sub) slide.addText(sub, { x: x + 0.15, y: y + 0.95, w: w - 0.3, h: 0.22, fontSize: 9, color: C.gray })
  if (deltaVal && deltaVal !== '—') {
    slide.addText(deltaVal, { x: x + 0.15, y: y + 1.18, w: w - 0.3, h: 0.22, fontSize: 9, color: deltaClr || C.gray, bold: true })
  }
}

function compRow(slide: any, x: number, y: number, w: number,
  label: string, valCurr: string, valPrev: string, deltaStr: string, deltaClr: string, isHeader = false) {
  const rowH = 0.38
  if (!isHeader) panel(slide, x, y, w, rowH, 72)
  const c1 = w * 0.38, c2 = w * 0.22, c3 = w * 0.22, c4 = w * 0.18
  const fs = isHeader ? 8 : 10
  const clr = isHeader ? C.gray : C.offwhite
  slide.addText(label, { x: x + 0.1, y: y + (rowH - 0.18) / 2, w: c1 - 0.1, h: 0.2, fontSize: fs, color: clr, bold: isHeader })
  slide.addText(valCurr, { x: x + c1, y: y + (rowH - 0.18) / 2, w: c2, h: 0.2, fontSize: fs, color: isHeader ? C.gray : C.white, bold: !isHeader, align: 'right' })
  slide.addText(valPrev, { x: x + c1 + c2, y: y + (rowH - 0.18) / 2, w: c3, h: 0.2, fontSize: fs, color: isHeader ? C.gray : C.darkgray, align: 'right' })
  slide.addText(deltaStr, { x: x + c1 + c2 + c3, y: y + (rowH - 0.18) / 2, w: c4, h: 0.2, fontSize: fs, color: isHeader ? C.gray : deltaClr, bold: !isHeader, align: 'right' })
}

function addCoverSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, prevLabel: string, current: WeekData, prev: WeekData | null) {
  const slide = pptx.addSlide()
  slide.addImage({ path: bgUrl, x: 0, y: 0, w: 13.33, h: 7.5 })
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: '000000', transparency: 40 }, line: { color: '000000', transparency: 100 } })
  slide.addImage({ path: logoUrl, x: 0.5, y: 0.4, w: 3.5, h: 1.2, sizing: { type: 'contain', w: 3.5, h: 1.2 } })
  slide.addText('REPORTE SEMANAL', { x: 0.5, y: 2.2, w: 12, h: 0.5, fontSize: 13, color: C.gray, charSpacing: 5 })
  slide.addText(restName.toUpperCase(), { x: 0.5, y: 2.7, w: 12, h: 1.2, fontSize: 52, color: C.white, bold: true, fontFace: 'Arial Black' })
  slide.addText(weekLabel, { x: 0.5, y: 4.0, w: 6, h: 0.5, fontSize: 22, color: C.gold })
  if (prev) slide.addText(`vs ${prevLabel}`, { x: 0.5, y: 4.55, w: 6, h: 0.35, fontSize: 14, color: C.gray })

  const sC = safeN(current?.sales?.net_sales), sP = safeN(prev?.sales?.net_sales)
  const lC = safeN(current?.labor?.total_pay), cC = safeN(current?.cogs?.total)
  const profit = sC - lC - cC
  const lpC = sC > 0 ? lC / sC * 100 : 0
  const cpC = sC > 0 ? cC / sC * 100 : 0

  const metrics = [
    { label: 'VENTAS', val: fmt$(sC), delta: prev ? delta$(sC, sP) : '', up: sC >= sP },
    { label: '% LABOR', val: fmtPct(lpC), delta: '', up: true },
    { label: '% COGS', val: fmtPct(cpC), delta: '', up: true },
    { label: 'PROFIT', val: fmt$(profit), delta: '', up: profit >= 0 },
  ]
  metrics.forEach((m, i) => {
    panel(slide, 0.5 + i * 3.2, 5.5, 3.0, 1.65, 60)
    slide.addText(m.label, { x: 0.65 + i * 3.2, y: 5.62, w: 2.7, h: 0.25, fontSize: 8, color: C.gray, charSpacing: 2 })
    slide.addText(m.val, { x: 0.65 + i * 3.2, y: 5.88, w: 2.7, h: 0.65, fontSize: 26, color: C.white, bold: true })
    if (m.delta && m.delta !== '—') {
      slide.addText(m.delta, { x: 0.65 + i * 3.2, y: 6.55, w: 2.7, h: 0.25, fontSize: 9, color: m.up ? C.green : C.red, bold: true })
    }
  })
  slide.addText('FOR INTERNAL USE ONLY', { x: 0.5, y: 7.18, w: 10, h: 0.22, fontSize: 7, color: '444444', italic: true })
}

function addExecutiveSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, prevLabel: string,
  current: WeekData, prev: WeekData | null, data: ExportData, note: string) {
  const slide = baseSlide(pptx, bgUrl, logoUrl)
  sectionHeader(slide, 'RESUMEN EJECUTIVO', `${restName} · ${weekLabel}${prev ? ' vs ' + prevLabel : ''}`)

  const sC = safeN(current?.sales?.net_sales), sP = safeN(prev?.sales?.net_sales)
  const lC = safeN(current?.labor?.total_pay), lP = safeN(prev?.labor?.total_pay)
  const cC = safeN(current?.cogs?.total), cP = safeN(prev?.cogs?.total)
  const wC = safeN(current?.waste?.total_cost), wP = safeN(prev?.waste?.total_cost)
  const oC = safeN(current?.sales?.orders), oP = safeN(prev?.sales?.orders)
  const gC = safeN(current?.sales?.guests), gP = safeN(prev?.sales?.guests)
  const prC = sC - lC - cC, prP = sP - lP - cP
  const lpC = sC > 0 ? lC / sC * 100 : 0, lpP = sP > 0 ? lP / sP * 100 : 0
  const cpC = sC > 0 ? cC / sC * 100 : 0, cpP = sP > 0 ? cP / sP * 100 : 0
  const ppC = sC > 0 ? prC / sC * 100 : 0
  const agC = gC > 0 ? sC / gC : 0, agP = gP > 0 ? sP / gP : 0

  kpiBox(slide, 0.25, 1.0, 3.1, 1.5, 'Ventas Netas', fmt$(sC), `${oC} órdenes`, prev ? delta$(sC, sP) : '', deltaColor(sC, sP))
  kpiBox(slide, 3.5, 1.0, 3.1, 1.5, 'Profit', fmt$(prC), fmtPct(ppC) + ' margen', prev ? delta$(prC, prP) : '', deltaColor(prC, prP))
  kpiBox(slide, 6.75, 1.0, 3.1, 1.5, '% Labor', fmtPct(lpC), fmt$(lC), prev ? deltaPct(lpC, lpP) : '', deltaColor(lpC, lpP, true))
  kpiBox(slide, 10.0, 1.0, 3.1, 1.5, '% COGS', fmtPct(cpC), fmt$(cC), prev ? deltaPct(cpC, cpP) : '', deltaColor(cpC, cpP, true))

  kpiBox(slide, 0.25, 2.65, 2.3, 1.3, 'Avg/Guest', agC > 0 ? '$' + agC.toFixed(2) : '—', `${gC} comensales`, prev && agP > 0 ? (agC > agP ? '▲ +$' : '▼ -$') + Math.abs(agC - agP).toFixed(2) : '', deltaColor(agC, agP))
  kpiBox(slide, 2.7, 2.65, 2.3, 1.3, 'Órdenes', oC.toString(), 'total semana', prev ? delta$(oC, oP) : '', deltaColor(oC, oP))
  kpiBox(slide, 5.15, 2.65, 2.3, 1.3, 'Waste $', fmt$(wC), 'merma', prev ? delta$(wC, wP) : '', deltaColor(wC, wP, true))

  // Trend table
  if (data.weeks.length > 1) {
    panel(slide, 7.7, 2.55, 5.35, 4.55, 55)
    slide.addText('TENDENCIA SEMANAL', { x: 7.9, y: 2.65, w: 5, h: 0.3, fontSize: 8, color: C.gray, charSpacing: 2 })
    compRow(slide, 7.7, 3.05, 5.35, 'SEMANA', 'VENTAS', '% LABOR', 'PROFIT', C.gray, true)
    const recentWeeks = data.weeks.slice(-6)
    recentWeeks.forEach((w, i) => {
      const ws = safeN(w.sales?.net_sales), wl = safeN(w.labor?.total_pay), wc = safeN(w.cogs?.total)
      const wp = ws - wl - wc
      const wlp = ws > 0 ? wl / ws * 100 : 0
      const prevWs = i > 0 ? safeN(recentWeeks[i - 1].sales?.net_sales) : 0
      const isLast = i === recentWeeks.length - 1
      if (isLast) slide.addShape('rect', { x: 7.7, y: 3.45 + i * 0.38, w: 5.35, h: 0.38, fill: { color: '1A3A1A', transparency: 40 }, line: { color: C.green, transparency: 60 } })
      compRow(slide, 7.7, 3.45 + i * 0.38, 5.35, w.week.replace('2026-', ''), fmt$(ws), fmtPct(wlp), fmt$(wp), wp >= 0 ? C.green : C.red)
    })
  }

  // Comparison summary
  if (prev) {
    panel(slide, 0.25, 4.1, 7.3, 2.85, 55)
    slide.addText(`${weekLabel.replace('2026-','')} vs ${prevLabel.replace('2026-','')}`, { x: 0.45, y: 4.2, w: 7, h: 0.3, fontSize: 9, color: C.gray, charSpacing: 2 })
    compRow(slide, 0.25, 4.55, 7.3, 'MÉTRICA', weekLabel.replace('2026-',''), prevLabel.replace('2026-',''), 'Δ', C.gray, true)
    const rows: [string, string, string, string, string][] = [
      ['Ventas Netas', fmt$(sC), fmt$(sP), delta$(sC, sP), deltaColor(sC, sP)],
      ['Labor $', fmt$(lC), fmt$(lP), delta$(lC, lP), deltaColor(lC, lP, true)],
      ['% Labor', fmtPct(lpC), fmtPct(lpP), deltaPct(lpC, lpP), deltaColor(lpC, lpP, true)],
      ['COGS $', fmt$(cC), fmt$(cP), delta$(cC, cP), deltaColor(cC, cP, true)],
      ['Profit $', fmt$(prC), fmt$(prP), delta$(prC, prP), deltaColor(prC, prP)],
    ]
    rows.forEach((r, i) => compRow(slide, 0.25, 4.93 + i * 0.38, 7.3, r[0], r[1], r[2], r[3], r[4]))
  }

  addNote(slide, note)
}

function addVentasSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, prevLabel: string,
  current: WeekData, prev: WeekData | null, note: string) {
  const slide = baseSlide(pptx, bgUrl, logoUrl)
  sectionHeader(slide, 'VENTAS', `${restName} · ${weekLabel}${prev ? ' vs ' + prevLabel : ''}`)

  const sC = safeN(current?.sales?.net_sales), sP = safeN(prev?.sales?.net_sales)
  const oC = safeN(current?.sales?.orders), oP = safeN(prev?.sales?.orders)
  const gC = safeN(current?.sales?.guests), gP = safeN(prev?.sales?.guests)
  const agC = gC > 0 ? sC / gC : 0, agP = gP > 0 ? sP / gP : 0
  const aoC = oC > 0 ? sC / oC : 0

  kpiBox(slide, 0.25, 1.0, 3.0, 1.5, 'Ventas Netas', fmt$(sC), `${oC} órdenes`, prev ? delta$(sC, sP) : '', deltaColor(sC, sP))
  kpiBox(slide, 3.4, 1.0, 2.5, 1.5, 'Órdenes', oC.toString(), prev ? `vs ${oP}` : '', prev ? delta$(oC, oP) : '', deltaColor(oC, oP))
  kpiBox(slide, 6.0, 1.0, 2.5, 1.5, 'Comensales', gC.toString(), prev ? `vs ${gP}` : '', prev ? delta$(gC, gP) : '', deltaColor(gC, gP))
  kpiBox(slide, 8.6, 1.0, 2.3, 1.5, 'Avg/Guest', agC > 0 ? '$' + agC.toFixed(2) : '—', prev ? `vs $${agP.toFixed(2)}` : '', prev && agP > 0 ? (agC > agP ? '▲ +$' : '▼ -$') + Math.abs(agC - agP).toFixed(2) : '', deltaColor(agC, agP))
  kpiBox(slide, 11.0, 1.0, 2.1, 1.5, 'Avg/Orden', aoC > 0 ? '$' + aoC.toFixed(2) : '—', '', '', C.gray)

  const cats = current?.sales?.categories || []
  const prevCats: Record<string, number> = {}
  if (prev?.sales?.categories) prev.sales.categories.forEach((c: any) => { prevCats[c.name] = safeN(c.net) })

  if (cats.length > 0) {
    panel(slide, 0.25, 2.65, 8.0, 4.55, 55)
    slide.addText('VENTAS POR CATEGORÍA', { x: 0.45, y: 2.73, w: 7.6, h: 0.28, fontSize: 8, color: C.gray, charSpacing: 2 })
    compRow(slide, 0.25, 3.1, 8.0, 'CATEGORÍA', weekLabel.replace('2026-',''), prevLabel.replace('2026-',''), 'Δ', C.gray, true)
    let cy = 3.5
    cats.sort((a: any, b: any) => safeN(b.net) - safeN(a.net)).forEach((cat: any) => {
      const cN = safeN(cat.net), pN = prevCats[cat.name] || 0
      const pct = sC > 0 ? (cN / sC * 100).toFixed(1) + '%' : '—'
      compRow(slide, 0.25, cy, 8.0, `${cat.name}  (${pct})`, fmt$(cN), fmt$(pN), delta$(cN, pN), deltaColor(cN, pN))
      cy += 0.38
    })
    slide.addShape('rect', { x: 0.25, y: cy, w: 8.0, h: 0.38, fill: { color: '1A1A1A', transparency: 30 }, line: { color: '444444', transparency: 40 } })
    compRow(slide, 0.25, cy, 8.0, 'TOTAL', fmt$(sC), fmt$(sP), delta$(sC, sP), deltaColor(sC, sP))
  }

  // Lunch/Dinner
  const ld = current?.sales?.lunch_dinner
  if (ld) {
    panel(slide, 8.45, 2.65, 4.6, 2.5, 55)
    slide.addText('DISTRIBUCIÓN SERVICIO', { x: 8.65, y: 2.73, w: 4.2, h: 0.28, fontSize: 8, color: C.gray, charSpacing: 2 })
    const lunchNet = safeN(ld.lunch?.net), dinnerNet = safeN(ld.dinner?.net)
    const lunchOrd = safeN(ld.lunch?.orders), dinnerOrd = safeN(ld.dinner?.orders)
    panel(slide, 8.55, 3.1, 2.0, 1.8, 65)
    slide.addText('🌞 LUNCH', { x: 8.65, y: 3.18, w: 1.8, h: 0.28, fontSize: 9, color: C.gold })
    slide.addText(fmt$(lunchNet), { x: 8.65, y: 3.46, w: 1.8, h: 0.48, fontSize: 19, color: C.white, bold: true })
    slide.addText(`${lunchOrd} órdenes`, { x: 8.65, y: 3.94, w: 1.8, h: 0.22, fontSize: 9, color: C.gray })
    slide.addText(sC > 0 ? (lunchNet / sC * 100).toFixed(1) + '%' : '', { x: 8.65, y: 4.16, w: 1.8, h: 0.22, fontSize: 8, color: C.gold })
    panel(slide, 10.7, 3.1, 2.0, 1.8, 65)
    slide.addText('🌙 DINNER', { x: 10.8, y: 3.18, w: 1.8, h: 0.28, fontSize: 9, color: C.blue })
    slide.addText(fmt$(dinnerNet), { x: 10.8, y: 3.46, w: 1.8, h: 0.48, fontSize: 19, color: C.white, bold: true })
    slide.addText(`${dinnerOrd} órdenes`, { x: 10.8, y: 3.94, w: 1.8, h: 0.22, fontSize: 9, color: C.gray })
    slide.addText(sC > 0 ? (dinnerNet / sC * 100).toFixed(1) + '%' : '', { x: 10.8, y: 4.16, w: 1.8, h: 0.22, fontSize: 8, color: C.blue })
  }

  addNote(slide, note)
}

function addLaborSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, prevLabel: string,
  current: WeekData, prev: WeekData | null, note: string) {
  const slide = baseSlide(pptx, bgUrl, logoUrl)
  sectionHeader(slide, 'LABOR — POR PUESTO', `${restName} · ${weekLabel}${prev ? ' vs ' + prevLabel : ''}`)

  const sC = safeN(current?.sales?.net_sales), sP = safeN(prev?.sales?.net_sales)
  const lC = safeN(current?.labor?.total_pay), lP = safeN(prev?.labor?.total_pay)
  const hC = safeN(current?.labor?.total_hours), hP = safeN(prev?.labor?.total_hours)
  const otC = safeN(current?.labor?.total_ot_hours), otP = safeN(prev?.labor?.total_ot_hours)
  const lpC = sC > 0 ? lC / sC * 100 : 0, lpP = sP > 0 ? lP / sP * 100 : 0

  kpiBox(slide, 0.25, 1.0, 2.8, 1.5, '% Labor', fmtPct(lpC), fmt$(lC), prev ? deltaPct(lpC, lpP) : '', deltaColor(lpC, lpP, true))
  kpiBox(slide, 3.2, 1.0, 2.5, 1.5, 'Horas Total', hC.toFixed(0) + 'h', prev ? `vs ${hP.toFixed(0)}h` : '', prev ? delta$(hC, hP) : '', deltaColor(hC, hP, true))
  kpiBox(slide, 5.85, 1.0, 2.5, 1.5, 'Costo Labor', fmt$(lC), prev ? `vs ${fmt$(lP)}` : '', prev ? delta$(lC, lP) : '', deltaColor(lC, lP, true))
  if (otC > 0 || otP > 0) kpiBox(slide, 8.5, 1.0, 2.5, 1.5, 'Horas OT ⚠', otC.toFixed(1) + 'h', prev ? `vs ${otP.toFixed(1)}h` : '', otC > 0 ? `⚠ ${otC.toFixed(1)}h OT activo` : '', otC > 0 ? C.orange : C.gray)

  const positions = current?.labor?.by_position || []
  const prevPos: Record<string, any> = {}
  if (prev?.labor?.by_position) prev.labor.by_position.forEach((p: any) => { prevPos[p.position] = p })

  if (positions.length > 0) {
    panel(slide, 0.25, 2.65, 12.85, 4.55, 55)
    if (otC > 0) {
      const otNames = positions.filter((p: any) => safeN(p.ot_hours) > 0).map((p: any) => `${p.position}: ${safeN(p.ot_hours).toFixed(1)}h`).join('  ·  ')
      slide.addText(`⚠  OT: ${otNames}`, { x: 0.45, y: 2.73, w: 12.4, h: 0.26, fontSize: 8.5, color: C.orange, bold: true })
    }
    const hdrY = otC > 0 ? 3.04 : 2.73
    slide.addShape('rect', { x: 0.25, y: hdrY, w: 12.85, h: 0.35, fill: { color: '111111', transparency: 30 }, line: { color: '333333', transparency: 50 } })
    const cols = { p: 0.35, sh: 3.5, so: 5.2, sp: 6.7, ph: 8.4, po: 9.9, pp: 11.1, d: 12.4 }
    const hS = { fontSize: 8, color: C.gray, bold: true }
    slide.addText('PUESTO', { x: cols.p, y: hdrY + 0.09, w: 3.0, h: 0.18, ...hS })
    slide.addText(`${weekLabel.replace('2026-','')}: HRS`, { x: cols.sh, y: hdrY + 0.09, w: 1.5, h: 0.18, ...hS, align: 'right' })
    slide.addText('OT', { x: cols.so, y: hdrY + 0.09, w: 1.3, h: 0.18, ...hS, align: 'right' })
    slide.addText('COSTO', { x: cols.sp, y: hdrY + 0.09, w: 1.5, h: 0.18, ...hS, align: 'right' })
    if (prev) {
      slide.addText(`${prevLabel.replace('2026-','')}: HRS`, { x: cols.ph, y: hdrY + 0.09, w: 1.4, h: 0.18, ...hS, align: 'right' })
      slide.addText('OT', { x: cols.po, y: hdrY + 0.09, w: 1.1, h: 0.18, ...hS, align: 'right' })
      slide.addText('COSTO', { x: cols.pp, y: hdrY + 0.09, w: 1.2, h: 0.18, ...hS, align: 'right' })
      slide.addText('Δ COSTO', { x: cols.d, y: hdrY + 0.09, w: 0.75, h: 0.18, ...hS, align: 'right' })
    }

    let ry = hdrY + 0.38
    positions.slice(0, 9).forEach((pos: any, i: number) => {
      const pp = prevPos[pos.position]
      const hasOT = safeN(pos.ot_hours) > 0
      const payDelta = pp ? safeN(pos.total_pay) - safeN(pp.total_pay) : 0
      slide.addShape('rect', { x: 0.25, y: ry, w: 12.85, h: 0.38, fill: { color: i % 2 === 0 ? '0D0D0D' : '141414', transparency: 70 }, line: { color: '222222', transparency: 60 } })
      if (hasOT) slide.addShape('rect', { x: 0.25, y: ry, w: 0.06, h: 0.38, fill: { color: C.orange, transparency: 0 }, line: { color: '000000', transparency: 100 } })
      const rS = { fontSize: 9.5, color: C.offwhite }
      slide.addText(pos.position, { x: cols.p, y: ry + 0.1, w: 3.0, h: 0.2, ...rS })
      slide.addText(safeN(pos.regular_hours).toFixed(0) + 'h', { x: cols.sh, y: ry + 0.1, w: 1.5, h: 0.2, ...rS, align: 'right' })
      slide.addText(hasOT ? safeN(pos.ot_hours).toFixed(1) + 'h' : '—', { x: cols.so, y: ry + 0.1, w: 1.3, h: 0.2, fontSize: 9.5, color: hasOT ? C.orange : C.darkgray, align: 'right' })
      slide.addText(fmt$(safeN(pos.total_pay)), { x: cols.sp, y: ry + 0.1, w: 1.5, h: 0.2, ...rS, align: 'right' })
      if (prev && pp) {
        slide.addText(safeN(pp.regular_hours).toFixed(0) + 'h', { x: cols.ph, y: ry + 0.1, w: 1.4, h: 0.2, fontSize: 9, color: C.darkgray, align: 'right' })
        slide.addText(safeN(pp.ot_hours) > 0 ? safeN(pp.ot_hours).toFixed(1) + 'h' : '—', { x: cols.po, y: ry + 0.1, w: 1.1, h: 0.2, fontSize: 9, color: C.darkgray, align: 'right' })
        slide.addText(fmt$(safeN(pp.total_pay)), { x: cols.pp, y: ry + 0.1, w: 1.2, h: 0.2, fontSize: 9, color: C.darkgray, align: 'right' })
        const dStr = (payDelta >= 0 ? '▲ +' : '▼ ') + fmt$(Math.abs(payDelta))
        slide.addText(dStr, { x: cols.d, y: ry + 0.1, w: 0.75, h: 0.2, fontSize: 9, color: payDelta > 0 ? C.red : C.green, bold: true, align: 'right' })
      }
      ry += 0.38
    })

    slide.addShape('rect', { x: 0.25, y: ry, w: 12.85, h: 0.42, fill: { color: '1A1A1A', transparency: 30 }, line: { color: '444444', transparency: 40 } })
    const tS = { fontSize: 10, color: C.white, bold: true }
    slide.addText('TOTAL', { x: cols.p, y: ry + 0.11, w: 3.0, h: 0.22, ...tS })
    slide.addText(hC.toFixed(0) + 'h', { x: cols.sh, y: ry + 0.11, w: 1.5, h: 0.22, ...tS, align: 'right' })
    slide.addText(otC > 0 ? otC.toFixed(1) + 'h' : '—', { x: cols.so, y: ry + 0.11, w: 1.3, h: 0.22, fontSize: 10, color: otC > 0 ? C.orange : C.darkgray, bold: true, align: 'right' })
    slide.addText(fmt$(lC), { x: cols.sp, y: ry + 0.11, w: 1.5, h: 0.22, ...tS, align: 'right' })
    if (prev) {
      slide.addText(hP.toFixed(0) + 'h', { x: cols.ph, y: ry + 0.11, w: 1.4, h: 0.22, fontSize: 10, color: C.gray, bold: true, align: 'right' })
      slide.addText(otP > 0 ? otP.toFixed(1) + 'h' : '—', { x: cols.po, y: ry + 0.11, w: 1.1, h: 0.22, fontSize: 10, color: C.darkgray, bold: true, align: 'right' })
      slide.addText(fmt$(lP), { x: cols.pp, y: ry + 0.11, w: 1.2, h: 0.22, fontSize: 10, color: C.gray, bold: true, align: 'right' })
      const td = lC - lP
      slide.addText((td >= 0 ? '▲ +' : '▼ ') + fmt$(Math.abs(td)), { x: cols.d, y: ry + 0.11, w: 0.75, h: 0.22, fontSize: 10, color: td > 0 ? C.red : C.green, bold: true, align: 'right' })
    }
  }
  addNote(slide, note)
}

function addFoodCostSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, prevLabel: string,
  current: WeekData, prev: WeekData | null, note: string) {
  const slide = baseSlide(pptx, bgUrl, logoUrl)
  sectionHeader(slide, 'COSTO DE VENTAS', `${restName} · ${weekLabel}${prev ? ' vs ' + prevLabel : ''}`)

  const sC = safeN(current?.sales?.net_sales), sP = safeN(prev?.sales?.net_sales)
  const cC = safeN(current?.cogs?.total), cP = safeN(prev?.cogs?.total)
  const cpC = sC > 0 ? cC / sC * 100 : 0, cpP = sP > 0 ? cP / sP * 100 : 0

  kpiBox(slide, 0.25, 1.0, 3.0, 1.5, '% COGS Total', fmtPct(cpC), fmt$(cC), prev ? deltaPct(cpC, cpP) : '', deltaColor(cpC, cpP, true))

  const catDefs: Record<string, { label: string; col: string }> = {
    food: { label: 'Food', col: C.orange }, liquor: { label: 'Liquor', col: C.blue },
    beer: { label: 'Beer', col: C.gold }, na_beverage: { label: 'NA Bev', col: C.green },
    wine: { label: 'Wine', col: 'EC4899' }, general: { label: 'General', col: C.gray },
  }
  const cogsCat = current?.cogs?.by_category || {}
  const prevCogsCat = prev?.cogs?.by_category || {}

  let kx = 3.4
  Object.entries(catDefs).forEach(([key, def]) => {
    const val = safeN((cogsCat as any)[key]), prevVal = safeN((prevCogsCat as any)[key])
    if (val === 0 && prevVal === 0) return
    const pctV = sC > 0 ? val / sC * 100 : 0, prevPctV = sP > 0 ? prevVal / sP * 100 : 0
    panel(slide, kx, 1.0, 1.65, 1.5, 58)
    slide.addText(def.label.toUpperCase(), { x: kx + 0.1, y: 1.1, w: 1.45, h: 0.22, fontSize: 7.5, color: def.col, charSpacing: 1 })
    slide.addText(fmtPct(pctV), { x: kx + 0.1, y: 1.3, w: 1.45, h: 0.42, fontSize: 20, color: C.white, bold: true })
    slide.addText(fmt$(val), { x: kx + 0.1, y: 1.72, w: 1.45, h: 0.22, fontSize: 9, color: C.gray })
    if (prev) {
      const d = pctV - prevPctV
      slide.addText((d >= 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1) + 'pp', { x: kx + 0.1, y: 1.95, w: 1.45, h: 0.22, fontSize: 8.5, color: d > 0 ? C.red : C.green, bold: true })
    }
    kx += 1.72
  })

  panel(slide, 0.25, 2.65, 12.85, 4.55, 55)
  slide.addText('DETALLE POR CATEGORÍA', { x: 0.45, y: 2.73, w: 12.4, h: 0.28, fontSize: 8, color: C.gray, charSpacing: 2 })
  const colsF = { cat: 0.35, c$: 3.2, cPct: 5.0, p$: 6.6, pPct: 8.3, d$: 9.9, dPp: 11.4 }
  slide.addShape('rect', { x: 0.25, y: 3.06, w: 12.85, h: 0.35, fill: { color: '111111', transparency: 30 }, line: { color: '333333', transparency: 50 } })
  const hS = { fontSize: 8, color: C.gray, bold: true }
  slide.addText('CATEGORÍA', { x: colsF.cat, y: 3.14, w: 2.7, h: 0.18, ...hS })
  slide.addText(`${weekLabel.replace('2026-','')} $`, { x: colsF.c$, y: 3.14, w: 1.6, h: 0.18, ...hS, align: 'right' })
  slide.addText('% VENTAS', { x: colsF.cPct, y: 3.14, w: 1.4, h: 0.18, ...hS, align: 'right' })
  if (prev) {
    slide.addText(`${prevLabel.replace('2026-','')} $`, { x: colsF.p$, y: 3.14, w: 1.5, h: 0.18, ...hS, align: 'right' })
    slide.addText('% VENTAS', { x: colsF.pPct, y: 3.14, w: 1.5, h: 0.18, ...hS, align: 'right' })
    slide.addText('Δ $', { x: colsF.d$, y: 3.14, w: 1.4, h: 0.18, ...hS, align: 'right' })
    slide.addText('Δ pp', { x: colsF.dPp, y: 3.14, w: 1.3, h: 0.18, ...hS, align: 'right' })
  }

  let ry = 3.45
  Object.entries(catDefs).forEach(([key, def], i) => {
    const val = safeN((cogsCat as any)[key]), prevVal = safeN((prevCogsCat as any)[key])
    if (val === 0 && prevVal === 0) return
    const pctV = sC > 0 ? val / sC * 100 : 0, prevPctV = sP > 0 ? prevVal / sP * 100 : 0
    const dv = val - prevVal, dp = pctV - prevPctV
    slide.addShape('rect', { x: 0.25, y: ry, w: 12.85, h: 0.38, fill: { color: i % 2 === 0 ? '0D0D0D' : '141414', transparency: 70 }, line: { color: '222222', transparency: 60 } })
    slide.addShape('rect', { x: 0.25, y: ry, w: 0.06, h: 0.38, fill: { color: def.col, transparency: 0 }, line: { color: '000000', transparency: 100 } })
    const rS = { fontSize: 9.5, color: C.offwhite }
    slide.addText(def.label, { x: colsF.cat, y: ry + 0.1, w: 2.7, h: 0.2, ...rS })
    slide.addText(fmt$(val), { x: colsF.c$, y: ry + 0.1, w: 1.6, h: 0.2, ...rS, align: 'right' })
    slide.addText(fmtPct(pctV), { x: colsF.cPct, y: ry + 0.1, w: 1.4, h: 0.2, fontSize: 9.5, color: pctV > 30 ? C.red : pctV > 20 ? C.orange : C.green, bold: true, align: 'right' })
    if (prev) {
      slide.addText(fmt$(prevVal), { x: colsF.p$, y: ry + 0.1, w: 1.5, h: 0.2, fontSize: 9, color: C.darkgray, align: 'right' })
      slide.addText(fmtPct(prevPctV), { x: colsF.pPct, y: ry + 0.1, w: 1.5, h: 0.2, fontSize: 9, color: C.darkgray, align: 'right' })
      slide.addText((dv >= 0 ? '▲ +' : '▼ ') + fmt$(Math.abs(dv)), { x: colsF.d$, y: ry + 0.1, w: 1.4, h: 0.2, fontSize: 9, color: dv > 0 ? C.red : C.green, bold: true, align: 'right' })
      slide.addText((dp >= 0 ? '▲ +' : '▼ ') + Math.abs(dp).toFixed(1) + 'pp', { x: colsF.dPp, y: ry + 0.1, w: 1.3, h: 0.2, fontSize: 9, color: dp > 0 ? C.red : C.green, bold: true, align: 'right' })
    }
    ry += 0.38
  })
  slide.addShape('rect', { x: 0.25, y: ry, w: 12.85, h: 0.42, fill: { color: '1A1A1A', transparency: 30 }, line: { color: '444444', transparency: 40 } })
  slide.addText('TOTAL COGS', { x: colsF.cat, y: ry + 0.11, w: 2.7, h: 0.22, fontSize: 10, color: C.white, bold: true })
  slide.addText(fmt$(cC), { x: colsF.c$, y: ry + 0.11, w: 1.6, h: 0.22, fontSize: 10, color: C.white, bold: true, align: 'right' })
  slide.addText(fmtPct(cpC), { x: colsF.cPct, y: ry + 0.11, w: 1.4, h: 0.22, fontSize: 10, color: cpC > 35 ? C.red : C.green, bold: true, align: 'right' })
  if (prev) {
    slide.addText(fmt$(cP), { x: colsF.p$, y: ry + 0.11, w: 1.5, h: 0.22, fontSize: 10, color: C.gray, bold: true, align: 'right' })
    slide.addText(fmtPct(cpP), { x: colsF.pPct, y: ry + 0.11, w: 1.5, h: 0.22, fontSize: 10, color: C.gray, bold: true, align: 'right' })
    const td = cC - cP, tdp = cpC - cpP
    slide.addText((td >= 0 ? '▲ +' : '▼ ') + fmt$(Math.abs(td)), { x: colsF.d$, y: ry + 0.11, w: 1.4, h: 0.22, fontSize: 10, color: td > 0 ? C.red : C.green, bold: true, align: 'right' })
    slide.addText((tdp >= 0 ? '▲ +' : '▼ ') + Math.abs(tdp).toFixed(1) + 'pp', { x: colsF.dPp, y: ry + 0.11, w: 1.3, h: 0.22, fontSize: 10, color: tdp > 0 ? C.red : C.green, bold: true, align: 'right' })
  }
  addNote(slide, note)
}

function addWasteSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, prevLabel: string,
  current: WeekData, prev: WeekData | null, note: string) {
  const slide = baseSlide(pptx, bgUrl, logoUrl)
  sectionHeader(slide, 'WASTE / MERMA', `${restName} · ${weekLabel}${prev ? ' vs ' + prevLabel : ''}`)

  const wC = safeN(current?.waste?.total_cost), wP = safeN(prev?.waste?.total_cost)
  kpiBox(slide, 0.25, 1.0, 3.0, 1.5, 'Waste Total', fmt$(wC), 'merma registrada', prev ? delta$(wC, wP) : '', deltaColor(wC, wP, true))

  const items = current?.waste?.items || []
  if (items.length > 0) {
    panel(slide, 0.25, 2.65, 12.85, 4.55, 55)
    slide.addText('ITEMS DE MERMA', { x: 0.45, y: 2.73, w: 12.4, h: 0.28, fontSize: 8, color: C.gray, charSpacing: 2 })
    slide.addShape('rect', { x: 0.25, y: 3.06, w: 12.85, h: 0.35, fill: { color: '111111', transparency: 30 }, line: { color: '333333', transparency: 50 } })
    const hS = { fontSize: 8, color: C.gray, bold: true }
    slide.addText('ITEM', { x: 0.35, y: 3.14, w: 4.5, h: 0.18, ...hS })
    slide.addText('CANT.', { x: 4.9, y: 3.14, w: 1.5, h: 0.18, ...hS, align: 'right' })
    slide.addText('COSTO $', { x: 6.5, y: 3.14, w: 1.5, h: 0.18, ...hS, align: 'right' })
    slide.addText('RAZÓN', { x: 8.1, y: 3.14, w: 2.5, h: 0.18, ...hS })
    slide.addText('EMPLEADO', { x: 10.7, y: 3.14, w: 2.2, h: 0.18, ...hS })
    items.slice(0, 10).forEach((item: any, i: number) => {
      const ry = 3.45 + i * 0.38
      slide.addShape('rect', { x: 0.25, y: ry, w: 12.85, h: 0.38, fill: { color: i % 2 === 0 ? '0D0D0D' : '141414', transparency: 70 }, line: { color: '222222', transparency: 60 } })
      const itemName = item.item_name || item.name || '—'
      slide.addText(itemName, { x: 0.35, y: ry + 0.1, w: 4.5, h: 0.2, fontSize: 9.5, color: C.offwhite })
      slide.addText(`${safeN(item.quantity).toFixed(1)} ${item.unit || ''}`, { x: 4.9, y: ry + 0.1, w: 1.5, h: 0.2, fontSize: 9.5, color: C.offwhite, align: 'right' })
      slide.addText(fmt$(safeN(item.cost)), { x: 6.5, y: ry + 0.1, w: 1.5, h: 0.2, fontSize: 9.5, color: C.red, bold: true, align: 'right' })
      slide.addText(item.reason || '—', { x: 8.1, y: ry + 0.1, w: 2.5, h: 0.2, fontSize: 9, color: C.gray })
      slide.addText(item.employee_name || '—', { x: 10.7, y: ry + 0.1, w: 2.2, h: 0.2, fontSize: 9, color: C.gray })
    })
  }
  addNote(slide, note)
}

function addEmployeeSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, prevLabel: string,
  current: WeekData, prev: WeekData | null, note: string) {
  const slide = baseSlide(pptx, bgUrl, logoUrl)
  sectionHeader(slide, 'EMPLOYEE PERFORMANCE', `${restName} · ${weekLabel}`)

  const emps = (current?.employee?.employees || []).filter((e: any) => safeN(e.net_sales) > 0 && safeN(e.total_labor_hours) > 0)
  const prevEmps: Record<string, any> = {}
  if (prev?.employee?.employees) prev.employee.employees.forEach((e: any) => { prevEmps[e.name] = e })

  if (emps.length === 0) {
    slide.addText('Sin datos de employee performance para esta semana', { x: 0.5, y: 3.5, w: 12, h: 0.6, fontSize: 16, color: C.gray, align: 'center' })
    return
  }

  const sorted = [...emps].sort((a: any, b: any) => safeN(b.net_sales_per_hour) - safeN(a.net_sales_per_hour))
  panel(slide, 0.25, 1.0, 12.85, 6.45, 55)
  slide.addShape('rect', { x: 0.25, y: 1.0, w: 12.85, h: 0.38, fill: { color: '111111', transparency: 30 }, line: { color: '333333', transparency: 50 } })
  const cols = { n: 0.35, s: 3.5, sph: 5.2, ag: 6.7, ao: 8.0, h: 9.2, o: 10.3, d: 11.5 }
  const hS = { fontSize: 8, color: C.gray, bold: true }
  slide.addText('EMPLEADO', { x: cols.n, y: 1.08, w: 3.0, h: 0.2, ...hS })
  slide.addText('VENTAS', { x: cols.s, y: 1.08, w: 1.5, h: 0.2, ...hS, align: 'right' })
  slide.addText('$/HORA', { x: cols.sph, y: 1.08, w: 1.3, h: 0.2, ...hS, align: 'right' })
  slide.addText('$/COMENSAL', { x: cols.ag, y: 1.08, w: 1.2, h: 0.2, ...hS, align: 'right' })
  slide.addText('TKT PROM.', { x: cols.ao, y: 1.08, w: 1.1, h: 0.2, ...hS, align: 'right' })
  slide.addText('HORAS', { x: cols.h, y: 1.08, w: 1.0, h: 0.2, ...hS, align: 'right' })
  slide.addText('ÓRDENES', { x: cols.o, y: 1.08, w: 1.1, h: 0.2, ...hS, align: 'right' })
  if (prev) slide.addText('Δ VENTAS', { x: cols.d, y: 1.08, w: 1.5, h: 0.2, ...hS, align: 'right' })

  sorted.slice(0, 14).forEach((e: any, i: number) => {
    const pe = prevEmps[e.name]
    const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''
    const ry = 1.42 + i * 0.38
    slide.addShape('rect', { x: 0.25, y: ry, w: 12.85, h: 0.38, fill: { color: i % 2 === 0 ? '0D0D0D' : '141414', transparency: 70 }, line: { color: '222222', transparency: 60 } })
    const rS = { fontSize: 9.5, color: C.offwhite }
    slide.addText(medal + e.name, { x: cols.n, y: ry + 0.1, w: 3.0, h: 0.2, ...rS })
    slide.addText(fmt$(safeN(e.net_sales)), { x: cols.s, y: ry + 0.1, w: 1.5, h: 0.2, ...rS, align: 'right' })
    slide.addText('$' + safeN(e.net_sales_per_hour).toFixed(2), { x: cols.sph, y: ry + 0.1, w: 1.3, h: 0.2, fontSize: 9.5, color: C.blue, bold: true, align: 'right' })
    slide.addText('$' + safeN(e.avg_net_sales_per_guest).toFixed(2), { x: cols.ag, y: ry + 0.1, w: 1.2, h: 0.2, ...rS, align: 'right' })
    slide.addText('$' + safeN(e.avg_order_value).toFixed(2), { x: cols.ao, y: ry + 0.1, w: 1.1, h: 0.2, ...rS, align: 'right' })
    slide.addText(safeN(e.total_labor_hours).toFixed(1) + 'h', { x: cols.h, y: ry + 0.1, w: 1.0, h: 0.2, fontSize: 9, color: C.gray, align: 'right' })
    slide.addText(String(safeN(e.total_orders)), { x: cols.o, y: ry + 0.1, w: 1.1, h: 0.2, fontSize: 9, color: C.gray, align: 'right' })
    if (prev && pe) {
      const dv = safeN(e.net_sales) - safeN(pe.net_sales)
      slide.addText((dv >= 0 ? '▲ +' : '▼ ') + fmt$(Math.abs(dv)), { x: cols.d, y: ry + 0.1, w: 1.5, h: 0.2, fontSize: 9, color: dv > 0 ? C.green : C.red, bold: true, align: 'right' })
    }
  })
  addNote(slide, note)
}

function addAvtSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, prevLabel: string,
  current: WeekData, prev: WeekData | null, note: string) {
  const slide = baseSlide(pptx, bgUrl, logoUrl)
  sectionHeader(slide, 'ACTUAL VS TEÓRICO', `${restName} · ${weekLabel}`)

  const avt = current?.avt
  if (!avt) {
    slide.addText('Sin datos de AvT para esta semana', { x: 0.5, y: 3.5, w: 12, h: 0.6, fontSize: 16, color: C.gray, align: 'center' })
    return
  }

  const shortage = safeN(avt.total_shortage_dollar), overage = safeN(avt.total_overage_dollar)
  const net = safeN(avt.net_variance)
  const items = avt.all_items || []
  const shortCount = items.filter((i: any) => safeN(i.variance_dollar) > 0).length
  const overCount = items.filter((i: any) => safeN(i.variance_dollar) < 0).length

  kpiBox(slide, 0.25, 1.0, 3.0, 1.5, `🔴 Faltantes (${shortCount})`, fmt$(shortage), 'sobre lo teórico', '', C.red)
  kpiBox(slide, 3.4, 1.0, 3.0, 1.5, `🟢 Sobrantes (${overCount})`, fmt$(overage), 'bajo lo teórico', '', C.green)
  kpiBox(slide, 6.55, 1.0, 3.0, 1.5, 'NETO', fmt$(Math.abs(net)), net > 0 ? 'pérdida neta' : 'ganancia neta', '', net > 0 ? C.red : C.green)

  if (items.length > 0) {
    const sorted = [...items].sort((a: any, b: any) => Math.abs(safeN(b.variance_dollar)) - Math.abs(safeN(a.variance_dollar)))
    const faltantes = sorted.filter((i: any) => safeN(i.variance_dollar) > 0).slice(0, 7)
    const sobrantes = sorted.filter((i: any) => safeN(i.variance_dollar) < 0).slice(0, 7)

    panel(slide, 0.25, 2.65, 6.3, 4.55, 55)
    slide.addText('🔴  TOP FALTANTES', { x: 0.45, y: 2.73, w: 6.0, h: 0.28, fontSize: 9, color: C.red, bold: true })
    slide.addShape('rect', { x: 0.25, y: 3.06, w: 6.3, h: 0.35, fill: { color: '1A0000', transparency: 30 }, line: { color: '333333', transparency: 50 } })
    const hS = { fontSize: 8, color: C.gray, bold: true }
    slide.addText('ARTÍCULO', { x: 0.35, y: 3.14, w: 3.2, h: 0.18, ...hS })
    slide.addText('QTY+', { x: 3.65, y: 3.14, w: 1.0, h: 0.18, ...hS, align: 'right' })
    slide.addText('IMPACTO $', { x: 4.75, y: 3.14, w: 1.6, h: 0.18, ...hS, align: 'right' })

    faltantes.forEach((item: any, i: number) => {
      const ry = 3.45 + i * 0.38
      slide.addShape('rect', { x: 0.25, y: ry, w: 6.3, h: 0.38, fill: { color: i % 2 === 0 ? '120000' : '0D0000', transparency: 70 }, line: { color: '2A0000', transparency: 50 } })
      const name = item.item_name || item.name || '—'
      slide.addText(name, { x: 0.35, y: ry + 0.1, w: 3.2, h: 0.2, fontSize: 9.5, color: C.offwhite })
      slide.addText('+' + safeN(item.variance_qty ?? item.qty_variance ?? 0).toFixed(1), { x: 3.65, y: ry + 0.1, w: 1.0, h: 0.2, fontSize: 9.5, color: C.red, align: 'right' })
      slide.addText('+' + fmt$(Math.abs(safeN(item.variance_dollar))), { x: 4.75, y: ry + 0.1, w: 1.6, h: 0.2, fontSize: 9.5, color: C.red, bold: true, align: 'right' })
      if (item.note) slide.addText('💬 ' + item.note, { x: 0.35, y: ry + 0.27, w: 5.9, h: 0.16, fontSize: 7.5, color: C.orange, italic: true })
    })

    panel(slide, 6.8, 2.65, 6.3, 4.55, 55)
    slide.addText('🟢  TOP SOBRANTES', { x: 7.0, y: 2.73, w: 6.0, h: 0.28, fontSize: 9, color: C.green, bold: true })
    slide.addShape('rect', { x: 6.8, y: 3.06, w: 6.3, h: 0.35, fill: { color: '001A00', transparency: 30 }, line: { color: '333333', transparency: 50 } })
    slide.addText('ARTÍCULO', { x: 6.9, y: 3.14, w: 3.2, h: 0.18, ...hS })
    slide.addText('QTY−', { x: 10.2, y: 3.14, w: 1.0, h: 0.18, ...hS, align: 'right' })
    slide.addText('IMPACTO $', { x: 11.3, y: 3.14, w: 1.6, h: 0.18, ...hS, align: 'right' })

    sobrantes.forEach((item: any, i: number) => {
      const ry = 3.45 + i * 0.38
      slide.addShape('rect', { x: 6.8, y: ry, w: 6.3, h: 0.38, fill: { color: i % 2 === 0 ? '001200' : '000D00', transparency: 70 }, line: { color: '002A00', transparency: 50 } })
      const name = item.item_name || item.name || '—'
      slide.addText(name, { x: 6.9, y: ry + 0.1, w: 3.2, h: 0.2, fontSize: 9.5, color: C.offwhite })
      slide.addText(safeN(item.variance_qty ?? item.qty_variance ?? 0).toFixed(1), { x: 10.2, y: ry + 0.1, w: 1.0, h: 0.2, fontSize: 9.5, color: C.green, align: 'right' })
      slide.addText(fmt$(Math.abs(safeN(item.variance_dollar))), { x: 11.3, y: ry + 0.1, w: 1.6, h: 0.2, fontSize: 9.5, color: C.green, bold: true, align: 'right' })
      if (item.note) slide.addText('💬 ' + item.note, { x: 6.9, y: ry + 0.27, w: 5.9, h: 0.16, fontSize: 7.5, color: C.orange, italic: true })
    })
  }
  addNote(slide, note)
}

function addComprasSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, prevLabel: string,
  current: WeekData, prev: WeekData | null, note: string) {
  const slide = baseSlide(pptx, bgUrl, logoUrl)
  sectionHeader(slide, 'COMPRAS', `${restName} · ${weekLabel}${prev ? ' vs ' + prevLabel : ''}`)

  const rec = (current as any)?.receiving, prevRec = (prev as any)?.receiving
  const totalC = safeN(rec?.total_amount), totalP = safeN(prevRec?.total_amount)
  kpiBox(slide, 0.25, 1.0, 3.0, 1.5, 'Total Compras', fmt$(totalC), '', prev ? delta$(totalC, totalP) : '', deltaColor(totalC, totalP, true))

  const catDefs: Record<string, { label: string; col: string }> = {
    food: { label: 'FOOD', col: C.orange }, liquor: { label: 'LIQUOR', col: C.blue },
    beer: { label: 'BEER', col: C.gold }, na_beverage: { label: 'NA BEV', col: C.green },
    wine: { label: 'WINE', col: 'EC4899' }, general: { label: 'GENERAL', col: C.gray },
  }
  const catTotals = rec?.by_category || {}, prevCatTotals = prevRec?.by_category || {}
  let kx = 3.4
  Object.entries(catDefs).forEach(([key, def]) => {
    const val = safeN(catTotals[key]), pval = safeN(prevCatTotals[key])
    if (val === 0 && pval === 0) return
    panel(slide, kx, 1.0, 1.6, 1.5, 58)
    slide.addText(def.label, { x: kx + 0.1, y: 1.1, w: 1.4, h: 0.22, fontSize: 7.5, color: def.col, charSpacing: 1 })
    slide.addText(fmt$(val), { x: kx + 0.1, y: 1.3, w: 1.4, h: 0.38, fontSize: 16, color: C.white, bold: true })
    if (prev) {
      const d = val - pval
      slide.addText((d >= 0 ? '▲ +' : '▼ ') + fmt$(Math.abs(d)), { x: kx + 0.1, y: 1.68, w: 1.4, h: 0.22, fontSize: 8.5, color: d > 0 ? C.red : C.green, bold: true })
    }
    kx += 1.65
  })

  const vendors = rec?.vendors || [], prevVendors: Record<string, number> = {}
  if (prevRec?.vendors) prevRec.vendors.forEach((v: any) => { prevVendors[v.vendor_name] = safeN(v.total_amount) })

  if (vendors.length > 0) {
    panel(slide, 0.25, 2.65, 12.85, 4.55, 55)
    const headerTxt = `PROVEEDORES — ${weekLabel.replace('2026-','')}:  ${fmt$(totalC)}${prev ? `  →  ${prevLabel.replace('2026-','')}:  ${fmt$(totalP)}  (${totalC > totalP ? '▲ +' : '▼ '}${fmt$(Math.abs(totalC - totalP))})` : ''}`
    slide.addText(headerTxt, { x: 0.45, y: 2.73, w: 12.4, h: 0.28, fontSize: 8.5, color: C.gray })
    slide.addShape('rect', { x: 0.25, y: 3.06, w: 12.85, h: 0.35, fill: { color: '111111', transparency: 30 }, line: { color: '333333', transparency: 50 } })
    const hS = { fontSize: 8, color: C.gray, bold: true }
    slide.addText('PROVEEDOR', { x: 0.35, y: 3.14, w: 5.0, h: 0.18, ...hS })
    slide.addText(`TOTAL ${weekLabel.replace('2026-','')}`, { x: 5.5, y: 3.14, w: 2.5, h: 0.18, ...hS, align: 'right' })
    slide.addText(prev ? `TOTAL ${prevLabel.replace('2026-','')}` : '', { x: 8.1, y: 3.14, w: 2.5, h: 0.18, ...hS, align: 'right' })
    slide.addText('DIFERENCIA', { x: 10.7, y: 3.14, w: 2.2, h: 0.18, ...hS, align: 'right' })

    vendors.sort((a: any, b: any) => safeN(b.total_amount) - safeN(a.total_amount)).slice(0, 11).forEach((v: any, i: number) => {
      const prevV = prevVendors[v.vendor_name] || 0, diff = safeN(v.total_amount) - prevV, isNew = prev && prevV === 0
      const ry = 3.45 + i * 0.38
      slide.addShape('rect', { x: 0.25, y: ry, w: 12.85, h: 0.38, fill: { color: i % 2 === 0 ? '0D0D0D' : '141414', transparency: 70 }, line: { color: '222222', transparency: 60 } })
      slide.addText((isNew ? '★ ' : '') + v.vendor_name, { x: 0.35, y: ry + 0.1, w: 5.0, h: 0.2, fontSize: 9.5, color: C.offwhite })
      slide.addText(fmt$(safeN(v.total_amount)), { x: 5.5, y: ry + 0.1, w: 2.5, h: 0.2, fontSize: 9.5, color: C.offwhite, align: 'right' })
      slide.addText(prev ? (prevV > 0 ? fmt$(prevV) : '—') : '', { x: 8.1, y: ry + 0.1, w: 2.5, h: 0.2, fontSize: 9, color: C.darkgray, align: 'right' })
      if (prev) {
        const dStr = isNew ? '★ Nuevo' : prevV === 0 ? '—' : (diff >= 0 ? '▲ +' : '▼ ') + fmt$(Math.abs(diff))
        slide.addText(dStr, { x: 10.7, y: ry + 0.1, w: 2.2, h: 0.2, fontSize: 9, color: isNew ? C.gold : diff > 0 ? C.red : C.green, bold: true, align: 'right' })
      }
    })

    const ry = 3.45 + Math.min(vendors.length, 11) * 0.38
    slide.addShape('rect', { x: 0.25, y: ry, w: 12.85, h: 0.42, fill: { color: '1A1A1A', transparency: 30 }, line: { color: '444444', transparency: 40 } })
    slide.addText('TOTAL', { x: 0.35, y: ry + 0.11, w: 5.0, h: 0.22, fontSize: 10, color: C.white, bold: true })
    slide.addText(fmt$(totalC), { x: 5.5, y: ry + 0.11, w: 2.5, h: 0.22, fontSize: 10, color: C.white, bold: true, align: 'right' })
    if (prev) {
      slide.addText(fmt$(totalP), { x: 8.1, y: ry + 0.11, w: 2.5, h: 0.22, fontSize: 10, color: C.gray, bold: true, align: 'right' })
      const td = totalC - totalP
      slide.addText((td >= 0 ? '▲ +' : '▼ ') + fmt$(Math.abs(td)), { x: 10.7, y: ry + 0.11, w: 2.2, h: 0.22, fontSize: 10, color: td > 0 ? C.red : C.green, bold: true, align: 'right' })
    }
    slide.addText('★ Proveedor nuevo vs semana anterior', { x: 0.35, y: ry + 0.56, w: 12, h: 0.22, fontSize: 7.5, color: C.darkgray, italic: true })
  }
  addNote(slide, note)
}

function addKitchenSlide(pptx: any, bgUrl: string, logoUrl: string,
  restName: string, weekLabel: string, current: WeekData, note: string) {
  const slide = baseSlide(pptx, bgUrl, logoUrl)
  sectionHeader(slide, 'KITCHEN PERFORMANCE', `${restName} · ${weekLabel}`)
  const kitchen = current?.kitchen
  const tickets = kitchen?.tickets || []
  if (tickets.length === 0) {
    slide.addText('Sin datos de kitchen performance para esta semana', { x: 0.5, y: 3.5, w: 12, h: 0.6, fontSize: 16, color: C.gray, align: 'center' })
    return
  }
  const avgTime = tickets.reduce((s: number, t: any) => s + safeN(t.total_time_seconds), 0) / tickets.length
  const under10 = tickets.filter((t: any) => safeN(t.total_time_seconds) <= 600).length
  const pct10 = tickets.length > 0 ? (under10 / tickets.length * 100) : 0
  kpiBox(slide, 0.25, 1.0, 2.8, 1.5, 'Total Tickets', tickets.length.toString(), 'semana', '', C.white)
  kpiBox(slide, 3.2, 1.0, 2.8, 1.5, 'Tiempo Prom.', (avgTime / 60).toFixed(1) + ' min', 'por ticket', '', avgTime > 900 ? C.red : avgTime > 600 ? C.orange : C.green)
  kpiBox(slide, 6.15, 1.0, 2.8, 1.5, '% en Meta (<10min)', pct10.toFixed(1) + '%', `${under10} tickets en meta`, '', pct10 >= 80 ? C.green : pct10 >= 60 ? C.orange : C.red)
  addNote(slide, note)
}