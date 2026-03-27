// generate-pptx.ts — v4
// Dashboard style: KPIs grandes + gráficas SVG + tablas
// Siempre: semana actual vs semana anterior
// Fondo #2D3548, header oscuro, sin template literals anidados

import type { ExportConfig, ExportData, WeekData } from './data-fetcher'
import { fmt$, fmtPct, safeN } from './data-fetcher'

// ── Colores ───────────────────────────────────────────────────────────────────
const BG    = '2D3548'
const HDR   = '1E2530'
const ROW_A = '252D3D'
const ROW_B = '1E2530'
const ROW_H = '141B27'
const KBIG  = '1A2236'
const WHITE = 'FFFFFF'
const OFF   = 'D1D5DB'
const GRAY  = '6B7280'
const DGRAY = '374151'
const GREEN = '22C55E'
const RED   = 'EF4444'
const ORANGE= 'F97316'
const GOLD  = 'F5C842'
const BLUE  = '60A5FA'
const PURPLE= '8B5CF6'
const PINK  = 'EC4899'
const ALERT = '7F1D1D'

function n(v: any): number { return safeN(v) }
function wL(w: string) { return w.replace('2026-','').replace('2025-','') }
function d$(c: number, p: number): string { const d=c-p; return (d>=0?'+':'')+fmt$(d) }
function dPp(c: number, p: number): string { const d=c-p; return (d>=0?'+':'')+d.toFixed(1)+'pp' }
function dC(c: number, p: number, bad=false): string {
  if(!p) return GRAY; return bad?(c>p?RED:GREEN):(c>p?GREEN:RED)
}

// ── SVG bar chart ─────────────────────────────────────────────────────────────
function svgBarChart(labels: string[], values: number[], barColor: string, w=540, h=150, prefix='$'): string {
  const max = Math.max(...values.map(Math.abs), 1)
  const count = labels.length
  const padL = 30, padR = 10, padT = 20, padB = 28
  const chartW = w - padL - padR
  const chartH = h - padT - padB
  const bw = Math.floor(chartW / count) - 6

  const bars = labels.map((lbl, i) => {
    const v = values[i] || 0
    const bh = Math.max(3, Math.round(Math.abs(v) / max * chartH))
    const x = padL + i * (chartW / count) + 3
    const y = padT + chartH - bh
    const valTxt = prefix === '$' ? fmt$(v) : v.toFixed(1)+'%'
    const col = v < 0 ? RED : barColor
    return '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="3" fill="#'+col+'"/>'+
      '<text x="'+(x+bw/2)+'" y="'+(y-4)+'" text-anchor="middle" font-size="9" fill="#'+OFF+'">'+valTxt+'</text>'+
      '<text x="'+(x+bw/2)+'" y="'+(h-6)+'" text-anchor="middle" font-size="9" fill="#'+GRAY+'">'+lbl+'</text>'
  }).join('\n')

  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">' +
    '<rect width="'+w+'" height="'+h+'" fill="#'+KBIG+'" rx="4"/>' +
    '<line x1="'+padL+'" y1="'+(padT+chartH)+'" x2="'+(w-padR)+'" y2="'+(padT+chartH)+'" stroke="#'+DGRAY+'" stroke-width="1"/>' +
    bars + '</svg>'
}

// ── SVG line chart ─────────────────────────────────────────────────────────────
function svgLineChart(labels: string[], series: {values: number[]; color: string; label: string}[], w=540, h=150, suffix='%'): string {
  const allVals = series.flatMap(s => s.values).filter(v => !isNaN(v))
  const max = Math.max(...allVals, 1)
  const min = Math.min(...allVals, 0)
  const range = max - min || 1
  const padL=40, padR=10, padT=15, padB=35
  const chartW = w - padL - padR
  const chartH = h - padT - padB

  function px(i: number) { return padL + (labels.length > 1 ? i / (labels.length-1) * chartW : chartW/2) }
  function py(v: number) { return padT + (1 - (v - min) / range) * chartH }

  const yLines = [0, 0.5, 1].map(t => {
    const v = min + t * range
    const y = py(v)
    const txt = suffix === '%' ? v.toFixed(1)+'%' : fmt$(v)
    return '<line x1="'+padL+'" y1="'+y+'" x2="'+(w-padR)+'" y2="'+y+'" stroke="#'+DGRAY+'" stroke-width="0.5" stroke-dasharray="3,3"/>'+
      '<text x="'+(padL-4)+'" y="'+(y+3)+'" text-anchor="end" font-size="7" fill="#'+GRAY+'">'+txt+'</text>'
  }).join('\n')

  const lines = series.map(s => {
    const pts = s.values.map((v,i)=>px(i)+','+py(v)).join(' ')
    const dots = s.values.map((v,i)=>'<circle cx="'+px(i)+'" cy="'+py(v)+'" r="3" fill="#'+s.color+'"/>').join('')
    return '<polyline points="'+pts+'" fill="none" stroke="#'+s.color+'" stroke-width="2"/>'+dots
  }).join('\n')

  const xLabels = labels.map((l,i)=>'<text x="'+px(i)+'" y="'+(h-padB+14)+'" text-anchor="middle" font-size="8" fill="#'+GRAY+'">'+l+'</text>').join('\n')

  const legend = series.map((s,i)=>
    '<rect x="'+(padL+i*110)+'" y="'+(h-14)+'" width="8" height="8" fill="#'+s.color+'" rx="2"/>'+
    '<text x="'+(padL+i*110+11)+'" y="'+(h-7)+'" font-size="8" fill="#'+OFF+'">'+s.label+'</text>'
  ).join('\n')

  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">' +
    '<rect width="'+w+'" height="'+h+'" fill="#'+KBIG+'" rx="4"/>' +
    yLines + lines + xLabels + legend + '</svg>'
}

// ── SVG donut chart ────────────────────────────────────────────────────────────
function svgDonut(segments: {value: number; color: string}[], w=200, h=200): string {
  const total = segments.reduce((s,sg)=>s+sg.value,0)||1
  const cx=w/2, cy=h/2, r=Math.min(cx,cy)-15, ri=r*0.55
  let angle = -Math.PI/2
  const paths = segments.map(sg => {
    const a = (sg.value/total)*Math.PI*2
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle)
    const x2=cx+r*Math.cos(angle+a), y2=cy+r*Math.sin(angle+a)
    const xi1=cx+ri*Math.cos(angle), yi1=cy+ri*Math.sin(angle)
    const xi2=cx+ri*Math.cos(angle+a), yi2=cy+ri*Math.sin(angle+a)
    const large=a>Math.PI?1:0
    const d='M '+x1+' '+y1+' A '+r+' '+r+' 0 '+large+' 1 '+x2+' '+y2+' L '+xi2+' '+yi2+' A '+ri+' '+ri+' 0 '+large+' 0 '+xi1+' '+yi1+' Z'
    angle+=a
    return '<path d="'+d+'" fill="#'+sg.color+'" stroke="#'+BG+'" stroke-width="1.5"/>'
  }).join('\n')
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="'+w+'" height="'+h+'" fill="#'+KBIG+'" rx="4"/>'+paths+'</svg>'
}

// ── Base slide ────────────────────────────────────────────────────────────────
function base(pptx: any, logoUrl?: string): any {
  const slide = pptx.addSlide()
  slide.addShape('rect', { x:0, y:0, w:13.33, h:7.5, fill:{color:BG}, line:{color:BG} })
  if(logoUrl) {
    slide.addImage({ path:logoUrl, x:11.1, y:6.75, w:2.0, h:0.62, sizing:{type:'contain',w:2.0,h:0.62} })
  }
  slide.addText('FOR INTERNAL USE ONLY', { x:0.3, y:7.22, w:10, h:0.2, fontSize:7, color:DGRAY, italic:true })
  return slide
}

function hdr(slide: any, title: string, alert: string, sub: string) {
  slide.addShape('rect', { x:0, y:0, w:13.33, h:0.7, fill:{color:HDR}, line:{color:HDR} })
  slide.addText(title, { x:0.3, y:0.06, w:6, h:0.58, fontSize:24, color:WHITE, bold:true, fontFace:'Arial Black' })
  if(alert) {
    slide.addShape('rect', { x:6.5, y:0.09, w:6.6, h:0.52, fill:{color:ALERT}, line:{color:ALERT} })
    slide.addText(alert, { x:6.6, y:0.1, w:6.4, h:0.5, fontSize:8.5, color:'FCA5A5', bold:true, align:'center', valign:'middle' })
  } else {
    slide.addText(sub, { x:6.5, y:0.18, w:6.6, h:0.36, fontSize:9.5, color:GRAY, align:'right' })
  }
}

function subHdr(slide: any, txt: string) {
  slide.addText(txt, { x:0.3, y:0.7, w:10, h:0.25, fontSize:8.5, color:GOLD })
}

function kpi(slide: any, x: number, y: number, w: number, h: number,
  label: string, value: string, sub: string, delta: string, deltaColor: string) {
  slide.addShape('rect', { x, y, w, h, fill:{color:KBIG}, line:{color:BG} })
  slide.addText(label, { x:x+0.12, y:y+0.08, w:w-0.2, h:0.18, fontSize:7.5, color:GRAY, charSpacing:1.5 })
  slide.addText(value, { x:x+0.12, y:y+0.24, w:w-0.2, h:0.52, fontSize:24, color:WHITE, bold:true })
  if(sub) slide.addText(sub, { x:x+0.12, y:y+0.74, w:w-0.2, h:0.18, fontSize:8, color:GRAY })
  if(delta && delta !== '—') slide.addText(delta, { x:x+0.12, y:y+0.92, w:w-0.2, h:0.18, fontSize:9, color:deltaColor, bold:true })
}

async function svgImg(slide: any, svgStr: string, x: number, y: number, w: number, h: number) {
  try {
    const b64 = Buffer.from(svgStr).toString('base64')
    slide.addImage({ data:'data:image/svg+xml;base64,'+b64, x, y, w, h })
  } catch(_) {}
}

function tHdr(slide: any, x: number, y: number, w: number, cols: {label:string;w:number;align?:string}[]) {
  slide.addShape('rect', { x, y, w, h:0.28, fill:{color:ROW_H}, line:{color:BG} })
  let cx = x + 0.1
  cols.forEach(c => {
    slide.addText(c.label, { x:cx, y:y+0.06, w:c.w-0.08, h:0.18, fontSize:7, color:GRAY, bold:true, align:(c.align as any)||'left' })
    cx += c.w
  })
}

function tRow(slide: any, x: number, y: number, w: number, i: number,
  cells: {text:string;w:number;align?:string;color?:string;bold?:boolean;fs?:number}[]) {
  slide.addShape('rect', { x, y, w, h:0.32, fill:{color:i%2===0?ROW_A:ROW_B}, line:{color:BG} })
  let cx = x + 0.1
  cells.forEach(c => {
    slide.addText(c.text, { x:cx, y:y+0.08, w:c.w-0.06, h:0.18,
      fontSize:c.fs||8.5, color:c.color||OFF, bold:c.bold||false, align:(c.align as any)||'left' })
    cx += c.w
  })
}

function tTotal(slide: any, x: number, y: number, w: number, cells: {text:string;w:number;align?:string;color?:string}[]) {
  slide.addShape('rect', { x, y, w, h:0.34, fill:{color:ROW_H}, line:{color:BG} })
  let cx = x + 0.1
  cells.forEach(c => {
    slide.addText(c.text, { x:cx, y:y+0.09, w:c.w-0.06, h:0.18,
      fontSize:9, color:c.color||WHITE, bold:true, align:(c.align as any)||'left' })
    cx += c.w
  })
}

function addNote(slide: any, note: string) {
  if(!note) return
  slide.addShape('rect', { x:0.3, y:6.78, w:12.7, h:0.42, fill:{color:'78350F',transparency:20}, line:{color:'D97706'} })
  slide.addText('📝 '+note, { x:0.5, y:6.82, w:12.3, h:0.34, fontSize:8.5, color:'FDE68A', italic:true })
}

// ══════════════════════════════════════════════════════════════════════════════
// COVER
// ══════════════════════════════════════════════════════════════════════════════
function addCover(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null) {
  const slide = pptx.addSlide()
  slide.addShape('rect', { x:0, y:0, w:13.33, h:7.5, fill:{color:BG}, line:{color:BG} })
  slide.addShape('rect', { x:0, y:0, w:13.33, h:0.06, fill:{color:GOLD}, line:{color:GOLD} })
  if(logoUrl) {
    slide.addImage({ path:logoUrl, x:3.5, y:1.5, w:6.33, h:2.8, sizing:{type:'contain',w:6.33,h:2.8} })
  } else {
    slide.addText(restName.toUpperCase(), { x:1, y:2.0, w:11.33, h:1.5,
      fontSize:52, color:WHITE, bold:true, fontFace:'Arial Black', align:'center' })
  }
  slide.addText('REPORTE SEMANAL', { x:1, y:4.5, w:11.33, h:0.38, fontSize:11, color:GRAY, charSpacing:6, align:'center' })
  slide.addText(cur.week, { x:1, y:4.9, w:11.33, h:0.5, fontSize:24, color:GOLD, align:'center', bold:true })
  if(prev) slide.addText('vs '+prev.week, { x:1, y:5.45, w:11.33, h:0.35, fontSize:13, color:GRAY, align:'center' })

  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const lC=n(cur?.labor?.total_pay), cC=n(cur?.cogs?.total)
  const lPct=sC>0?lC/sC*100:0, cPct=sC>0?cC/sC*100:0, profit=sC-lC-cC
  const metrics=[
    {l:'VENTAS NETAS',v:fmt$(sC),d:prev?d$(sC,sP):'',dc:dC(sC,sP)},
    {l:'% LABOR',v:fmtPct(lPct),d:'',dc:GRAY},
    {l:'% COGS',v:fmtPct(cPct),d:'',dc:GRAY},
    {l:'PROFIT',v:fmt$(profit),d:'',dc:profit>=0?GREEN:RED},
  ]
  metrics.forEach((m,i)=>{
    const mx=0.4+i*3.2
    slide.addShape('rect', { x:mx, y:6.05, w:3.05, h:1.18, fill:{color:KBIG}, line:{color:BG} })
    slide.addText(m.l, { x:mx+0.12, y:6.12, w:2.8, h:0.2, fontSize:7.5, color:GRAY, charSpacing:1.5 })
    slide.addText(m.v, { x:mx+0.12, y:6.3, w:2.8, h:0.44, fontSize:22, color:WHITE, bold:true })
    if(m.d&&m.d!=='—') slide.addText(m.d, { x:mx+0.12, y:6.76, w:2.8, h:0.22, fontSize:9, color:m.dc, bold:true })
  })
  slide.addText('FOR INTERNAL USE ONLY', { x:0.3, y:7.22, w:10, h:0.2, fontSize:7, color:DGRAY, italic:true })
}

// ══════════════════════════════════════════════════════════════════════════════
// RESUMEN EJECUTIVO
// ══════════════════════════════════════════════════════════════════════════════
async function addEjecutivo(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const lC=n(cur?.labor?.total_pay), lP=n(prev?.labor?.total_pay)
  const cC=n(cur?.cogs?.total), cP=n(prev?.cogs?.total)
  const wC=n(cur?.waste?.total_cost), wP=n(prev?.waste?.total_cost)
  const prC=sC-lC-cC, prP=sP-lP-cP
  const lpC=sC>0?lC/sC*100:0, lpP=sP>0?lP/sP*100:0
  const cpC=sC>0?cC/sC*100:0, cpP=sP>0?cP/sP*100:0
  const gC=n(cur?.sales?.guests), agC=gC>0?sC/gC:0
  const oC=n(cur?.sales?.orders)

  const alert = prev ? wL(prev.week)+': '+fmt$(sP)+'  →  '+wL(cur.week)+': '+fmt$(sC)+'  ('+d$(sC,sP)+')' : ''
  hdr(slide, 'RESUMEN EJECUTIVO', alert, restName+' · '+wL(cur.week))
  subHdr(slide, prev ? wL(prev.week)+' VS '+wL(cur.week) : wL(cur.week))

  const kW=13.33/6
  kpi(slide,0,      1.0,kW,1.3,'VENTAS NETAS',fmt$(sC),fmt$(oC)+' órdenes',prev?d$(sC,sP):'',dC(sC,sP))
  kpi(slide,kW,     1.0,kW,1.3,'PROFIT',fmt$(prC),sC>0?fmtPct(prC/sC*100):'—',prev?d$(prC,prP):'',dC(prC,prP))
  kpi(slide,kW*2,   1.0,kW,1.3,'% LABOR',fmtPct(lpC),fmt$(lC),prev?dPp(lpC,lpP):'',dC(lpC,lpP,true))
  kpi(slide,kW*3,   1.0,kW,1.3,'% COGS',fmtPct(cpC),fmt$(cC),prev?dPp(cpC,cpP):'',dC(cpC,cpP,true))
  kpi(slide,kW*4,   1.0,kW,1.3,'WASTE $',fmt$(wC),'',prev?d$(wC,wP):'',dC(wC,wP,true))
  kpi(slide,kW*5,   1.0,kW,1.3,'AVG/GUEST',agC>0?'$'+agC.toFixed(2):'—',String(gC)+' guests','',GRAY)

  // Charts
  const hist=data.weeks.slice(-6)
  const svgSales=svgBarChart(hist.map(w=>wL(w.week)), hist.map(w=>n(w.sales?.net_sales)), BLUE, 430, 145)
  await svgImg(slide, svgSales, 0.15, 2.4, 5.8, 1.95)

  const histLP=hist.map(w=>{ const s=n(w.sales?.net_sales); return s>0?n(w.labor?.total_pay)/s*100:0 })
  const histCP=hist.map(w=>{ const s=n(w.sales?.net_sales); return s>0?n(w.cogs?.total)/s*100:0 })
  const svgPcts=svgLineChart(hist.map(w=>wL(w.week)),[
    {values:histLP,color:ORANGE,label:'% Labor'},
    {values:histCP,color:BLUE,label:'% COGS'},
  ], 430, 145, '%')
  await svgImg(slide, svgPcts, 6.1, 2.4, 5.8, 1.95)

  if(prev) {
    const TX=0.15, TW=13.03
    const cW=[3.5,2.3,2.3,2.5,2.43]
    tHdr(slide, TX, 4.45, TW, [
      {label:'MÉTRICA',w:cW[0]},{label:wL(cur.week),w:cW[1],align:'right'},
      {label:wL(prev.week),w:cW[2],align:'right'},{label:'Δ',w:cW[3],align:'right'},
      {label:'',w:cW[4]},
    ])
    const rows:[string,string,string,string,string][]=[
      ['Ventas Netas',fmt$(sC),fmt$(sP),d$(sC,sP),dC(sC,sP)],
      ['Labor $',fmt$(lC),fmt$(lP),d$(lC,lP),dC(lC,lP,true)],
      ['% Labor',fmtPct(lpC),fmtPct(lpP),dPp(lpC,lpP),dC(lpC,lpP,true)],
      ['COGS $',fmt$(cC),fmt$(cP),d$(cC,cP),dC(cC,cP,true)],
      ['% COGS',fmtPct(cpC),fmtPct(cpP),dPp(cpC,cpP),dC(cpC,cpP,true)],
      ['Waste $',fmt$(wC),fmt$(wP),d$(wC,wP),dC(wC,wP,true)],
      ['Profit $',fmt$(prC),fmt$(prP),d$(prC,prP),dC(prC,prP)],
    ]
    rows.forEach((r,i)=>{
      tRow(slide, TX, 4.75+i*0.32, TW, i, [
        {text:r[0],w:cW[0],bold:true},
        {text:r[1],w:cW[1],align:'right',color:WHITE,bold:true},
        {text:r[2],w:cW[2],align:'right',color:DGRAY},
        {text:r[3],w:cW[3],align:'right',color:r[4],bold:true},
        {text:r[3].startsWith('+')?'▲':r[3].startsWith('-')?'▼':'—',w:cW[4],align:'center',color:r[4],bold:true},
      ])
    })
  }
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// VENTAS
// ══════════════════════════════════════════════════════════════════════════════
async function addVentas(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const oC=n(cur?.sales?.orders), oP=n(prev?.sales?.orders)
  const gC=n(cur?.sales?.guests), gP=n(prev?.sales?.guests)
  const agC=gC>0?sC/gC:0, agP=gP>0?sP/gP:0
  const aoC=oC>0?sC/oC:0

  const alert = prev ? wL(prev.week)+': '+fmt$(sP)+'  →  '+wL(cur.week)+': '+fmt$(sC)+'  ('+d$(sC,sP)+' / '+(sP>0?((sC-sP)/sP*100).toFixed(0)+'%':'—')+')' : ''
  hdr(slide, 'VENTAS', alert, restName+' · '+wL(cur.week))
  subHdr(slide, prev?wL(prev.week)+' VS '+wL(cur.week):wL(cur.week))

  const kW=13.33/6
  kpi(slide,0,      1.0,kW,1.25,'VENTAS NETAS',fmt$(sC),prev?wL(prev.week)+': '+fmt$(sP):'',prev?d$(sC,sP):'',dC(sC,sP))
  kpi(slide,kW,     1.0,kW,1.25,'ÓRDENES',String(oC),prev?wL(prev.week)+': '+String(oP):'',prev?d$(oC,oP):'',dC(oC,oP))
  kpi(slide,kW*2,   1.0,kW,1.25,'GUESTS',String(gC),prev?wL(prev.week)+': '+String(gP):'',prev?d$(gC,gP):'',dC(gC,gP))
  kpi(slide,kW*3,   1.0,kW,1.25,'AVG/GUEST',agC>0?'$'+agC.toFixed(2):'—',prev?wL(prev.week)+': $'+agP.toFixed(2):'',prev&&agP>0?(agC>agP?'+$':'-$')+Math.abs(agC-agP).toFixed(2):'',dC(agC,agP))
  kpi(slide,kW*4,   1.0,kW,1.25,'AVG/ORDEN',aoC>0?'$'+aoC.toFixed(2):'—','','',GRAY)
  kpi(slide,kW*5,   1.0,kW,1.25,'VENTAS BRUTAS',fmt$(n(cur?.sales?.gross_sales)),'','',GRAY)

  // Ventas trend
  const hist=data.weeks.slice(-6)
  const svgSales=svgBarChart(hist.map(w=>wL(w.week)), hist.map(w=>n(w.sales?.net_sales)), BLUE, 420, 148)
  await svgImg(slide, svgSales, 0.15, 2.35, 5.65, 2.0)

  // Donut categorías
  const cats: any[]=cur?.sales?.categories||[]
  const catColors=[ORANGE,BLUE,PURPLE,GREEN,GOLD,PINK,GRAY]
  const donutSegs=cats.sort((a:any,b:any)=>n(b.net)-n(a.net)).slice(0,6).map((c:any,i:number)=>({
    value:n(c.net), color:catColors[i%catColors.length], label:c.name
  }))
  if(donutSegs.length) {
    const svgD=svgDonut(donutSegs, 190, 190)
    await svgImg(slide, svgD, 6.0, 2.35, 2.55, 2.0)
    donutSegs.forEach((sg,i)=>{
      const pct=sC>0?(sg.value/sC*100).toFixed(1)+'%':'—'
      const ly=2.42+i*0.28
      slide.addShape('rect',{x:8.75,y:ly+0.05,w:0.15,h:0.15,fill:{color:sg.color},line:{color:sg.color}})
      slide.addText(sg.label+' '+pct,{x:9.0,y:ly,w:4.15,h:0.25,fontSize:9,color:OFF})
    })
  }

  // Tabla categorías
  const prevCats: Record<string,number>={}
  if(prev?.sales?.categories) prev.sales.categories.forEach((c:any)=>{prevCats[c.name]=n(c.net)})
  const TX=0.15, TW=13.03
  const cW=[2.8,1.5,1.4,1.8,1.0,1.8,1.8,0.93]
  tHdr(slide,TX,4.44,TW,[
    {label:'CATEGORÍA',w:cW[0]},{label:'GROSS',w:cW[1],align:'right'},
    {label:'DESC',w:cW[2],align:'right'},{label:'NET '+wL(cur.week),w:cW[3],align:'right'},
    {label:'%',w:cW[4],align:'right'},{label:prev?'NET '+wL(prev.week):'',w:cW[5],align:'right'},
    {label:prev?'Δ':'',w:cW[6],align:'right'},{label:'',w:cW[7]},
  ])
  let ry=4.72
  cats.sort((a:any,b:any)=>n(b.net)-n(a.net)).forEach((cat:any,i:number)=>{
    const cNet=n(cat.net), cGross=n(cat.gross_sales??cat.gross??cNet), cDisc=n(cat.discounts??0)
    const pNet=prevCats[cat.name]||0
    tRow(slide,TX,ry,TW,i,[
      {text:cat.name,w:cW[0],bold:true},
      {text:fmt$(cGross),w:cW[1],align:'right',color:GRAY},
      {text:cDisc?'-'+fmt$(cDisc):'—',w:cW[2],align:'right',color:RED},
      {text:fmt$(cNet),w:cW[3],align:'right',color:WHITE,bold:true},
      {text:sC>0?(cNet/sC*100).toFixed(1)+'%':'—',w:cW[4],align:'right',color:GRAY},
      {text:prev?fmt$(pNet):'',w:cW[5],align:'right',color:DGRAY},
      {text:prev?d$(cNet,pNet):'',w:cW[6],align:'right',color:prev?dC(cNet,pNet):GRAY,bold:true},
      {text:'',w:cW[7]},
    ]); ry+=0.32
  })
  tTotal(slide,TX,ry,TW,[
    {text:'TOTAL',w:cW[0]},
    {text:fmt$(n(cur?.sales?.gross_sales)),w:cW[1],align:'right',color:GRAY},
    {text:'-'+fmt$(n(cur?.sales?.discounts)),w:cW[2],align:'right',color:RED},
    {text:fmt$(sC),w:cW[3],align:'right'},
    {text:'100%',w:cW[4],align:'right',color:GRAY},
    {text:prev?fmt$(sP):'',w:cW[5],align:'right',color:GRAY},
    {text:prev?d$(sC,sP):'',w:cW[6],align:'right',color:prev?dC(sC,sP):GRAY},
    {text:'',w:cW[7]},
  ])
  const rc: any[]=cur?.sales?.revenue_centers||[]
  const ld=cur?.sales?.lunch_dinner
  const rcStr=rc.map((r:any)=>r.name+': '+fmt$(n(r.net))+' ('+(sC>0?(n(r.net)/sC*100).toFixed(1)+'%':'—')+')').join('  ·  ')
  const ldStr=ld?'Lunch: '+fmt$(n(ld.lunch?.net))+' ('+n(ld.lunch?.orders)+' órd)  ·  Dinner: '+fmt$(n(ld.dinner?.net))+' ('+n(ld.dinner?.orders)+' órd)':''
  const footer=[rcStr,ldStr].filter(Boolean).join('   |   ')
  if(footer) slide.addText(footer,{x:TX,y:ry+0.38,w:TW,h:0.2,fontSize:7.5,color:GRAY,italic:true})
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// LABOR POR PUESTO
// ══════════════════════════════════════════════════════════════════════════════
async function addLaborPuesto(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const lC=n(cur?.labor?.total_pay), lP=n(prev?.labor?.total_pay)
  const hC=n(cur?.labor?.total_hours), hP=n(prev?.labor?.total_hours)
  const otC=n(cur?.labor?.total_ot_hours), otP=n(prev?.labor?.total_ot_hours)
  const lpC=sC>0?lC/sC*100:0, lpP=sP>0?lP/sP*100:0
  const positions: any[]=cur?.labor?.by_position||[]
  const otNames=positions.filter((p:any)=>n(p.ot_hours)>0).map((p:any)=>p.position+': '+n(p.ot_hours).toFixed(1)+'h').join('  ·  ')

  const alert=otC>0?'OT '+wL(cur.week)+': '+otC.toFixed(1)+'h  vs  '+wL(prev?.week||'')+': '+otP.toFixed(1)+'h':(prev?wL(prev.week)+': '+fmt$(lP)+'  →  '+wL(cur.week)+': '+fmt$(lC)+'  ('+d$(lC,lP)+')':'')
  hdr(slide, 'LABOR — POR PUESTO', alert, restName+' · '+wL(cur.week))
  subHdr(slide, prev?wL(prev.week)+' VS '+wL(cur.week):wL(cur.week))

  const kW=13.33/7
  kpi(slide,0,    1.0,kW,1.22,'HRS '+(prev?wL(prev.week):''),prev?hP.toFixed(0)+'h':'—','','',GRAY)
  kpi(slide,kW,   1.0,kW,1.22,'HRS '+wL(cur.week),hC.toFixed(0)+'h','',prev?d$(hC,hP):'',dC(hC,hP,true))
  kpi(slide,kW*2, 1.0,kW,1.22,'OT '+(prev?wL(prev.week):''),prev?otP.toFixed(1)+'h':'—','','',GRAY)
  kpi(slide,kW*3, 1.0,kW,1.22,'OT '+wL(cur.week),otC.toFixed(1)+'h','','',otC>0?RED:GRAY)
  kpi(slide,kW*4, 1.0,kW,1.22,'COSTO '+(prev?wL(prev.week):''),prev?fmt$(lP):'—','','',GRAY)
  kpi(slide,kW*5, 1.0,kW,1.22,'COSTO '+wL(cur.week),fmt$(lC),'',prev?d$(lC,lP):'',dC(lC,lP,true))
  kpi(slide,kW*6, 1.0,kW,1.22,'% LABOR',fmtPct(lpC),'',prev?dPp(lpC,lpP):'',dC(lpC,lpP,true))

  if(otNames) slide.addText('⚠  OT: '+otNames,{x:0.15,y:2.28,w:13,h:0.2,fontSize:8,color:ORANGE,bold:true})

  // Labor % trend
  const hist=data.weeks.slice(-6)
  const histLP=hist.map(w=>{ const s=n(w.sales?.net_sales); return s>0?n(w.labor?.total_pay)/s*100:0 })
  const svgL=svgLineChart(hist.map(w=>wL(w.week)),[{values:histLP,color:ORANGE,label:'% Labor'}],300,130,'%')
  await svgImg(slide, svgL, 9.3, 2.28, 3.87, 1.75)

  const TX=0.15, TW=9.0
  const cW=[2.5,1.0,0.9,1.1,1.0,0.9,1.1,0.5]
  const tableY=otNames?2.52:2.32
  tHdr(slide,TX,tableY,TW,[
    {label:'PUESTO',w:cW[0]},
    {label:prev?wL(prev.week)+' HRS':'',w:cW[1],align:'right'},
    {label:'OT',w:cW[2],align:'right'},
    {label:prev?wL(prev.week)+' $':'',w:cW[3],align:'right'},
    {label:wL(cur.week)+' HRS',w:cW[4],align:'right'},
    {label:'OT',w:cW[5],align:'right'},
    {label:wL(cur.week)+' $',w:cW[6],align:'right'},
    {label:'',w:cW[7]},
  ])
  const prevPos: Record<string,any>={}
  if(prev?.labor?.by_position) prev.labor.by_position.forEach((p:any)=>{prevPos[p.position]=p})
  let ry=tableY+0.28
  positions.forEach((pos:any,i:number)=>{
    const pp=prevPos[pos.position], hasOT=n(pos.ot_hours)>0
    tRow(slide,TX,ry,TW,i,[
      {text:pos.position,w:cW[0],bold:true},
      {text:pp?n(pp.regular_hours).toFixed(0)+'h':'—',w:cW[1],align:'right',color:DGRAY},
      {text:pp&&n(pp.ot_hours)>0?n(pp.ot_hours).toFixed(1)+'h':'—',w:cW[2],align:'right',color:DGRAY},
      {text:pp?fmt$(n(pp.total_pay)):'—',w:cW[3],align:'right',color:DGRAY},
      {text:n(pos.regular_hours).toFixed(0)+'h',w:cW[4],align:'right',bold:true},
      {text:hasOT?n(pos.ot_hours).toFixed(1)+'h':'—',w:cW[5],align:'right',color:hasOT?ORANGE:DGRAY,bold:hasOT},
      {text:fmt$(n(pos.total_pay)),w:cW[6],align:'right',bold:true},
      {text:'',w:cW[7]},
    ]); ry+=0.32
  })
  tTotal(slide,TX,ry,TW,[
    {text:'TOTAL',w:cW[0]},
    {text:prev?hP.toFixed(0)+'h':'—',w:cW[1],align:'right',color:GRAY},
    {text:prev&&otP>0?otP.toFixed(1)+'h':'—',w:cW[2],align:'right',color:GRAY},
    {text:prev?fmt$(lP):'—',w:cW[3],align:'right',color:GRAY},
    {text:hC.toFixed(0)+'h',w:cW[4],align:'right'},
    {text:otC>0?otC.toFixed(1)+'h':'—',w:cW[5],align:'right',color:otC>0?ORANGE:GRAY},
    {text:fmt$(lC),w:cW[6],align:'right'},
    {text:'',w:cW[7]},
  ])
  slide.addText('△ Naranja = OT activo  ▼ Verde = bajó  ▲ Rojo = subió',{x:TX,y:ry+0.38,w:TW,h:0.2,fontSize:7.5,color:DGRAY,italic:true})
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// LABOR POR EMPLEADO
// ══════════════════════════════════════════════════════════════════════════════
async function addLaborEmpleado(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, note: string) {
  const slide = base(pptx, logoUrl)
  const lC=n(cur?.labor?.total_pay), lP=n(prev?.labor?.total_pay)
  const hC=n(cur?.labor?.total_hours), hP=n(prev?.labor?.total_hours)
  const otC=n(cur?.labor?.total_ot_hours), otP=n(prev?.labor?.total_ot_hours)
  const emps: any[]=cur?.labor?.by_employee||[]
  const otEmp=emps.filter((e:any)=>n(e.ot_hours)>0).map((e:any)=>e.name.split(',')[0]+' '+n(e.ot_hours).toFixed(1)+'h').join('  ·  ')

  hdr(slide,'LABOR — POR EMPLEADO',otEmp?'OT: '+otEmp:'',prev?wL(prev.week)+' VS '+wL(cur.week):restName)
  subHdr(slide,prev?wL(prev.week)+' VS '+wL(cur.week):wL(cur.week))

  const kW=13.33/7
  kpi(slide,0,    1.0,kW,1.22,'HRS '+(prev?wL(prev.week):''),prev?hP.toFixed(0)+'h':'—','','',GRAY)
  kpi(slide,kW,   1.0,kW,1.22,'HRS '+wL(cur.week),hC.toFixed(0)+'h','',prev?d$(hC,hP):'',dC(hC,hP,true))
  kpi(slide,kW*2, 1.0,kW,1.22,'OT '+(prev?wL(prev.week):''),prev?otP.toFixed(1)+'h':'—','','',GRAY)
  kpi(slide,kW*3, 1.0,kW,1.22,'OT '+wL(cur.week),otC.toFixed(1)+'h','','',otC>0?RED:GRAY)
  kpi(slide,kW*4, 1.0,kW,1.22,'COSTO '+(prev?wL(prev.week):''),prev?fmt$(lP):'—','','',GRAY)
  kpi(slide,kW*5, 1.0,kW,1.22,'COSTO '+wL(cur.week),fmt$(lC),'',prev?d$(lC,lP):'',dC(lC,lP,true))
  kpi(slide,kW*6, 1.0,kW,1.22,'Δ COSTO',prev?d$(lC,lP):'—','','',prev?dC(lC,lP,true):GRAY)

  const prevEmps: Record<string,any>={}
  if(prev?.labor?.by_employee) prev.labor.by_employee.forEach((e:any)=>{prevEmps[e.name]=e})
  const TX=0.15, TW=13.03
  const cW=[2.5,1.5,0.9,0.8,1.2,0.9,0.8,1.2,1.3,0.94]
  tHdr(slide,TX,2.3,TW,[
    {label:'EMPLEADO',w:cW[0]},{label:'PUESTO',w:cW[1]},
    {label:prev?wL(prev.week)+' HRS':'',w:cW[2],align:'right'},
    {label:'OT',w:cW[3],align:'right'},
    {label:prev?wL(prev.week)+' $':'',w:cW[4],align:'right'},
    {label:wL(cur.week)+' HRS',w:cW[5],align:'right'},
    {label:'OT',w:cW[6],align:'right'},
    {label:wL(cur.week)+' $',w:cW[7],align:'right'},
    {label:'Δ PAY',w:cW[8],align:'right'},
    {label:'',w:cW[9]},
  ])
  const sorted=[...emps].sort((a:any,b:any)=>{
    if(a.position<b.position) return -1
    if(a.position>b.position) return 1
    return a.name.localeCompare(b.name)
  })
  let ry=2.58
  sorted.forEach((emp:any,i:number)=>{
    const pe=prevEmps[emp.name], hasOT=n(emp.ot_hours)>0
    const isNew=!!(prev&&!pe), dPay=pe?n(emp.total_pay)-n(pe.total_pay):0
    const zeroH=n(emp.regular_hours)===0
    tRow(slide,TX,ry,TW,i,[
      {text:(isNew?'★ ':'')+emp.name,w:cW[0],color:isNew?GOLD:zeroH?DGRAY:OFF,bold:!zeroH},
      {text:emp.position||'—',w:cW[1],color:GRAY,fs:8},
      {text:pe?n(pe.regular_hours).toFixed(0)+'h':'—',w:cW[2],align:'right',color:DGRAY},
      {text:pe&&n(pe.ot_hours)>0?n(pe.ot_hours).toFixed(1)+'h':'—',w:cW[3],align:'right',color:DGRAY},
      {text:pe?fmt$(n(pe.total_pay)):'—',w:cW[4],align:'right',color:DGRAY},
      {text:n(emp.regular_hours).toFixed(0)+'h',w:cW[5],align:'right',bold:!zeroH,color:zeroH?DGRAY:WHITE},
      {text:hasOT?n(emp.ot_hours).toFixed(1)+'h':'—',w:cW[6],align:'right',color:hasOT?ORANGE:DGRAY},
      {text:fmt$(n(emp.total_pay)),w:cW[7],align:'right',bold:true},
      {text:pe?(dPay>=0?'+':'')+fmt$(Math.abs(dPay)):'—',w:cW[8],align:'right',color:pe?dC(dPay,0,true):GRAY,bold:!!pe},
      {text:'',w:cW[9]},
    ]); ry+=0.32
  })
  tTotal(slide,TX,ry,TW,[
    {text:'TOTAL',w:cW[0]},{text:'',w:cW[1]},
    {text:prev?hP.toFixed(0)+'h':'—',w:cW[2],align:'right',color:GRAY},
    {text:prev&&otP>0?otP.toFixed(1)+'h':'—',w:cW[3],align:'right',color:GRAY},
    {text:prev?fmt$(lP):'—',w:cW[4],align:'right',color:GRAY},
    {text:hC.toFixed(0)+'h',w:cW[5],align:'right'},
    {text:otC>0?otC.toFixed(1)+'h':'—',w:cW[6],align:'right',color:otC>0?ORANGE:GRAY},
    {text:fmt$(lC),w:cW[7],align:'right'},
    {text:prev?d$(lC,lP):'—',w:cW[8],align:'right',color:prev?dC(lC,lP,true):GRAY},
    {text:'',w:cW[9]},
  ])
  slide.addText('★ Nuevo  △ Naranja = OT  ▲ Rojo = subió  ▼ Verde = bajó',{x:TX,y:ry+0.38,w:TW,h:0.2,fontSize:7.5,color:DGRAY,italic:true})
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// COSTO DE VENTAS
// ══════════════════════════════════════════════════════════════════════════════
async function addCostoVentas(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  hdr(slide,'COSTO DE VENTAS','',restName+' · '+wL(cur.week))
  subHdr(slide,'SEMANA '+wL(cur.week)+'  ('+cur.weekStart+' – '+cur.weekEnd+')')

  const cogs=cur?.cogs?.by_category||{}, pCogs=prev?.cogs?.by_category||{}
  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const catDefs=[
    {key:'food',label:'Food',color:ORANGE},{key:'na_beverage',label:'NA Bev',color:BLUE},
    {key:'liquor',label:'Liquor',color:PURPLE},{key:'beer',label:'Beer',color:GOLD},
    {key:'wine',label:'Wine',color:PINK},{key:'general',label:'General',color:GRAY},
  ]
  const active=catDefs.filter(c=>n((cogs as any)[c.key])>0||n((pCogs as any)[c.key])>0)
  const kW=13.33/Math.max(active.length,1)
  active.forEach((c,i)=>{
    const val=n((cogs as any)[c.key]), pval=n((pCogs as any)[c.key])
    const pct=sC>0?val/sC*100:0, ppct=sP>0?pval/sP*100:0
    kpi(slide,i*kW,1.0,kW,1.25,c.label,fmtPct(pct),fmt$(val),prev?dPp(pct,ppct):'',prev?dC(pct,ppct,true):GRAY)
  })

  // COGS trend chart
  const hist=data.weeks.slice(-6)
  const histCP=hist.map(w=>{ const s=n(w.sales?.net_sales); return s>0?n(w.cogs?.total)/s*100:0 })
  const svgC=svgLineChart(hist.map(w=>wL(w.week)),[{values:histCP,color:RED,label:'% COGS Total'}],350,140,'%')
  await svgImg(slide, svgC, 9.15, 2.35, 4.0, 1.88)

  // Cédula
  const TX=0.15, TW=8.85
  const inv=cur?.inventory?.by_account||[]
  const ACCT: Record<string,string>={
    'Food Inventory':'food','Food bar Inventory':'liquor','Beer':'beer',
    'Alcoholic Inventory':'liquor','Beverage Inventory':'na_beverage','Wine Inventory':'wine',
  }
  const invC: Record<string,number>={}, invP: Record<string,number>={}
  if(Array.isArray(inv)) inv.forEach((a:any)=>{
    const cat=ACCT[a.account]; if(!cat) return
    invC[cat]=(invC[cat]||0)+n(a.current_value); invP[cat]=(invP[cat]||0)+n(a.previous_value)
  })
  const salesCats=cur?.sales?.categories||[]
  const catSales: Record<string,number>={}
  const catMap: Record<string,string>={'Food':'food','Liquor':'liquor','Beer':'beer','NA Beverage':'na_beverage','Wine':'wine','Ayce':'food'}
  salesCats.forEach((c:any)=>{ const k=catMap[c.name]; if(k) catSales[k]=(catSales[k]||0)+n(c.net) })

  const cols=catDefs.filter(c=>c.key!=='general')
  const colW=(TW-1.8)/cols.length

  slide.addShape('rect',{x:TX,y:2.32,w:TW,h:0.25,fill:{color:ROW_H},line:{color:BG}})
  slide.addText('',{x:TX+0.1,y:2.35,w:1.7,h:0.18,fontSize:7,color:GRAY,bold:true})
  cols.forEach((c,i)=>{
    slide.addText(c.label.toUpperCase(),{x:TX+1.8+i*colW+0.05,y:2.35,w:colW-0.05,h:0.18,fontSize:7,color:GOLD,bold:true,align:'center'})
  })
  slide.addText('MIXTO F&B',{x:TX+TW-1.7,y:2.35,w:1.6,h:0.18,fontSize:7,color:GOLD,bold:true,align:'center'})

  const rowDefs=[
    {label:'INV. INICIAL',key:'inv_prev',bold:true},
    {label:'COMPRAS',key:'compras',bold:true},
    {label:'INV. FINAL',key:'inv_curr',bold:true},
    {label:'USO INVENTARIO',key:'uso',bold:true},
    {label:'VENTA TOAST',key:'venta',bold:true},
    {label:'% COSTO REAL',key:'pct_real',bold:false},
    {label:'% COSTO P.MIX',key:'pct_mix',bold:false},
    {label:'VARIACIÓN $',key:'variacion',bold:true},
  ]

  let totalIP=0,totalComp=0,totalIC=0,totalVta=0
  const catD: Record<string,{ip:number;comp:number;ic:number;vta:number}>={}
  cols.forEach(c=>{
    const ip=invP[c.key]||0, ic=invC[c.key]||0
    const comp=n((cogs as any)[c.key]), vta=catSales[c.key]||0
    catD[c.key]={ip,comp,ic,vta}
    totalIP+=ip; totalComp+=comp; totalIC+=ic; totalVta+=vta
  })

  let ry=2.57
  rowDefs.forEach((row,ri)=>{
    slide.addShape('rect',{x:TX,y:ry,w:TW,h:0.28,fill:{color:ri%2===0?ROW_A:ROW_B},line:{color:BG}})
    slide.addText(row.label,{x:TX+0.1,y:ry+0.07,w:1.65,h:0.18,fontSize:8,color:row.bold?WHITE:OFF,bold:row.bold||false})
    const totalUso=Math.max(totalIP+totalComp-totalIC,0)
    let mTxt='', mCol=WHITE
    cols.forEach((c,ci)=>{
      const d=catD[c.key], uso=Math.max(d.ip+d.comp-d.ic,0)
      let txt='', col=OFF
      if(row.key==='inv_prev'){txt=fmt$(d.ip); mTxt=fmt$(totalIP)}
      else if(row.key==='compras'){txt=fmt$(d.comp); mTxt=fmt$(totalComp)}
      else if(row.key==='inv_curr'){txt=fmt$(d.ic); mTxt=fmt$(totalIC)}
      else if(row.key==='uso'){txt=fmt$(uso);col=GOLD; mTxt=fmt$(totalUso);mCol=GOLD}
      else if(row.key==='venta'){txt=fmt$(d.vta); mTxt=fmt$(totalVta)}
      else if(row.key==='pct_real'){
        const p=d.vta>0?uso/d.vta*100:0; txt=p>0?p.toFixed(1)+'%':'0%'; col=p>35?RED:p>0?OFF:DGRAY
        const tp=totalVta>0?totalUso/totalVta*100:0; mTxt=tp.toFixed(1)+'%'; mCol=tp>35?RED:GREEN
      } else if(row.key==='pct_mix'){
        const theo=n(cur?.productMix?.theo_cost_by_category?.[c.key]??0)
        txt=d.vta>0?(theo/d.vta*100).toFixed(1)+'%':'—'; col=BLUE
        const theoT=cols.reduce((s,cc)=>s+n(cur?.productMix?.theo_cost_by_category?.[cc.key]??0),0)
        mTxt=totalVta>0?(theoT/totalVta*100).toFixed(1)+'%':'—'; mCol=BLUE
      } else if(row.key==='variacion'){
        const theo=n(cur?.productMix?.theo_cost_by_category?.[c.key]??0)
        const rp=d.vta>0?uso/d.vta:0, mp=d.vta>0?theo/d.vta:0, v=(rp-mp)*d.vta
        txt=(v>0?'':v<0?'-':'')+fmt$(Math.abs(v)); col=v>0?RED:v<0?GREEN:DGRAY
        const theoT=cols.reduce((s,cc)=>s+n(cur?.productMix?.theo_cost_by_category?.[cc.key]??0),0)
        const trp=totalVta>0?totalUso/totalVta:0, tmp=totalVta>0?theoT/totalVta:0, tv=(trp-tmp)*totalVta
        mTxt=(tv>0?'':tv<0?'-':'')+fmt$(Math.abs(tv)); mCol=tv>0?RED:tv<0?GREEN:DGRAY
      }
      slide.addText(txt,{x:TX+1.8+ci*colW+0.05,y:ry+0.07,w:colW-0.1,h:0.18,fontSize:8,color:col,bold:row.bold,align:'right'})
    })
    if(mTxt) slide.addText(mTxt,{x:TX+TW-1.7,y:ry+0.07,w:1.6,h:0.18,fontSize:9,color:mCol,bold:true,align:'right'})
    ry+=0.28
  })
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPRAS
// ══════════════════════════════════════════════════════════════════════════════
async function addCompras(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const cogs=cur?.cogs||{}, pCogs=prev?.cogs||{}
  const totalC=n(cogs.total), totalP=n(pCogs.total)
  const alert=prev?wL(prev.week)+': '+fmt$(totalP)+'  →  '+wL(cur.week)+': '+fmt$(totalC)+'  ('+d$(totalC,totalP)+')':''
  hdr(slide,'COMPRAS',alert,restName+' · '+wL(cur.week))
  subHdr(slide,prev?wL(prev.week)+' VS '+wL(cur.week):wL(cur.week))

  const catDefs=[
    {key:'food',label:'FOOD',color:ORANGE},{key:'na_beverage',label:'N/A BEV',color:BLUE},
    {key:'liquor',label:'LIQUOR',color:PURPLE},{key:'beer',label:'BEER',color:GOLD},
    {key:'wine',label:'WINE',color:PINK},{key:'general',label:'GENERAL',color:GRAY},
  ]
  const catC=cogs.by_category||{}, catP=pCogs.by_category||{}
  const active=catDefs.filter(c=>n((catC as any)[c.key])>0||n((catP as any)[c.key])>0)
  const kW=13.33/Math.max(active.length,1)
  active.forEach((c,i)=>{
    const val=n((catC as any)[c.key]), pval=n((catP as any)[c.key])
    const d=val-pval
    kpi(slide,i*kW,1.0,kW,1.25,c.label,fmt$(val),prev?wL(prev.week)+': '+fmt$(pval):'',prev?(d>=0?'+':'')+fmt$(d):'',prev?dC(d,0,true):GRAY)
  })

  // Compras trend
  const hist=data.weeks.slice(-6)
  const svgComp=svgBarChart(hist.map(w=>wL(w.week)),hist.map(w=>n(w.cogs?.total)),ORANGE,350,138)
  await svgImg(slide, svgComp, 9.15, 2.35, 4.0, 1.85)

  const vendors: any[]=cogs.by_vendor||[]
  const pVendors: Record<string,number>={}
  if(pCogs.by_vendor) pCogs.by_vendor.forEach((v:any)=>{pVendors[v.name]=n(v.total)})

  const TX=0.15, TW=8.85
  slide.addShape('rect',{x:TX,y:2.32,w:TW,h:0.22,fill:{color:KBIG},line:{color:BG}})
  slide.addText('RESUMEN: '+(prev?wL(prev.week)+': '+fmt$(totalP)+'  →  ':'')+wL(cur.week)+': '+fmt$(totalC)+(prev?'  '+d$(totalC,totalP):''),{x:TX+0.1,y:2.35,w:TW-0.2,h:0.16,fontSize:8,color:dC(totalC,totalP,true)})

  const cW=[4.5,1.7,1.7,0.95]
  tHdr(slide,TX,2.57,TW,[
    {label:'PROVEEDOR',w:cW[0]},
    {label:prev?wL(prev.week):'',w:cW[1],align:'right'},
    {label:wL(cur.week),w:cW[2],align:'right'},
    {label:'Δ',w:cW[3],align:'right'},
  ])
  let ry=2.85
  vendors.sort((a:any,b:any)=>n(b.total)-n(a.total)).forEach((v:any,i:number)=>{
    const pv=pVendors[v.name]??0, isNew=!!(prev&&pv===0), diff=n(v.total)-pv
    tRow(slide,TX,ry,TW,i,[
      {text:(isNew?'★ ':'')+v.name,w:cW[0],color:isNew?GOLD:OFF,bold:isNew},
      {text:prev?(pv>0?fmt$(pv):'—'):'—',w:cW[1],align:'right',color:DGRAY},
      {text:fmt$(n(v.total)),w:cW[2],align:'right',bold:true},
      {text:isNew?'★':prev?(diff>=0?'+':'')+fmt$(diff):'—',w:cW[3],align:'right',color:isNew?GOLD:diff>0?RED:GREEN,bold:true},
    ]); ry+=0.32
  })
  tTotal(slide,TX,ry,TW,[
    {text:'TOTAL',w:cW[0]},
    {text:prev?fmt$(totalP):'—',w:cW[1],align:'right',color:GRAY},
    {text:fmt$(totalC),w:cW[2],align:'right'},
    {text:prev?d$(totalC,totalP):'—',w:cW[3],align:'right',color:prev?dC(totalC,totalP,true):GRAY},
  ])
  slide.addText('★ Proveedor nuevo  ▲ Rojo = subió  ▼ Verde = bajó',{x:TX,y:ry+0.38,w:TW,h:0.2,fontSize:7.5,color:DGRAY,italic:true})
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTUAL VS TEÓRICO
// ══════════════════════════════════════════════════════════════════════════════
async function addAvt(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const avt=cur?.avt
  const shortage=n(avt?.total_shortage_dollar), overage=n(avt?.total_overage_dollar), net=n(avt?.net_variance)
  const items: any[]=avt?.all_items||[]
  const shortCount=items.filter((i:any)=>n(i.variance_dollar)>0).length
  const overCount=items.filter((i:any)=>n(i.variance_dollar)<0).length
  const alert='Faltantes: '+fmt$(shortage)+'  ·  Sobrantes: '+fmt$(overage)+'  ·  Neto: '+(net>0?'+':'')+fmt$(net)
  hdr(slide,'ACTUAL VS TEÓRICO',alert,restName+' · '+wL(cur.week))
  subHdr(slide,'SEMANA '+wL(cur.week)+'  ('+cur.weekStart+' – '+cur.weekEnd+')')

  const kW=13.33/5
  kpi(slide,0,     1.0,kW,1.25,'FALTANTES (#)',String(shortCount),'','',RED)
  kpi(slide,kW,    1.0,kW,1.25,'FALTANTES ($)',fmt$(shortage),'','',RED)
  kpi(slide,kW*2,  1.0,kW,1.25,'SOBRANTES (#)',String(overCount),'','',GREEN)
  kpi(slide,kW*3,  1.0,kW,1.25,'SOBRANTES ($)',fmt$(overage),'','',GREEN)
  kpi(slide,kW*4,  1.0,kW,1.25,'NETO',(net>0?'+':'')+fmt$(net),net>0?'pérdida':'ganancia','',net>0?RED:GREEN)

  // AvT trend
  const hist=data.weeks.slice(-6)
  const svgAvt=svgLineChart(hist.map(w=>wL(w.week)),[
    {values:hist.map(w=>n(w.avt?.total_shortage_dollar)),color:RED,label:'Faltantes $'},
    {values:hist.map(w=>n(w.avt?.total_overage_dollar)),color:GREEN,label:'Sobrantes $'},
  ],420,145,'$')
  await svgImg(slide, svgAvt, 6.7, 2.35, 6.45, 1.95)

  const sorted=[...items].sort((a:any,b:any)=>Math.abs(n(b.variance_dollar))-Math.abs(n(a.variance_dollar)))
  const faltantes=sorted.filter((i:any)=>n(i.variance_dollar)>0).slice(0,8)
  const sobrantes=sorted.filter((i:any)=>n(i.variance_dollar)<0).slice(0,8)
  const HW=6.2
  slide.addShape('rect',{x:0.15,y:2.38,w:HW,h:0.25,fill:{color:ALERT},line:{color:BG}})
  slide.addText('🔴  TOP FALTANTES',{x:0.25,y:2.4,w:HW-0.1,h:0.2,fontSize:9,color:'FCA5A5',bold:true})
  tHdr(slide,0.15,2.63,HW,[{label:'ARTÍCULO',w:3.2},{label:'QTY+',w:1.3,align:'right'},{label:'IMPACTO $',w:1.7,align:'right'}])
  faltantes.forEach((item:any,i:number)=>{
    const ry=2.91+i*0.32
    tRow(slide,0.15,ry,HW,i,[
      {text:item.item_name||item.name||'—',w:3.2},
      {text:'+'+n(item.variance_qty??0).toFixed(1),w:1.3,align:'right',color:RED},
      {text:'+'+fmt$(Math.abs(n(item.variance_dollar))),w:1.7,align:'right',color:RED,bold:true},
    ])
    if(item.note) slide.addText('💬 '+item.note,{x:0.25,y:ry+0.22,w:HW-0.1,h:0.12,fontSize:6.5,color:ORANGE,italic:true})
  })
  tTotal(slide,0.15,2.91+faltantes.length*0.32,HW,[
    {text:'TOP '+faltantes.length,w:3.2},{text:'',w:1.3},
    {text:'+'+fmt$(faltantes.reduce((s:number,i:any)=>s+Math.abs(n(i.variance_dollar)),0)),w:1.7,align:'right',color:RED}
  ])
  slide.addShape('rect',{x:6.68,y:2.38,w:HW,h:0.25,fill:{color:'14532D'},line:{color:BG}})
  slide.addText('🟢  TOP SOBRANTES',{x:6.78,y:2.4,w:HW-0.1,h:0.2,fontSize:9,color:'86EFAC',bold:true})
  tHdr(slide,6.68,2.63,HW,[{label:'ARTÍCULO',w:3.2},{label:'QTY-',w:1.3,align:'right'},{label:'IMPACTO $',w:1.7,align:'right'}])
  sobrantes.forEach((item:any,i:number)=>{
    const ry=2.91+i*0.32
    tRow(slide,6.68,ry,HW,i,[
      {text:item.item_name||item.name||'—',w:3.2},
      {text:n(item.variance_qty??0).toFixed(1),w:1.3,align:'right',color:GREEN},
      {text:'-'+fmt$(Math.abs(n(item.variance_dollar))),w:1.7,align:'right',color:GREEN,bold:true},
    ])
    if(item.note) slide.addText('💬 '+item.note,{x:6.78,y:ry+0.22,w:HW-0.1,h:0.12,fontSize:6.5,color:ORANGE,italic:true})
  })
  tTotal(slide,6.68,2.91+sobrantes.length*0.32,HW,[
    {text:'TOP '+sobrantes.length,w:3.2},{text:'',w:1.3},
    {text:'-'+fmt$(sobrantes.reduce((s:number,i:any)=>s+Math.abs(n(i.variance_dollar)),0)),w:1.7,align:'right',color:GREEN}
  ])
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// DESCUENTOS
// ══════════════════════════════════════════════════════════════════════════════
async function addDescuentos(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, note: string) {
  const slide = base(pptx, logoUrl)
  const disc=(cur as any)?.discounts, pDisc=(prev as any)?.discounts
  const totalC=n(disc?.total), totalP=n(pDisc?.total), sC=n(cur?.sales?.net_sales)
  const items: any[]=disc?.items||[]
  const alert=prev?wL(prev.week)+': '+fmt$(totalP)+'  →  '+wL(cur.week)+': '+fmt$(totalC)+'  ('+d$(totalC,totalP)+')':''
  hdr(slide,'DESCUENTOS',alert,restName+' · '+wL(cur.week))
  subHdr(slide,prev?wL(prev.week)+' VS '+wL(cur.week):wL(cur.week))
  const applic=items.length, orders=new Set(items.map((i:any)=>i.order_id).filter(Boolean)).size
  const kW=13.33/7
  kpi(slide,0,     1.0,kW,1.22,'APLICACIONES',String(applic),'','',GRAY)
  kpi(slide,kW,    1.0,kW,1.22,'ÓRDENES',String(orders),'','',GRAY)
  kpi(slide,kW*2,  1.0,kW,1.22,'TOTAL '+wL(cur.week),fmt$(totalC),'',prev?d$(totalC,totalP):'',dC(totalC,totalP,true))
  kpi(slide,kW*3,  1.0,kW,1.22,'TOTAL '+(prev?wL(prev.week):''),prev?fmt$(totalP):'—','','',GRAY)
  kpi(slide,kW*4,  1.0,kW,1.22,'Δ',prev?d$(totalC,totalP):'—','','',prev?dC(totalC,totalP,true):GRAY)
  kpi(slide,kW*5,  1.0,kW,1.22,'% VENTAS '+wL(cur.week),sC>0?(totalC/sC*100).toFixed(1)+'%':'—','','',GRAY)
  kpi(slide,kW*6,  1.0,kW,1.22,'% VENTAS '+(prev?wL(prev.week):''),prev&&n(prev?.sales?.net_sales)>0?(totalP/n(prev?.sales?.net_sales)*100).toFixed(1)+'%':'—','','',GRAY)

  const grouped: Record<string,{aplic:number;ords:Set<string>;total:number}>={}
  items.forEach((item:any)=>{
    const nm=item.discount_name||item.name||'—'
    if(!grouped[nm]) grouped[nm]={aplic:0,ords:new Set(),total:0}
    grouped[nm].aplic++
    if(item.order_id) grouped[nm].ords.add(item.order_id)
    grouped[nm].total+=n(item.amount??item.total??0)
  })
  const pGrouped: Record<string,number>={}
  ;(pDisc?.items||[]).forEach((item:any)=>{
    const nm=item.discount_name||item.name||'—'
    pGrouped[nm]=(pGrouped[nm]||0)+n(item.amount??item.total??0)
  })
  const TX=0.15, TW=13.03
  const cW=[3.2,0.9,0.9,1.8,0.9,1.8,2.1,1.44]
  tHdr(slide,TX,2.32,TW,[
    {label:'DESCUENTO',w:cW[0]},{label:'APLIC',w:cW[1],align:'right'},
    {label:'ORDS',w:cW[2],align:'right'},{label:'MONTO '+wL(cur.week),w:cW[3],align:'right'},
    {label:'%',w:cW[4],align:'right'},{label:prev?'MONTO '+wL(prev.week):'',w:cW[5],align:'right'},
    {label:prev?'Δ':'',w:cW[6],align:'right'},{label:'',w:cW[7]},
  ])
  let ry=2.6
  Object.entries(grouped).sort((a,b)=>b[1].total-a[1].total).forEach(([nm,data],i)=>{
    const pv=pGrouped[nm]??0, isNew=!!(prev&&pv===0), diff=data.total-pv
    tRow(slide,TX,ry,TW,i,[
      {text:(isNew?'★ ':'')+nm,w:cW[0],color:isNew?GOLD:OFF,bold:isNew},
      {text:String(data.aplic),w:cW[1],align:'right',color:GRAY},
      {text:String(data.ords.size),w:cW[2],align:'right',color:GRAY},
      {text:fmt$(data.total),w:cW[3],align:'right',bold:true},
      {text:totalC>0?(data.total/totalC*100).toFixed(1)+'%':'—',w:cW[4],align:'right',color:GRAY},
      {text:prev?(pv>0?fmt$(pv):'—'):'—',w:cW[5],align:'right',color:DGRAY},
      {text:prev?(diff>=0?'+':'')+fmt$(diff):'—',w:cW[6],align:'right',color:prev?dC(diff,0,true):GRAY,bold:!!prev},
      {text:'',w:cW[7]},
    ]); ry+=0.32
  })
  tTotal(slide,TX,ry,TW,[
    {text:'TOTAL',w:cW[0]},{text:String(applic),w:cW[1],align:'right',color:GRAY},
    {text:String(orders),w:cW[2],align:'right',color:GRAY},{text:fmt$(totalC),w:cW[3],align:'right'},
    {text:'100%',w:cW[4],align:'right',color:GRAY},{text:prev?fmt$(totalP):'—',w:cW[5],align:'right',color:GRAY},
    {text:prev?d$(totalC,totalP):'—',w:cW[6],align:'right',color:prev?dC(totalC,totalP,true):GRAY},
    {text:'',w:cW[7]},
  ])
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// VOIDS
// ══════════════════════════════════════════════════════════════════════════════
async function addVoids(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, note: string) {
  const slide = base(pptx, logoUrl)
  const voids=(cur as any)?.voids, pVoids=(prev as any)?.voids
  const totalC=n(voids?.total), totalP=n(pVoids?.total), sC=n(cur?.sales?.net_sales)
  const items: any[]=voids?.items||[]
  const byReason: Record<string,number>={}
  items.forEach((item:any)=>{ const r=item.reason||'Sin razón'; byReason[r]=(byReason[r]||0)+n(item.price??item.amount??0) })
  const serverErr=byReason['Server Error']||0, e86=byReason['86ed']||0
  const alert=prev?wL(prev.week)+': '+fmt$(totalP)+'  →  '+wL(cur.week)+': '+fmt$(totalC)+'  ('+d$(totalC,totalP)+')':''
  hdr(slide,'VOIDS',alert,restName+' · '+wL(cur.week))
  subHdr(slide,prev?wL(prev.week)+' VS '+wL(cur.week):wL(cur.week))
  const kW=13.33/8
  kpi(slide,0,     1.0,kW,1.22,'ITEMS',String(items.length),'','',GRAY)
  kpi(slide,kW,    1.0,kW,1.22,'ÓRDENES',String(new Set(items.map((i:any)=>i.order_id).filter(Boolean)).size),'','',GRAY)
  kpi(slide,kW*2,  1.0,kW,1.22,'TOTAL '+wL(cur.week),fmt$(totalC),'',prev?d$(totalC,totalP):'',dC(totalC,totalP,true))
  kpi(slide,kW*3,  1.0,kW,1.22,'TOTAL '+(prev?wL(prev.week):''),prev?fmt$(totalP):'—','','',GRAY)
  kpi(slide,kW*4,  1.0,kW,1.22,'Δ',prev?d$(totalC,totalP):'—','','',prev?dC(totalC,totalP,true):GRAY)
  kpi(slide,kW*5,  1.0,kW,1.22,'86ed $',fmt$(e86),'','',e86>0?ORANGE:GRAY)
  kpi(slide,kW*6,  1.0,kW,1.22,'SERVER ERR $',fmt$(serverErr),'','',serverErr>0?RED:GRAY)
  kpi(slide,kW*7,  1.0,kW,1.22,'% VENTAS',sC>0?(totalC/sC*100).toFixed(2)+'%':'—','','',GRAY)

  slide.addText('86ed: '+items.filter((i:any)=>i.reason==='86ed').length+' items / '+fmt$(e86)+'  ·  Customer Changed Mind: '+items.filter((i:any)=>i.reason==='Customer Changed Mind').length+' items  ·  Server Error: '+items.filter((i:any)=>i.reason==='Server Error').length+' items / '+fmt$(serverErr),
    {x:0.15,y:2.28,w:13,h:0.2,fontSize:7.5,color:GRAY,italic:true})

  const TX=0.15, TW=13.03
  const cW=[3.5,2.8,2.8,0.8,3.13]
  tHdr(slide,TX,2.52,TW,[{label:'ARTÍCULO',w:cW[0]},{label:'SERVIDOR',w:cW[1]},{label:'RAZÓN',w:cW[2]},{label:'QTY',w:cW[3],align:'right'},{label:'PRECIO',w:cW[4],align:'right'}])
  const sorted=[...items].sort((a:any,b:any)=>n(b.price??b.amount??0)-n(a.price??a.amount??0))
  let ry=2.8
  sorted.slice(0,12).forEach((item:any,i:number)=>{
    const reason=item.reason||'—', isErr=reason==='Server Error', is86=reason==='86ed'
    tRow(slide,TX,ry,TW,i,[
      {text:item.item_name||item.name||'—',w:cW[0],bold:true},
      {text:item.employee_name||item.server||'—',w:cW[1],color:GRAY},
      {text:reason,w:cW[2],color:isErr?ORANGE:is86?ORANGE:GRAY},
      {text:item.qty?'x'+item.qty:'x1',w:cW[3],align:'right',color:GRAY},
      {text:fmt$(n(item.price??item.amount??0)),w:cW[4],align:'right',color:RED,bold:true},
    ]); ry+=0.32
  })
  tTotal(slide,TX,ry,TW,[
    {text:'TOTAL VOIDS (x'+items.length+')',w:cW[0]+cW[1]+cW[2]+cW[3]},
    {text:fmt$(totalC),w:cW[4],align:'right',color:RED},
  ])
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// WASTE
// ══════════════════════════════════════════════════════════════════════════════
async function addWaste(pptx: any, logoUrl: string|undefined,
  restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const wC=n(cur?.waste?.total_cost), wP=n(prev?.waste?.total_cost)
  const items: any[]=cur?.waste?.items||[]
  const alert=prev?wL(prev.week)+': '+fmt$(wP)+'  →  '+wL(cur.week)+': '+fmt$(wC)+'  ('+d$(wC,wP)+')':''
  hdr(slide,'WASTE / MERMA',alert,restName+' · '+wL(cur.week))
  subHdr(slide,prev?wL(prev.week)+' VS '+wL(cur.week):wL(cur.week))
  const kW=13.33/4
  kpi(slide,0,     1.0,kW,1.25,'WASTE '+wL(cur.week),fmt$(wC),'',prev?d$(wC,wP):'',dC(wC,wP,true))
  kpi(slide,kW,    1.0,kW,1.25,'WASTE '+(prev?wL(prev.week):''),prev?fmt$(wP):'—','','',GRAY)
  kpi(slide,kW*2,  1.0,kW,1.25,'Δ',prev?d$(wC,wP):'—','','',prev?dC(wC,wP,true):GRAY)
  kpi(slide,kW*3,  1.0,kW,1.25,'ITEMS',String(items.length),'','',GRAY)

  const hist=data.weeks.slice(-6)
  const svgW=svgBarChart(hist.map(w=>wL(w.week)),hist.map(w=>n(w.waste?.total_cost)),RED,380,140)
  await svgImg(slide, svgW, 9.0, 2.35, 4.15, 1.88)

  const TX=0.15, TW=8.7
  const cW=[3.5,1.5,1.3,2.4]
  tHdr(slide,TX,2.35,TW,[{label:'ITEM',w:cW[0]},{label:'CANT.',w:cW[1],align:'right'},{label:'COSTO $',w:cW[2],align:'right'},{label:'RAZÓN',w:cW[3]}])
  const sorted=[...items].sort((a:any,b:any)=>n(b.cost)-n(a.cost))
  let ry=2.63
  sorted.slice(0,12).forEach((item:any,i:number)=>{
    tRow(slide,TX,ry,TW,i,[
      {text:item.item_name||item.name||'—',w:cW[0],bold:true},
      {text:n(item.quantity).toFixed(1)+' '+(item.unit||''),w:cW[1],align:'right',color:GRAY},
      {text:fmt$(n(item.cost)),w:cW[2],align:'right',color:RED,bold:true},
      {text:item.reason||'—',w:cW[3],color:GRAY},
    ]); ry+=0.32
  })
  addNote(slide, note)
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export async function generatePPTX(config: ExportConfig, dataByRestaurant: ExportData[]) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Restaurant X-Ray'

  for(const data of dataByRestaurant) {
    const current = data.weeks[data.weeks.length - 1]
    const previous = data.weeks.length >= 2 ? data.weeks[data.weeks.length - 2] : null
    const restName = data.restaurant.name
    const logoUrl = config.template.logoUrl || data.restaurant.logo_url || undefined

    addCover(pptx, logoUrl, restName, current, previous)

    for(const section of config.sections) {
      const note = config.notes[section] || ''
      switch(section) {
        case 'executive':
          await addEjecutivo(pptx, logoUrl, restName, current, previous, data, note); break
        case 'ventas':
          await addVentas(pptx, logoUrl, restName, current, previous, data, note); break
        case 'labor':
          await addLaborPuesto(pptx, logoUrl, restName, current, previous, data, note)
          await addLaborEmpleado(pptx, logoUrl, restName, current, previous, note); break
        case 'food_cost':
          await addCostoVentas(pptx, logoUrl, restName, current, previous, data, note); break
        case 'compras':
          await addCompras(pptx, logoUrl, restName, current, previous, data, note); break
        case 'avt':
          await addAvt(pptx, logoUrl, restName, current, previous, data, note); break
        case 'waste':
          await addWaste(pptx, logoUrl, restName, current, previous, data, note); break
      }
    }
    if((current as any)?.discounts) {
      await addDescuentos(pptx, logoUrl, restName, current, previous, config.notes['descuentos']||'')
    }
    if((current as any)?.voids) {
      await addVoids(pptx, logoUrl, restName, current, previous, config.notes['voids']||'')
    }
  }

  const restName = dataByRestaurant[0]?.restaurant?.name?.replace(/\s/g,'-')||'reporte'
  const weekLabel = dataByRestaurant[0]?.weeks[dataByRestaurant[0].weeks.length-1]?.week||'semana'
  await pptx.writeFile({ fileName: restName+'-'+weekLabel+'.pptx' })
}