// generate-pptx.ts — v5
// KPIs + gráficas SVG replicando el dashboard exactamente
// Sin tablas complejas de vendors — foco en KPIs y tendencias visuales

import type { ExportConfig, ExportData, WeekData } from './data-fetcher'
import { fmt$, fmtPct, safeN } from './data-fetcher'

// ── Colores ───────────────────────────────────────────────────────────────────
const BG    = '0F1117'
const HDR   = '1A1D27'
const CARD  = '1E2235'
const WHITE = 'FFFFFF'
const OFF   = 'E2E8F0'
const GRAY  = '64748B'
const LGRAY = '94A3B8'
const GREEN = '22C55E'
const RED   = 'EF4444'
const AMBER = 'F59E0B'
const GOLD  = 'F5C842'
const BLUE  = '3B82F6'
const PURPLE= 'A855F7'
const ORANGE= 'F97316'
const CYAN  = '06B6D4'
const PINK  = 'EC4899'
const TEAL  = '14B8A6'

function n(v: any): number { return safeN(v) }
function wL(w: string) { return w.replace('2026-','').replace('2025-','') }
function d$(c: number, p: number): string { const d=c-p; return (d>=0?'+':'')+fmt$(d) }
function dPp(c: number, p: number): string { const d=c-p; return (d>=0?'+':'')+d.toFixed(1)+'pp' }
function dC(c: number, p: number, bad=false): string {
  if(!p && p!==0) return GRAY
  return bad?(c>p?RED:GREEN):(c>p?GREEN:RED)
}

// ── SVG bar chart ─────────────────────────────────────────────────────────────
function svgBar(labels: string[], values: number[], color: string, w=500, h=160): string {
  const max = Math.max(...values.map(Math.abs), 1)
  const padL=8, padR=8, padT=24, padB=24
  const chartW = w - padL - padR
  const chartH = h - padT - padB
  const bw = Math.max(8, Math.floor(chartW / labels.length) - 6)

  const bars = labels.map((lbl, i) => {
    const v = values[i] || 0
    const bh = Math.max(3, Math.round(Math.abs(v) / max * chartH))
    const x = padL + i * (chartW / labels.length) + (chartW / labels.length - bw) / 2
    const y = padT + chartH - bh
    const col = v < 0 ? RED : color
    const valTxt = Math.abs(v) >= 1000 ? '$'+(Math.abs(v)/1000).toFixed(0)+'k' : fmt$(Math.abs(v))
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="#${col}" opacity="0.9"/>
<text x="${x+bw/2}" y="${y-5}" text-anchor="middle" font-size="9" fill="#${OFF}" font-family="Arial">${valTxt}</text>
<text x="${x+bw/2}" y="${h-6}" text-anchor="middle" font-size="9" fill="#${GRAY}" font-family="Arial">${lbl}</text>`
  }).join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<rect width="${w}" height="${h}" fill="#${CARD}" rx="6"/>
<line x1="${padL}" y1="${padT+chartH}" x2="${w-padR}" y2="${padT+chartH}" stroke="#2D3748" stroke-width="1"/>
${bars}</svg>`
}

// ── SVG line chart ─────────────────────────────────────────────────────────────
function svgLine(labels: string[], series: {values: number[]; color: string; label: string}[], w=500, h=160, suffix='%'): string {
  const allVals = series.flatMap(s => s.values).filter(v => !isNaN(v) && v !== 0)
  if (!allVals.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#${CARD}" rx="6"/><text x="${w/2}" y="${h/2}" text-anchor="middle" fill="#${GRAY}" font-size="11" font-family="Arial">Sin datos</text></svg>`
  const max = Math.max(...allVals) * 1.1
  const min = Math.min(0, Math.min(...allVals) * 0.9)
  const range = max - min || 1
  const padL=36, padR=12, padT=16, padB=32
  const chartW = w - padL - padR
  const chartH = h - padT - padB

  function px(i: number) { return padL + (labels.length > 1 ? i / (labels.length-1) * chartW : chartW/2) }
  function py(v: number) { return padT + (1 - (v - min) / range) * chartH }

  const gridLines = [0, 0.33, 0.66, 1].map(t => {
    const v = min + t * range
    const y = py(v)
    const txt = suffix === '%' ? v.toFixed(1)+'%' : '$'+(Math.abs(v)/1000).toFixed(0)+'k'
    return `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="#2D3748" stroke-width="0.5" stroke-dasharray="3,3"/>
<text x="${padL-3}" y="${y+3}" text-anchor="end" font-size="8" fill="#${GRAY}" font-family="Arial">${txt}</text>`
  }).join('\n')

  const paths = series.map(s => {
    const pts = s.values.map((v,i)=>`${px(i)},${py(v)}`).join(' ')
    const dots = s.values.map((v,i)=>`<circle cx="${px(i)}" cy="${py(v)}" r="3.5" fill="#${s.color}" stroke="#${BG}" stroke-width="1.5"/>`).join('')
    return `<polyline points="${pts}" fill="none" stroke="#${s.color}" stroke-width="2.5"/>
${dots}`
  }).join('\n')

  const xLabels = labels.map((l,i)=>`<text x="${px(i)}" y="${h-padB+16}" text-anchor="middle" font-size="9" fill="#${GRAY}" font-family="Arial">${l}</text>`).join('\n')
  const legend = series.map((s,i)=>`<rect x="${padL+i*110}" y="${h-13}" width="8" height="8" fill="#${s.color}" rx="2"/>
<text x="${padL+i*110+11}" y="${h-6}" font-size="9" fill="#${OFF}" font-family="Arial">${s.label}</text>`).join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<rect width="${w}" height="${h}" fill="#${CARD}" rx="6"/>
${gridLines}${paths}${xLabels}${legend}</svg>`
}

// ── SVG donut ─────────────────────────────────────────────────────────────────
function svgDonut(segments: {value: number; color: string; label: string}[], w=200, h=200): string {
  const total = segments.reduce((s,sg)=>s+sg.value,0)||1
  const cx=w/2, cy=h/2, r=Math.min(cx,cy)-12, ri=r*0.58
  let angle = -Math.PI/2
  const paths = segments.map(sg => {
    const a = Math.min((sg.value/total)*Math.PI*2, Math.PI*2-0.001)
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle)
    const x2=cx+r*Math.cos(angle+a), y2=cy+r*Math.sin(angle+a)
    const xi1=cx+ri*Math.cos(angle), yi1=cy+ri*Math.sin(angle)
    const xi2=cx+ri*Math.cos(angle+a), yi2=cy+ri*Math.sin(angle+a)
    const large=a>Math.PI?1:0
    const d=`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ri} ${ri} 0 ${large} 0 ${xi1} ${yi1} Z`
    angle+=a
    return `<path d="${d}" fill="#${sg.color}" stroke="#${BG}" stroke-width="2"/>`
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<rect width="${w}" height="${h}" fill="#${CARD}" rx="6"/>
${paths}</svg>`
}

// ── Helpers de slide ──────────────────────────────────────────────────────────
function base(pptx: any, logoUrl?: string): any {
  const slide = pptx.addSlide()
  slide.addShape('rect', { x:0, y:0, w:13.33, h:7.5, fill:{color:BG}, line:{color:BG} })
  if(logoUrl) {
    slide.addImage({ path:logoUrl, x:11.3, y:6.8, w:1.8, h:0.55, sizing:{type:'contain',w:1.8,h:0.55} })
  }
  return slide
}

function pageHdr(slide: any, title: string, subtitle: string, accentColor: string) {
  // Línea superior de acento
  slide.addShape('rect', { x:0, y:0, w:13.33, h:0.05, fill:{color:accentColor}, line:{color:accentColor} })
  // Header bar
  slide.addShape('rect', { x:0, y:0.05, w:13.33, h:0.75, fill:{color:HDR}, line:{color:HDR} })
  slide.addText(title, { x:0.35, y:0.07, w:8, h:0.65, fontSize:22, color:WHITE, bold:true, fontFace:'Arial' })
  slide.addText(subtitle, { x:8.5, y:0.22, w:4.65, h:0.35, fontSize:9, color:GRAY, align:'right', fontFace:'Arial' })
}

function kpiCard(slide: any, x: number, y: number, w: number, h: number,
  label: string, value: string, sub: string, delta: string, deltaColor: string, valueColor?: string) {
  slide.addShape('rect', { x, y, w, h, fill:{color:CARD}, line:{color:'2D3748'}, rectRadius:0.08 })
  slide.addText(label.toUpperCase(), { x:x+0.15, y:y+0.12, w:w-0.25, h:0.2, fontSize:7, color:LGRAY, charSpacing:0.8, fontFace:'Arial' })
  slide.addText(value, { x:x+0.15, y:y+0.3, w:w-0.25, h:0.55, fontSize:20, color:valueColor||WHITE, bold:true, fontFace:'Arial' })
  if(sub) slide.addText(sub, { x:x+0.15, y:y+0.83, w:w-0.25, h:0.18, fontSize:7.5, color:GRAY, fontFace:'Arial' })
  if(delta && delta !== '—') {
    slide.addShape('rect', { x:x+0.12, y:y+h-0.26, w:Math.min(w-0.24, 1.2), h:0.2, fill:{color:'1A2338'}, line:{color:'2D3748'}, rectRadius:0.05 })
    slide.addText(delta, { x:x+0.15, y:y+h-0.24, w:w-0.25, h:0.18, fontSize:8, color:deltaColor, bold:true, fontFace:'Arial' })
  }
}

async function svgImg(slide: any, svgStr: string, x: number, y: number, w: number, h: number) {
  try {
    const b64 = Buffer.from(svgStr).toString('base64')
    slide.addImage({ data:'data:image/svg+xml;base64,'+b64, x, y, w, h })
  } catch(_) {}
}

function sectionLabel(slide: any, txt: string, x: number, y: number, w: number) {
  slide.addText(txt, { x, y, w, h:0.2, fontSize:8, color:LGRAY, fontFace:'Arial', charSpacing:1 })
}

// ══════════════════════════════════════════════════════════════════════════════
// COVER
// ══════════════════════════════════════════════════════════════════════════════
function addCover(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null) {
  const slide = base(pptx, logoUrl)

  // Gradient overlay top
  slide.addShape('rect', { x:0, y:0, w:13.33, h:3.2, fill:{color:'111827'}, line:{color:'111827'} })
  slide.addShape('rect', { x:0, y:0, w:0.06, h:7.5, fill:{color:BLUE}, line:{color:BLUE} })

  if(logoUrl) {
    slide.addImage({ path:logoUrl, x:1.2, y:1.0, w:5.5, h:2.2, sizing:{type:'contain',w:5.5,h:2.2} })
  } else {
    slide.addText(restName.toUpperCase(), { x:0.5, y:0.8, w:12.33, h:1.8, fontSize:48, color:WHITE, bold:true, fontFace:'Arial', align:'left' })
  }

  slide.addText('REPORTE SEMANAL', { x:0.5, y:3.4, w:12, h:0.35, fontSize:10, color:LGRAY, charSpacing:5, fontFace:'Arial' })
  slide.addText(wL(cur.week), { x:0.5, y:3.75, w:12, h:0.65, fontSize:28, color:GOLD, bold:true, fontFace:'Arial' })
  if(prev) slide.addText('vs '+wL(prev.week), { x:0.5, y:4.45, w:12, h:0.3, fontSize:13, color:GRAY, fontFace:'Arial' })

  // Separator
  slide.addShape('line', { x:0.5, y:4.85, w:12.33, h:0, line:{color:'2D3748',width:1} })

  // KPI metrics row
  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const lC=n(cur?.labor?.total_pay), cC=n(cur?.cogs?.total)
  const lPct=sC>0?lC/sC*100:0, cPct=sC>0?cC/sC*100:0, profit=sC-lC-cC
  const metrics=[
    {l:'VENTAS NETAS',v:fmt$(sC),d:prev?d$(sC,sP):'',dc:dC(sC,sP),vc:BLUE},
    {l:'% LABOR',v:fmtPct(lPct),d:'',dc:GRAY,vc:PURPLE},
    {l:'% COGS',v:fmtPct(cPct),d:'',dc:GRAY,vc:ORANGE},
    {l:'PROFIT',v:fmt$(profit),d:'',dc:GRAY,vc:profit>=0?GREEN:RED},
  ]
  metrics.forEach((m,i)=>{
    kpiCard(slide, 0.5+i*3.18, 5.05, 3.05, 1.22, m.l, m.v, '', m.d, m.dc, m.vc)
  })

  slide.addText('Restaurant X-Ray · DineWise Solutions', { x:0.5, y:7.2, w:10, h:0.2, fontSize:7, color:'2D3748', fontFace:'Arial' })
}

// ══════════════════════════════════════════════════════════════════════════════
// RESUMEN EJECUTIVO
// ══════════════════════════════════════════════════════════════════════════════
async function addEjecutivo(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const lC=n(cur?.labor?.total_pay), lP=n(prev?.labor?.total_pay)
  const cC=n(cur?.cogs?.total), cP=n(prev?.cogs?.total)
  const wC=n(cur?.waste?.total_cost), wP=n(prev?.waste?.total_cost)
  const prC=sC-lC-cC, prP=sP-lP-cP
  const lpC=sC>0?lC/sC*100:0, lpP=sP>0?lP/sP*100:0
  const cpC=sC>0?cC/sC*100:0, cpP=sP>0?cP/sP*100:0
  const gC=n(cur?.sales?.guests), agC=gC>0?sC/gC:0

  pageHdr(slide,'RESUMEN EJECUTIVO', restName+' · '+wL(cur.week)+' vs '+wL(prev?.week||''), BLUE)

  // 6 KPIs top row
  const kW=13.33/6
  kpiCard(slide,0,      0.85,kW,1.28,'Ventas Netas',fmt$(sC),n(cur?.sales?.orders)+' órd',prev?d$(sC,sP):'',dC(sC,sP),BLUE)
  kpiCard(slide,kW,     0.85,kW,1.28,'Profit',fmt$(prC),sC>0?fmtPct(prC/sC*100):'—',prev?d$(prC,prP):'',dC(prC,prP),prC>=0?GREEN:RED)
  kpiCard(slide,kW*2,   0.85,kW,1.28,'% Labor',fmtPct(lpC),fmt$(lC),prev?dPp(lpC,lpP):'',dC(lpC,lpP,true),PURPLE)
  kpiCard(slide,kW*3,   0.85,kW,1.28,'% COGS',fmtPct(cpC),fmt$(cC),prev?dPp(cpC,cpP):'',dC(cpC,cpP,true),ORANGE)
  kpiCard(slide,kW*4,   0.85,kW,1.28,'Waste $',fmt$(wC),'',prev?d$(wC,wP):'',dC(wC,wP,true),RED)
  const agStr=agC>0?'$'+agC.toFixed(2):'—'
  kpiCard(slide,kW*5,   0.85,kW,1.28,'Avg/Guest',agStr,String(gC)+' guests','',GRAY,GOLD)

  // Charts row
  const hist=data.weeks.slice(-6)
  const svgSales=svgBar(hist.map(w=>wL(w.week)), hist.map(w=>n(w.sales?.net_sales)), BLUE, 540, 155)
  await svgImg(slide, svgSales, 0.15, 2.2, 7.3, 2.1)

  const histLP=hist.map(w=>{ const s=n(w.sales?.net_sales); return s>0?n(w.labor?.total_pay)/s*100:0 })
  const histCP=hist.map(w=>{ const s=n(w.sales?.net_sales); return s>0?n(w.cogs?.total)/s*100:0 })
  const svgPcts=svgLine(hist.map(w=>wL(w.week)),[
    {values:histLP,color:PURPLE,label:'% Labor'},
    {values:histCP,color:ORANGE,label:'% COGS'},
  ], 380, 155, '%')
  await svgImg(slide, svgPcts, 7.6, 2.2, 5.57, 2.1)

  // Summary table
  if(prev) {
    const metrics=[
      ['Ventas Netas',fmt$(sC),fmt$(sP),d$(sC,sP),dC(sC,sP)],
      ['% Labor',fmtPct(lpC),fmtPct(lpP),dPp(lpC,lpP),dC(lpC,lpP,true)],
      ['% COGS',fmtPct(cpC),fmtPct(cpP),dPp(cpC,cpP),dC(cpC,cpP,true)],
      ['Profit $',fmt$(prC),fmt$(prP),d$(prC,prP),dC(prC,prP)],
      ['Waste $',fmt$(wC),fmt$(wP),d$(wC,wP),dC(wC,wP,true)],
    ]
    const TY=4.42, TH=0.3, cols=[3.5,2.3,2.3,2.5,2.63]
    // Header
    slide.addShape('rect',{x:0.15,y:TY,w:13.03,h:0.28,fill:{color:'111827'},line:{color:'2D3748'}})
    ;['MÉTRICA',wL(cur.week),wL(prev.week),'Δ',''].forEach((h,i)=>{
      const x=0.25+[0,3.5,5.8,8.1,10.6][i]
      slide.addText(h,{x,y:TY+0.07,w:cols[i]-0.1,h:0.18,fontSize:7.5,color:LGRAY,bold:true,fontFace:'Arial',align:i>0?'right':'left'})
    })
    metrics.forEach((r,ri)=>{
      const y=TY+0.28+ri*TH
      slide.addShape('rect',{x:0.15,y,w:13.03,h:TH,fill:{color:ri%2===0?CARD:'1A1D27'},line:{color:'2D3748'}})
      slide.addText(r[0],{x:0.25,y:y+0.07,w:3.4,h:0.18,fontSize:8.5,color:OFF,bold:true,fontFace:'Arial'})
      slide.addText(r[1],{x:3.75,y:y+0.07,w:2.2,h:0.18,fontSize:8.5,color:WHITE,bold:true,align:'right',fontFace:'Arial'})
      slide.addText(r[2],{x:6.05,y:y+0.07,w:2.2,h:0.18,fontSize:8.5,color:GRAY,align:'right',fontFace:'Arial'})
      slide.addText(r[3],{x:8.35,y:y+0.07,w:2.4,h:0.18,fontSize:9,color:r[4],bold:true,align:'right',fontFace:'Arial'})
    })
  }
  if(note) slide.addText('📝 '+note,{x:0.3,y:6.95,w:12.73,h:0.3,fontSize:8,color:AMBER,italic:true,fontFace:'Arial'})
}

// ══════════════════════════════════════════════════════════════════════════════
// VENTAS
// ══════════════════════════════════════════════════════════════════════════════
async function addVentas(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const oC=n(cur?.sales?.orders), oP=n(prev?.sales?.orders)
  const gC=n(cur?.sales?.guests), gP=n(prev?.sales?.guests)
  const agC=gC>0?sC/gC:0, agP=gP>0?sP/gP:0
  const dC2=n(cur?.sales?.discounts), dP=n(prev?.sales?.discounts)

  pageHdr(slide,'VENTAS', restName+' · '+wL(cur.week), BLUE)

  const kW=13.33/5
  const agCStr=agC>0?'$'+agC.toFixed(2):'—'
  const agPStr=prev?wL(prev.week)+': $'+agP.toFixed(2):''
  const agDelta=prev&&agP>0?(agC>agP?'+$':'-$')+Math.abs(agC-agP).toFixed(2):''
  kpiCard(slide,0,     0.85,kW,1.25,'Ventas Netas',fmt$(sC),prev?wL(prev.week)+': '+fmt$(sP):'',prev?d$(sC,sP):'',dC(sC,sP),BLUE)
  kpiCard(slide,kW,    0.85,kW,1.25,'Órdenes',String(oC),prev?wL(prev.week)+': '+String(oP):'',prev?d$(oC,oP):'',dC(oC,oP))
  kpiCard(slide,kW*2,  0.85,kW,1.25,'Guests',String(gC),prev?wL(prev.week)+': '+String(gP):'',prev?d$(gC,gP):'',dC(gC,gP),PURPLE)
  kpiCard(slide,kW*3,  0.85,kW,1.25,'Avg/Guest',agCStr,agPStr,agDelta,dC(agC,agP),GOLD)
  const descPctStr = sC>0 ? (dC2/sC*100).toFixed(1)+'% de ventas' : ''
  kpiCard(slide,kW*4,  0.85,kW,1.25,'Descuentos',fmt$(dC2),descPctStr,prev?d$(dC2,dP):'',dC(dC2,dP,true),RED)

  // Gráfica barras ventas
  const hist=data.weeks.slice(-6)
  const svgSales=svgBar(hist.map(w=>wL(w.week)), hist.map(w=>n(w.sales?.net_sales)), BLUE, 530, 165)
  await svgImg(slide, svgSales, 0.15, 2.18, 7.15, 2.22)

  // Donut categorías
  const cats: any[]=cur?.sales?.categories||[]
  const catColors=[ORANGE,BLUE,PURPLE,GREEN,GOLD,PINK,CYAN,TEAL]
  const donutSegs=cats.sort((a:any,b:any)=>n(b.net)-n(a.net)).slice(0,7).map((c:any,i:number)=>({
    value:n(c.net), color:catColors[i%catColors.length], label:c.name
  }))
  if(donutSegs.length) {
    const svgD=svgDonut(donutSegs, 190, 190)
    await svgImg(slide, svgD, 7.45, 2.18, 2.6, 2.22)
    donutSegs.forEach((sg,i)=>{
      const pct=sC>0?(sg.value/sC*100).toFixed(1)+'%':'—'
      const ly=2.28+i*0.28
      slide.addShape('rect',{x:10.2,y:ly+0.05,w:0.14,h:0.14,fill:{color:sg.color},line:{color:sg.color},rectRadius:0.02})
      slide.addText(sg.label+' · '+pct,{x:10.42,y:ly,w:2.98,h:0.24,fontSize:8.5,color:OFF,fontFace:'Arial'})
    })
  }

  // Avg/Guest line chart
  const svgAvg=svgLine(hist.map(w=>wL(w.week)),[
    {values:hist.map(w=>{ const g=n(w.sales?.guests); return g>0?n(w.sales?.net_sales)/g:0 }),color:GOLD,label:'Avg/Guest'},
  ], 530, 130, '$')
  await svgImg(slide, svgAvg, 0.15, 4.5, 7.15, 1.75)

  // Revenue centers
  const rc: any[]=cur?.sales?.revenue_centers||[]
  if(rc.length) {
    sectionLabel(slide,'REVENUE CENTERS',7.45,4.52,5.7)
    rc.slice(0,6).forEach((r:any,i:number)=>{
      const y=4.75+i*0.32
      const pct=sC>0?n(r.net)/sC:0
      slide.addText(r.name,{x:7.45,y,w:3.5,h:0.26,fontSize:8.5,color:OFF,fontFace:'Arial'})
      slide.addShape('rect',{x:10.2,y:y+0.04,w:Math.max(0.05,pct*2.5),h:0.18,fill:{color:BLUE},line:{color:BLUE},rectRadius:0.03})
      slide.addText(fmt$(n(r.net)),{x:12.8,y,w:0.7,h:0.26,fontSize:8,color:LGRAY,align:'right',fontFace:'Arial'})
    })
  }

  if(note) slide.addText('📝 '+note,{x:0.3,y:6.95,w:12.73,h:0.3,fontSize:8,color:AMBER,italic:true,fontFace:'Arial'})
}

// ══════════════════════════════════════════════════════════════════════════════
// LABOR
// ══════════════════════════════════════════════════════════════════════════════
async function addLabor(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const lC=n(cur?.labor?.total_pay), lP=n(prev?.labor?.total_pay)
  const hC=n(cur?.labor?.total_hours), hP=n(prev?.labor?.total_hours)
  const otC=n(cur?.labor?.total_ot_hours), otP=n(prev?.labor?.total_ot_hours)
  const lpC=sC>0?lC/sC*100:0, lpP=sP>0?lP/sP*100:0
  const positions: any[]=cur?.labor?.by_position||[]

  pageHdr(slide,'LABOR', restName+' · '+wL(cur.week), PURPLE)

  const kW=13.33/4
  kpiCard(slide,0,     0.85,kW,1.25,'% Labor Cost',fmtPct(lpC),fmt$(lC),prev?dPp(lpC,lpP):'',dC(lpC,lpP,true),PURPLE)
  const hcStr=hC.toFixed(0)+'h'
  const hpStr=prev?wL(prev.week)+': '+hP.toFixed(0)+'h':''
  const otcStr=otC.toFixed(1)+'h'
  const otpStr=prev?wL(prev.week)+': '+otP.toFixed(1)+'h':''
  kpiCard(slide,kW,    0.85,kW,1.25,'Horas Regulares',hcStr,hpStr,prev?d$(hC,hP):'',dC(hC,hP,true))
  kpiCard(slide,kW*2,  0.85,kW,1.25,'Overtime',otcStr,otpStr,'',otC>0?RED:GREEN,otC>0?RED:GREEN)
  kpiCard(slide,kW*3,  0.85,kW,1.25,'Costo Total',fmt$(lC),String(cur?.labor?.by_employee?.length||0)+' empleados',prev?d$(lC,lP):'',dC(lC,lP,true))

  // % Labor trend
  const hist=data.weeks.slice(-6)
  const histLP=hist.map(w=>{ const s=n(w.sales?.net_sales); return s>0?n(w.labor?.total_pay)/s*100:0 })
  const svgL=svgLine(hist.map(w=>wL(w.week)),[{values:histLP,color:PURPLE,label:'% Labor'}], 430, 160, '%')
  await svgImg(slide, svgL, 0.15, 2.18, 5.8, 2.18)

  // Horas/OT stacked
  const svgH=svgBar(hist.map(w=>wL(w.week)), hist.map(w=>n(w.labor?.total_hours)), BLUE, 430, 160)
  await svgImg(slide, svgH, 6.1, 2.18, 5.8, 2.18 )

  // Labor por puesto
  if(positions.length) {
    sectionLabel(slide,'LABOR POR PUESTO — '+wL(cur.week),0.15,4.45,13.03)
    const cols=[3.5,1.4,1.3,1.4,1.3,1.4,1.3,1.23]
    slide.addShape('rect',{x:0.15,y:4.65,w:13.03,h:0.27,fill:{color:'111827'},line:{color:'2D3748'}})
    ;['PUESTO',wL(prev?.week||'')+' HRS','OT',wL(prev?.week||'')+' $',wL(cur.week)+' HRS','OT',wL(cur.week)+' $',''].forEach((h,i)=>{
      const xOff=[0,3.5,4.9,6.2,7.6,9.0,10.3,11.6]
      slide.addText(h,{x:0.25+xOff[i],y:4.68,w:cols[i]-0.1,h:0.2,fontSize:7,color:LGRAY,bold:true,fontFace:'Arial',align:i>0?'right':'left'})
    })
    const prevPos: Record<string,any>={}
    if(prev?.labor?.by_position) prev.labor.by_position.forEach((p:any)=>{prevPos[p.position]=p})
    positions.slice(0,8).forEach((pos:any,i:number)=>{
      const y=4.92+i*0.3
      const pp=prevPos[pos.position]
      const hasOT=n(pos.ot_hours)>0
      slide.addShape('rect',{x:0.15,y,w:13.03,h:0.3,fill:{color:i%2===0?CARD:'1A1D27'},line:{color:'2D3748'}})
      slide.addText(pos.position,{x:0.25,y:y+0.08,w:3.4,h:0.18,fontSize:8,color:OFF,bold:true,fontFace:'Arial'})
      slide.addText(pp?n(pp.regular_hours).toFixed(0)+'h':'—',{x:3.75,y:y+0.08,w:1.3,h:0.18,fontSize:8,color:GRAY,align:'right',fontFace:'Arial'})
      slide.addText(pp&&n(pp.ot_hours)>0?n(pp.ot_hours).toFixed(1)+'h':'—',{x:5.15,y:y+0.08,w:1.2,h:0.18,fontSize:8,color:GRAY,align:'right',fontFace:'Arial'})
      slide.addText(pp?fmt$(n(pp.total_pay)):'—',{x:6.45,y:y+0.08,w:1.3,h:0.18,fontSize:8,color:GRAY,align:'right',fontFace:'Arial'})
      slide.addText(n(pos.regular_hours).toFixed(0)+'h',{x:7.85,y:y+0.08,w:1.3,h:0.18,fontSize:8,color:WHITE,bold:true,align:'right',fontFace:'Arial'})
      slide.addText(hasOT?n(pos.ot_hours).toFixed(1)+'h':'—',{x:9.25,y:y+0.08,w:1.3,h:0.18,fontSize:8,color:hasOT?AMBER:GRAY,bold:hasOT,align:'right',fontFace:'Arial'})
      slide.addText(fmt$(n(pos.total_pay)),{x:10.55,y:y+0.08,w:1.3,h:0.18,fontSize:8,color:WHITE,bold:true,align:'right',fontFace:'Arial'})
    })
  }
  if(note) slide.addText('📝 '+note,{x:0.3,y:6.95,w:12.73,h:0.3,fontSize:8,color:AMBER,italic:true,fontFace:'Arial'})
}

// ══════════════════════════════════════════════════════════════════════════════
// FOOD COST (COGS)
// ══════════════════════════════════════════════════════════════════════════════
async function addFoodCost(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const cogs=cur?.cogs?.by_category||{}, pCogs=prev?.cogs?.by_category||{}
  const sC=n(cur?.sales?.net_sales), sP=n(prev?.sales?.net_sales)
  const totalC=n(cur?.cogs?.total), totalP=n(prev?.cogs?.total)

  pageHdr(slide,'FOOD COST / COMPRAS', restName+' · '+wL(cur.week), ORANGE)

  const catDefs=[
    {key:'food',label:'Food',color:ORANGE},
    {key:'na_beverage',label:'NA Bev',color:CYAN},
    {key:'liquor',label:'Liquor',color:PURPLE},
    {key:'beer',label:'Beer',color:GOLD},
    {key:'wine',label:'Wine',color:PINK},
    {key:'general',label:'General',color:GRAY},
  ]
  const active=catDefs.filter(c=>n((cogs as any)[c.key])>0||n((pCogs as any)[c.key])>0)
  const kW=13.33/Math.max(active.length,1)
  active.forEach((c,i)=>{
    const val=n((cogs as any)[c.key]), pval=n((pCogs as any)[c.key])
    const pct=sC>0?val/sC*100:0, ppct=sP>0?pval/sP*100:0
    kpiCard(slide,i*kW,0.85,kW,1.25,c.label,fmtPct(pct),fmt$(val),prev?dPp(pct,ppct):'',prev?dC(pct,ppct,true):GRAY,c.color)
  })

  // Gráfica % COGS trend
  const hist=data.weeks.slice(-6)
  const histCP=hist.map(w=>{ const s=n(w.sales?.net_sales); return s>0?n(w.cogs?.total)/s*100:0 })
  const svgC=svgLine(hist.map(w=>wL(w.week)),[{values:histCP,color:ORANGE,label:'% COGS Total'}], 500, 160, '%')
  await svgImg(slide, svgC, 0.15, 2.18, 6.75, 2.16)

  // Gráfica $ compras por categoría (stacked bars)
  const catColors=active.map(c=>c.color)
  const svgBars=svgBar(hist.map(w=>wL(w.week)), hist.map(w=>n(w.cogs?.total)), ORANGE, 430, 160)
  await svgImg(slide, svgBars, 7.05, 2.18, 5.82, 2.16)

  // Multi-line % por categoría
  const svgCats=svgLine(
    hist.map(w=>wL(w.week)),
    active.slice(0,5).map(c=>({
      values:hist.map(w=>{ const s=n(w.sales?.net_sales); return s>0?n((w.cogs?.by_category as any)?.[c.key]||0)/s*100:0 }),
      color:c.color, label:c.label
    })),
    810, 165, '%'
  )
  await svgImg(slide, svgCats, 0.15, 4.42, 10.92, 2.22)

  // Total KPI
  slide.addShape('rect',{x:11.2,y:4.42,w:2.0,h:1.05,fill:{color:CARD},line:{color:'2D3748'},rectRadius:0.08})
  slide.addText('TOTAL COGS',{x:11.3,y:4.52,w:1.8,h:0.2,fontSize:7.5,color:LGRAY,fontFace:'Arial'})
  slide.addText(fmt$(totalC),{x:11.3,y:4.7,w:1.8,h:0.4,fontSize:18,color:WHITE,bold:true,fontFace:'Arial'})
  if(prev) slide.addText(d$(totalC,totalP),{x:11.3,y:5.1,w:1.8,h:0.2,fontSize:9,color:dC(totalC,totalP,true),bold:true,fontFace:'Arial'})

  if(note) slide.addText('📝 '+note,{x:0.3,y:6.95,w:12.73,h:0.3,fontSize:8,color:AMBER,italic:true,fontFace:'Arial'})
}

// ══════════════════════════════════════════════════════════════════════════════
// COSTO DE USO
// ══════════════════════════════════════════════════════════════════════════════
async function addCostoUso(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)

  // Calcular datos de costo de uso
  const ACCOUNT_MAP: Record<string,string>={'Food Inventory':'food','Food bar Inventory':'liquor','Beer':'beer','Alcoholic Inventory':'liquor','Beverage Inventory':'na_beverage','Wine Inventory':'wine'}
  const CATS=[
    {key:'food',label:'Food',color:ORANGE},
    {key:'na_beverage',label:'NA Bev',color:CYAN},
    {key:'liquor',label:'Liquor',color:PURPLE},
    {key:'beer',label:'Beer',color:GOLD},
    {key:'wine',label:'Wine',color:PINK},
  ]

  function getInvCat(invAccounts: any[], catKey: string) {
    const accs=Object.entries(ACCOUNT_MAP).filter(([_,c])=>c===catKey).map(([a])=>a)
    return {
      current:invAccounts.filter(a=>accs.includes(a.account)).reduce((s,a)=>s+n(a.current_value),0),
      previous:invAccounts.filter(a=>accs.includes(a.account)).reduce((s,a)=>s+n(a.previous_value),0),
    }
  }

  const invAccs=cur?.inventory?.by_account||[]
  const cogsCat=cur?.cogs?.by_category||{}
  const hasInv=invAccs.length>0

  let totalUso=0, totalSales=0, totalTheo=0
  const catData=CATS.map(cat=>{
    const inv=getInvCat(invAccs,cat.key)
    const purchases=n((cogsCat as any)[cat.key])
    const uso=hasInv?Math.max(inv.previous+purchases-inv.current,0):0
    const catSales=n(cur?.sales?.net_sales||0)/CATS.length // simplificado
    const theo=n(cur?.productMix?.theo_cost_by_category?.[cat.key]||0)
    const realPct=catSales>0?uso/catSales*100:0
    const mixPct=catSales>0?theo/catSales*100:0
    totalUso+=uso; totalSales+=catSales; totalTheo+=theo
    return {cat,uso,realPct,mixPct}
  })
  const totalRealPct=totalSales>0?totalUso/totalSales*100:0
  const totalMixPct=totalSales>0?totalTheo/totalSales*100:0
  const totalVariacion=totalRealPct&&totalMixPct?(totalRealPct-totalMixPct)/100*totalSales:0

  pageHdr(slide,'COSTO DE USO', restName+' · '+wL(cur.week), TEAL)

  const kW=13.33/4
  const realPctStr=totalRealPct?totalRealPct.toFixed(1)+'%':'—'
  const mixPctStr=totalMixPct?totalMixPct.toFixed(1)+'%':'—'
  const usoSubStr=fmt$(totalUso)+' uso'
  const theoSubStr=fmt$(totalTheo)+' teórico'
  kpiCard(slide,0,     0.85,kW,1.25,'% Costo Real A&B',realPctStr,usoSubStr,'',GRAY,BLUE)
  kpiCard(slide,kW,    0.85,kW,1.25,'% Costo P.Mix',mixPctStr,theoSubStr,'',GRAY,GREEN)
  kpiCard(slide,kW*2,  0.85,kW,1.25,'Variación $',(totalVariacion>0?'+':'')+fmt$(totalVariacion),'','',(totalVariacion>0?RED:GREEN),totalVariacion>0?RED:GREEN)
  kpiCard(slide,kW*3,  0.85,kW,1.25,'Inv. Actual',fmt$(cur?.inventory?.grand_total_current||0),'cierre semana','',GRAY)

  // Chart % Real vs P.Mix por semana
  const hist=data.weeks.slice(-6)
  const histReal=hist.map(w=>{
    const inv2=w.inventory?.by_account||[]
    const cogs2=w.cogs?.by_category||{}
    const sales2=n(w.sales?.net_sales||1)
    let uso2=0
    CATS.forEach(cat=>{
      const i2=getInvCat(inv2,cat.key)
      const pur2=n((cogs2 as any)[cat.key])
      uso2+=Math.max(i2.previous+pur2-i2.current,0)
    })
    return sales2>0?uso2/sales2*100:0
  })
  const histMix=hist.map(w=>{
    const sales2=n(w.sales?.net_sales||1)
    const theo2=CATS.reduce((s,cat)=>s+n(w.productMix?.theo_cost_by_category?.[cat.key]||0),0)
    return sales2>0?theo2/sales2*100:0
  })
  const svgCU=svgLine(hist.map(w=>wL(w.week)),[
    {values:histReal,color:BLUE,label:'% Real'},
    {values:histMix,color:GREEN,label:'% P.Mix'},
  ],540,170,'%')
  await svgImg(slide, svgCU, 0.15, 2.18, 7.28, 2.3)

  // Variación $ por semana
  const histVar=hist.map((w,i)=>{
    const r=histReal[i], m=histMix[i]
    const s=n(w.sales?.net_sales||0)
    return r&&m?(r-m)/100*s:0
  })
  const svgVar=svgBar(hist.map(w=>wL(w.week)), histVar, RED, 430, 170)
  await svgImg(slide, svgVar, 7.6, 2.18, 5.55, 2.3)

  // Cards por categoría
  if(hasInv) {
    sectionLabel(slide,'DETALLE POR CATEGORÍA',0.15,4.56,13.03)
    const cW=13.33/CATS.length
    CATS.forEach((cat,i)=>{
      const d=catData[i]
      const x=i*cW
      slide.addShape('rect',{x,y:4.75,w:cW-0.06,h:1.52,fill:{color:CARD},line:{color:'2D3748'},rectRadius:0.06})
      slide.addShape('rect',{x,y:4.75,w:cW-0.06,h:0.08,fill:{color:cat.color},line:{color:cat.color},rectRadius:0.05})
      slide.addText(cat.label,{x:x+0.12,y:4.84,w:cW-0.2,h:0.22,fontSize:8,color:LGRAY,fontFace:'Arial'})
      slide.addText(d.realPct?d.realPct.toFixed(1)+'%':'—',{x:x+0.12,y:5.06,w:cW-0.2,h:0.42,fontSize:16,color:d.realPct>35?RED:WHITE,bold:true,fontFace:'Arial'})
      slide.addText('Real',{x:x+0.12,y:5.46,w:(cW-0.2)/2,h:0.18,fontSize:7,color:GRAY,fontFace:'Arial'})
      slide.addText(d.mixPct?d.mixPct.toFixed(1)+'%':'—',{x:x+(cW-0.2)/2+0.12,y:5.46,w:(cW-0.2)/2,h:0.18,fontSize:9,color:GREEN,bold:true,align:'right',fontFace:'Arial'})
      slide.addText('P.Mix',{x:x+(cW-0.2)/2+0.12,y:5.62,w:(cW-0.2)/2,h:0.16,fontSize:6.5,color:GRAY,align:'right',fontFace:'Arial'})
    })
  }
  if(note) slide.addText('📝 '+note,{x:0.3,y:6.95,w:12.73,h:0.3,fontSize:8,color:AMBER,italic:true,fontFace:'Arial'})
}

// ══════════════════════════════════════════════════════════════════════════════
// WASTE
// ══════════════════════════════════════════════════════════════════════════════
async function addWaste(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const wC=n(cur?.waste?.total_cost), wP=n(prev?.waste?.total_cost)
  const items: any[]=cur?.waste?.items||[]

  pageHdr(slide,'WASTE / MERMA', restName+' · '+wL(cur.week), RED)

  const kW=13.33/4
  kpiCard(slide,0,     0.85,kW,1.25,'Waste '+wL(cur.week),fmt$(wC),'',prev?d$(wC,wP):'',dC(wC,wP,true),RED)
  kpiCard(slide,kW,    0.85,kW,1.25,'Waste '+(prev?wL(prev.week):'Anterior'),prev?fmt$(wP):'—','','',GRAY)
  kpiCard(slide,kW*2,  0.85,kW,1.25,'Δ',prev?d$(wC,wP):'—','','',prev?dC(wC,wP,true):GRAY)
  kpiCard(slide,kW*3,  0.85,kW,1.25,'Items',String(items.length),'','',GRAY)

  const hist=data.weeks.slice(-6)
  const svgW=svgLine(hist.map(w=>wL(w.week)),[{values:hist.map(w=>n(w.waste?.total_cost)),color:RED,label:'Waste $'}], 530, 175, '$')
  await svgImg(slide, svgW, 0.15, 2.18, 7.15, 2.37)

  // Top items
  const top=items.sort((a:any,b:any)=>n(b.cost)-n(a.cost)).slice(0,10)
  if(top.length) {
    sectionLabel(slide,'TOP ITEMS DE MERMA — '+wL(cur.week),7.45,2.18,5.7)
    const TY=2.4
    slide.addShape('rect',{x:7.45,y:TY,w:5.72,h:0.27,fill:{color:'111827'},line:{color:'2D3748'}})
    slide.addText('ITEM',{x:7.55,y:TY+0.07,w:3.5,h:0.18,fontSize:7,color:LGRAY,bold:true,fontFace:'Arial'})
    slide.addText('COSTO $',{x:12.0,y:TY+0.07,w:1.0,h:0.18,fontSize:7,color:LGRAY,bold:true,align:'right',fontFace:'Arial'})
    top.forEach((item:any,i:number)=>{
      const y=TY+0.27+i*0.28
      slide.addShape('rect',{x:7.45,y,w:5.72,h:0.28,fill:{color:i%2===0?CARD:'1A1D27'},line:{color:'2D3748'}})
      slide.addText((item.item_name||item.name||'—').substring(0,30),{x:7.55,y:y+0.07,w:3.7,h:0.18,fontSize:8,color:OFF,fontFace:'Arial'})
      slide.addText(fmt$(n(item.cost)),{x:11.9,y:y+0.07,w:1.1,h:0.18,fontSize:8.5,color:RED,bold:true,align:'right',fontFace:'Arial'})
    })
  }

  // Barras waste por categoría si hay datos
  const byCategory: Record<string,number>={}
  items.forEach((item:any)=>{const c=item.category||'Otros'; byCategory[c]=(byCategory[c]||0)+n(item.cost)})
  if(Object.keys(byCategory).length>1) {
    const cats=Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).slice(0,6)
    const svgCat=svgBar(cats.map(c=>c[0].substring(0,8)), cats.map(c=>c[1]), ORANGE, 530, 150)
    await svgImg(slide, svgCat, 0.15, 4.65, 7.15, 2.0)
  }
  if(note) slide.addText('📝 '+note,{x:0.3,y:6.95,w:12.73,h:0.3,fontSize:8,color:AMBER,italic:true,fontFace:'Arial'})
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTUAL VS TEÓRICO
// ══════════════════════════════════════════════════════════════════════════════
async function addAvt(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null, data: ExportData, note: string) {
  const slide = base(pptx, logoUrl)
  const avt=cur?.avt
  const shortage=n(avt?.total_shortage_dollar), overage=n(avt?.total_overage_dollar), net=n(avt?.net_variance)
  const items: any[]=avt?.all_items||[]
  const shortCount=items.filter((i:any)=>n(i.variance_dollar)>0).length
  const overCount=items.filter((i:any)=>n(i.variance_dollar)<0).length

  pageHdr(slide,'ACTUAL VS TEÓRICO', restName+' · '+wL(cur.week), AMBER)

  const kW=13.33/5
  kpiCard(slide,0,     0.85,kW,1.25,'Faltantes (#)',String(shortCount),'','',RED,RED)
  kpiCard(slide,kW,    0.85,kW,1.25,'Faltantes ($)',fmt$(shortage),'','',RED,RED)
  kpiCard(slide,kW*2,  0.85,kW,1.25,'Sobrantes (#)',String(overCount),'','',GREEN,GREEN)
  kpiCard(slide,kW*3,  0.85,kW,1.25,'Sobrantes ($)',fmt$(overage),'','',GREEN,GREEN)
  kpiCard(slide,kW*4,  0.85,kW,1.25,'Neto',(net>0?'+':'')+fmt$(net),net>0?'pérdida':'ganancia','',net>0?RED:GREEN,net>0?RED:GREEN)

  // Trend faltantes/sobrantes
  const hist=data.weeks.slice(-6)
  const svgAvt=svgLine(hist.map(w=>wL(w.week)),[
    {values:hist.map(w=>n(w.avt?.total_shortage_dollar)),color:RED,label:'Faltantes $'},
    {values:hist.map(w=>n(w.avt?.total_overage_dollar)),color:GREEN,label:'Sobrantes $'},
  ], 530, 175, '$')
  await svgImg(slide, svgAvt, 0.15, 2.18, 7.15, 2.37)

  // Top faltantes
  const sorted=[...items].sort((a:any,b:any)=>Math.abs(n(b.variance_dollar))-Math.abs(n(a.variance_dollar)))
  const faltantes=sorted.filter((i:any)=>n(i.variance_dollar)>0).slice(0,8)
  const sobrantes=sorted.filter((i:any)=>n(i.variance_dollar)<0).slice(0,8)

  const half=6.0
  ;[{items:faltantes,title:'🔴 TOP FALTANTES',color:RED,x:7.45},
    {items:sobrantes,title:'🟢 TOP SOBRANTES',color:GREEN,x:7.45}
  ].forEach(({items:lst,title,color,x})=>{
    const isF=color===RED
    const baseY=isF?2.18:4.55
    slide.addShape('rect',{x,y:baseY,w:5.72,h:0.27,fill:{color:isF?'2D0A0A':'0A2D0A'},line:{color:'2D3748'}})
    slide.addText(title,{x:x+0.1,y:baseY+0.07,w:5.5,h:0.18,fontSize:9,color:isF?RED:GREEN,bold:true,fontFace:'Arial'})
    const TY=baseY+0.27
    lst.forEach((item:any,i:number)=>{
      const y=TY+i*0.28
      slide.addShape('rect',{x,y,w:5.72,h:0.28,fill:{color:i%2===0?CARD:'1A1D27'},line:{color:'2D3748'}})
      slide.addText((item.item_name||item.name||'—').substring(0,28),{x:x+0.1,y:y+0.07,w:3.7,h:0.18,fontSize:8,color:OFF,fontFace:'Arial'})
      slide.addText((isF?'+':'-')+fmt$(Math.abs(n(item.variance_dollar))),{x:x+3.9,y:y+0.07,w:1.6,h:0.18,fontSize:8.5,color:isF?RED:GREEN,bold:true,align:'right',fontFace:'Arial'})
    })
  })
  if(note) slide.addText('📝 '+note,{x:0.3,y:6.95,w:12.73,h:0.3,fontSize:8,color:AMBER,italic:true,fontFace:'Arial'})
}

// ══════════════════════════════════════════════════════════════════════════════
// DESCUENTOS
// ══════════════════════════════════════════════════════════════════════════════
async function addDescuentos(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null, note: string) {
  const disc=(cur as any)?.discounts, pDisc=(prev as any)?.discounts
  const totalC=n(disc?.total), totalP=n(pDisc?.total), sC=n(cur?.sales?.net_sales)
  const items: any[]=disc?.items||[]
  if(!totalC && !items.length) return // skip si vacío

  const slide = base(pptx, logoUrl)
  pageHdr(slide,'DESCUENTOS', restName+' · '+wL(cur.week), PINK)

  const applic=items.length
  const kW=13.33/5
  kpiCard(slide,0,     0.85,kW,1.25,'Total Descuentos',fmt$(totalC),'',prev?d$(totalC,totalP):'',dC(totalC,totalP,true),RED)
  const discPctA = sC>0 ? (totalC/sC*100).toFixed(1)+'%' : '—'
  kpiCard(slide,kW,    0.85,kW,1.25,'% de Ventas',discPctA,'','',GRAY)
  kpiCard(slide,kW*2,  0.85,kW,1.25,'Aplicaciones',String(applic),'','',GRAY)
  kpiCard(slide,kW*3,  0.85,kW,1.25,wL(prev?.week||'')+' Total',prev?fmt$(totalP):'—','','',GRAY)
  kpiCard(slide,kW*4,  0.85,kW,1.25,'Δ',prev?d$(totalC,totalP):'—','','',prev?dC(totalC,totalP,true):GRAY)

  // Agrupar por nombre
  const grouped: Record<string,{aplic:number;total:number}>={}
  items.forEach((item:any)=>{
    const nm=item.discount_name||item.name||'—'
    if(!grouped[nm]) grouped[nm]={aplic:0,total:0}
    grouped[nm].aplic++
    grouped[nm].total+=n(item.amount??item.total??0)
  })
  const rows=Object.entries(grouped).sort((a,b)=>b[1].total-a[1].total).slice(0,14)

  if(rows.length) {
    const TY=2.18, TH=0.3
    slide.addShape('rect',{x:0.15,y:TY,w:13.03,h:0.27,fill:{color:'111827'},line:{color:'2D3748'}})
    slide.addText('DESCUENTO',{x:0.25,y:TY+0.07,w:5,h:0.18,fontSize:7,color:LGRAY,bold:true,fontFace:'Arial'})
    slide.addText('APLIC.',{x:5.4,y:TY+0.07,w:1.5,h:0.18,fontSize:7,color:LGRAY,bold:true,align:'right',fontFace:'Arial'})
    slide.addText('MONTO',{x:7.2,y:TY+0.07,w:2,h:0.18,fontSize:7,color:LGRAY,bold:true,align:'right',fontFace:'Arial'})
    slide.addText('% DE TOTAL',{x:9.5,y:TY+0.07,w:1.8,h:0.18,fontSize:7,color:LGRAY,bold:true,align:'right',fontFace:'Arial'})
    rows.forEach(([nm,d],i)=>{
      const y=TY+0.27+i*TH
      slide.addShape('rect',{x:0.15,y,w:13.03,h:TH,fill:{color:i%2===0?CARD:'1A1D27'},line:{color:'2D3748'}})
      slide.addText(nm,{x:0.25,y:y+0.08,w:5,h:0.18,fontSize:8.5,color:OFF,fontFace:'Arial'})
      slide.addText(String(d.aplic),{x:5.4,y:y+0.08,w:1.5,h:0.18,fontSize:8,color:GRAY,align:'right',fontFace:'Arial'})
      slide.addText(fmt$(d.total),{x:7.2,y:y+0.08,w:2,h:0.18,fontSize:9,color:RED,bold:true,align:'right',fontFace:'Arial'})
      slide.addText(totalC>0?(d.total/totalC*100).toFixed(1)+'%':'—',{x:9.5,y:y+0.08,w:1.8,h:0.18,fontSize:8,color:LGRAY,align:'right',fontFace:'Arial'})
      // Bar visual
      const barW=Math.max(0.05,(d.total/totalC)*2.5)
      slide.addShape('rect',{x:11.4,y:y+0.09,w:barW,h:0.14,fill:{color:PINK},line:{color:PINK},rectRadius:0.03})
    })
  }
  if(note) slide.addText('📝 '+note,{x:0.3,y:6.95,w:12.73,h:0.3,fontSize:8,color:AMBER,italic:true,fontFace:'Arial'})
}

// ══════════════════════════════════════════════════════════════════════════════
// VOIDS
// ══════════════════════════════════════════════════════════════════════════════
async function addVoids(pptx: any, logoUrl: string|undefined, restName: string, cur: WeekData, prev: WeekData|null, note: string) {
  const voids=(cur as any)?.voids, pVoids=(prev as any)?.voids
  const totalC=n(voids?.total), totalP=n(pVoids?.total), sC=n(cur?.sales?.net_sales)
  const items: any[]=voids?.items||[]
  if(!totalC && !items.length) return // skip si vacío

  const slide = base(pptx, logoUrl)
  pageHdr(slide,'VOIDS', restName+' · '+wL(cur.week), AMBER)

  const byReason: Record<string,number>={}
  items.forEach((item:any)=>{ const r=item.reason||'Sin razón'; byReason[r]=(byReason[r]||0)+n(item.price??item.amount??0) })
  const serverErr=byReason['Server Error']||0, e86=byReason['86ed']||0

  const kW=13.33/5
  kpiCard(slide,0,     0.85,kW,1.25,'Total Voids',fmt$(totalC),'',prev?d$(totalC,totalP):'',dC(totalC,totalP,true),AMBER)
  const voidPctStr = sC>0 ? (totalC/sC*100).toFixed(2)+'%' : '—'
  kpiCard(slide,kW,    0.85,kW,1.25,'% de Ventas',voidPctStr,'','',GRAY)
  kpiCard(slide,kW*2,  0.85,kW,1.25,'Items',String(items.length),'','',GRAY)
  kpiCard(slide,kW*3,  0.85,kW,1.25,'86ed $',fmt$(e86),'','',e86>0?ORANGE:GRAY,e86>0?ORANGE:GRAY)
  kpiCard(slide,kW*4,  0.85,kW,1.25,'Server Error $',fmt$(serverErr),'','',serverErr>0?RED:GRAY,serverErr>0?RED:GRAY)

  // Top voids por item
  const sorted=[...items].sort((a:any,b:any)=>n(b.price??b.amount??0)-n(a.price??a.amount??0)).slice(0,14)
  if(sorted.length) {
    const TY=2.18, TH=0.3
    slide.addShape('rect',{x:0.15,y:TY,w:13.03,h:0.27,fill:{color:'111827'},line:{color:'2D3748'}})
    ;['ARTÍCULO','SERVIDOR','RAZÓN','PRECIO'].forEach((h,i)=>{
      const xOff=[0,3.8,6.6,9.5]
      const ww=[3.7,2.7,2.8,3.43]
      slide.addText(h,{x:0.25+xOff[i],y:TY+0.07,w:ww[i],h:0.18,fontSize:7,color:LGRAY,bold:true,align:i===3?'right':'left',fontFace:'Arial'})
    })
    sorted.forEach((item:any,i:number)=>{
      const y=TY+0.27+i*TH
      const reason=item.reason||'—', isErr=reason==='Server Error', is86=reason==='86ed'
      slide.addShape('rect',{x:0.15,y,w:13.03,h:TH,fill:{color:i%2===0?CARD:'1A1D27'},line:{color:'2D3748'}})
      slide.addText((item.item_name||item.name||'—').substring(0,30),{x:0.25,y:y+0.08,w:3.7,h:0.18,fontSize:8,color:OFF,bold:true,fontFace:'Arial'})
      slide.addText((item.employee_name||item.server||'—').substring(0,20),{x:4.05,y:y+0.08,w:2.7,h:0.18,fontSize:8,color:GRAY,fontFace:'Arial'})
      slide.addText(reason.substring(0,25),{x:6.85,y:y+0.08,w:2.7,h:0.18,fontSize:8,color:isErr||is86?AMBER:GRAY,fontFace:'Arial'})
      slide.addText(fmt$(n(item.price??item.amount??0)),{x:9.75,y:y+0.08,w:3.3,h:0.18,fontSize:8.5,color:RED,bold:true,align:'right',fontFace:'Arial'})
    })
  }
  if(note) slide.addText('📝 '+note,{x:0.3,y:6.95,w:12.73,h:0.3,fontSize:8,color:AMBER,italic:true,fontFace:'Arial'})
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export async function generatePPTX(config: ExportConfig, dataByRestaurant: ExportData[]) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Restaurant X-Ray · DineWise Solutions'

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
          await addLabor(pptx, logoUrl, restName, current, previous, data, note); break
        case 'food_cost':
          await addFoodCost(pptx, logoUrl, restName, current, previous, data, note)
          await addCostoUso(pptx, logoUrl, restName, current, previous, data, note); break
        case 'waste':
          await addWaste(pptx, logoUrl, restName, current, previous, data, note); break
        case 'avt':
          await addAvt(pptx, logoUrl, restName, current, previous, data, note); break
        case 'compras':
          await addFoodCost(pptx, logoUrl, restName, current, previous, data, note); break
      }
    }
    // Descuentos y Voids — solo si tienen datos
    if((current as any)?.discounts?.total > 0 || (current as any)?.discounts?.items?.length > 0) {
      await addDescuentos(pptx, logoUrl, restName, current, previous, config.notes['descuentos']||'')
    }
    if((current as any)?.voids?.total > 0 || (current as any)?.voids?.items?.length > 0) {
      await addVoids(pptx, logoUrl, restName, current, previous, config.notes['voids']||'')
    }
  }

  const restName = dataByRestaurant[0]?.restaurant?.name?.replace(/\s/g,'-')||'reporte'
  const weekLabel = dataByRestaurant[0]?.weeks[dataByRestaurant[0].weeks.length-1]?.week||'semana'
  await pptx.writeFile({ fileName: restName+'-'+weekLabel+'.pptx' })
}