'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import { useAuth } from '@/lib/auth-context'
import { can, Action } from '@/lib/permissions'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell
} from 'recharts'

const ACCOUNT_MAP: Record<string, string> = {
  'Food Inventory': 'food',
  'Food bar Inventory': 'liquor',
  'Beer': 'beer',
  'Alcoholic Inventory': 'liquor',
  'Beverage Inventory': 'na_beverage',
  'Wine Inventory': 'wine',
}

const CATEGORIES_BASE = [
  { key: 'food', label: 'Food', color: '#f97316', defaultMeta: 28 },
  { key: 'na_beverage', label: 'NA Beverage', color: '#06b6d4', defaultMeta: 8 },
  { key: 'liquor', label: 'Liquor', color: '#a855f7', defaultMeta: 20 },
  { key: 'beer', label: 'Beer', color: '#eab308', defaultMeta: 20 },
  { key: 'wine', label: 'Wine', color: '#ec4899', defaultMeta: 20 },
]

const ADJUSTMENT_FIELDS = [
  { key: 'inv_previous', label: 'Inv. Anterior' },
  { key: 'purchases', label: 'Compras' },
  { key: 'inv_current', label: 'Inv. Final' },
  { key: 'theo_cost', label: 'Costo Teórico adicional' },
  { key: 'sales_adjustment', label: 'Ajuste de Ventas (+Desc. Op.)' },
]

type Shortcut = 'week' | 'last4' | 'last8' | 'month' | 'custom'

export default function CostoUsoPage() {
  const restaurantId = useRestaurantId()
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [restaurantName, setRestaurantName] = useState('')
  const [mappings, setMappings] = useState<any[]>([])
  const [alerts, setAlerts] = useState<string[]>([])
  const [shortcut, setShortcut] = useState<Shortcut>('week')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [operatingDays, setOperatingDays] = useState(6)
  const [costTargets, setCostTargets] = useState<Record<string, number>>({})
  const [userRole, setUserRole] = useState<string>('')
  const [userCustomPerms, setUserCustomPerms] = useState<any>(null)
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [skippedWeeks, setSkippedWeeks] = useState<any[]>([])

  // ── NUEVO: estados para marcar/desmarcar semana sin inventario ─────────
  const [showSkipPanel, setShowSkipPanel] = useState(false)
  const [skipWeekTarget, setSkipWeekTarget] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [skipSaving, setSkipSaving] = useState(false)
  const [skipError, setSkipError] = useState('')
  const [showSkipLog, setShowSkipLog] = useState(false)

  const [showAdjPanel, setShowAdjPanel] = useState(false)
  const [adjWeek, setAdjWeek] = useState('')
  const [adjReportId, setAdjReportId] = useState('')
  const [adjCategory, setAdjCategory] = useState('')
  const [adjField, setAdjField] = useState('inv_previous')
  const [adjValue, setAdjValue] = useState('')
  const [adjNote, setAdjNote] = useState('')
  const [adjSaving, setAdjSaving] = useState(false)
  const [adjError, setAdjError] = useState('')
  const [showAdjLog, setShowAdjLog] = useState(false)

  // ── NUEVO: descuentos operativos ──────────────────────────────────────────
  const [includeOpDiscounts, setIncludeOpDiscounts] = useState(false)
  const [opDiscountMappings, setOpDiscountMappings] = useState<string[]>([]) // nombres operativos
  const [discountsDataByWeek, setDiscountsDataByWeek] = useState<Record<string, number>>({}) // semana → total operativos

  const CATEGORIES = CATEGORIES_BASE.map(cat => ({
    ...cat,
    meta: costTargets[cat.key] !== undefined ? costTargets[cat.key] : cat.defaultMeta,
  }))

  const canEdit = can(userRole, 'costo_uso', 'edit', userCustomPerms)
  const { isSuperAdmin } = useAuth()
  const canSkipWeek = can(userRole, 'costo_uso', 'skip_week' as Action, userCustomPerms) || isSuperAdmin

  useEffect(() => { if (restaurantId) loadData() }, [restaurantId])

  async function loadData() {
    if (!restaurantId) return
    setLoading(true)
    setWeeks([])

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: ur } = await supabase.from('user_restaurants')
        .select('role, custom_permissions').eq('user_id', user.id).eq('restaurant_id', restaurantId).single()
      if (ur) { setUserRole(ur.role || ''); setUserCustomPerms(ur.custom_permissions || null) }
    }

    const { data: rest } = await supabase.from('restaurants').select('name, operating_days').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')
    setOperatingDays(rest?.operating_days || 6)

    const { data: maps } = await supabase.from('category_mappings').select('*').eq('restaurant_id', restaurantId)
    setMappings(maps || [])

    const { data: tgts } = await supabase.from('cost_targets').select('category, target_pct').eq('restaurant_id', restaurantId)
    if (tgts?.length) {
      const m: Record<string, number> = {}
      tgts.forEach((t: any) => { m[t.category] = Number(t.target_pct) })
      setCostTargets(m)
    }

    // ── NUEVO: cargar nombres de descuentos operativos ─────────────────────
    const { data: discMaps } = await supabase
      .from('discount_mappings')
      .select('discount_name')
      .eq('restaurant_id', restaurantId)
      .eq('is_operational', true)
    setOpDiscountMappings((discMaps || []).map((d: any) => d.discount_name))

    const { data: reports } = await supabase.from('reports').select('*')
      .eq('restaurant_id', restaurantId).order('week', { ascending: true }).limit(52)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, c, inv, pm, disc] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
        supabase.from('inventory_data').select('*').eq('report_id', r.id).single(),
        supabase.from('product_mix_data').select('*').eq('report_id', r.id).single(),
        supabase.from('discounts_data').select('total, items').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, cogs: c.data, inventory: inv.data, productMix: pm.data, discounts: disc.data }
    }))

    setWeeks(weeksData)

    // ── NUEVO: calcular total de descuentos operativos por semana ──────────
    // Se recalcula dinámicamente en getOpDiscountTotal() usando opDiscountMappings
    const last = weeksData[weeksData.length - 1]
    setSelectedWeek(last?.report.week || '')
    setCustomFrom(weeksData.length >= 4 ? weeksData[weeksData.length - 4].report.week : weeksData[0].report.week)
    setCustomTo(last?.report.week || '')

    const { data: adjs } = await supabase.from('costo_uso_adjustments')
      .select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false })
    setAdjustments(adjs || [])

    // ── NUEVO: cargar semanas saltadas (sin inventario marcado) ───────────
    const { data: skipped } = await supabase.from('skipped_inventory_weeks')
      .select('*').eq('restaurant_id', restaurantId).order('week', { ascending: true })
    setSkippedWeeks(skipped || [])

    const newAlerts: string[] = []
    for (let i = 1; i < weeksData.length; i++) {
      const prev = weeksData[i - 1]; const curr = weeksData[i]
      if (prev.inventory && curr.inventory) {
        const diff = Math.abs(Number(prev.inventory.grand_total_current) - Number(curr.inventory.grand_total_previous))
        if (diff > 10) newAlerts.push(`⚠️ Ajuste detectado entre ${prev.report.week} y ${curr.report.week}: diferencia de $${diff.toFixed(0)} en inventario`)
      }
    }
    setAlerts(newAlerts)
    setLoading(false)
  }

  // ── NUEVO: calcular total descuentos operativos de una semana ─────────────
  function getOpDiscountTotal(w: any): number {
    if (!includeOpDiscounts || !opDiscountMappings.length) return 0
    const items: any[] = w.discounts?.items || []
    return items
      .filter((item: any) => opDiscountMappings.includes(item.name))
      .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
  }

  function getAdj(week: string, category: string, field: string): number {
    return adjustments.filter(a => a.week === week && a.category === category && a.field === field)
      .reduce((sum, a) => sum + Number(a.adjustment_value), 0)
  }
  function hasAdjustments(week: string): boolean { return adjustments.some(a => a.week === week) }
  function getWeekAdjustments(week: string): any[] { return adjustments.filter(a => a.week === week) }

  async function saveAdjustment() {
    if (!adjValue || !adjNote.trim()) { setAdjError('Debes ingresar un valor y una nota explicativa'); return }
    const numVal = parseFloat(adjValue)
    if (isNaN(numVal)) { setAdjError('El valor debe ser un número'); return }
    setAdjSaving(true); setAdjError('')
    const w = weeks.find(w => w.report.week === adjWeek)
    let originalValue = 0
    if (w) {
      const d = buildWeekData(w)
      if (adjField === 'inv_previous') originalValue = d[adjCategory + '_inv_previous'] || 0
      else if (adjField === 'purchases') originalValue = d[adjCategory + '_purchases'] || 0
      else if (adjField === 'inv_current') originalValue = d[adjCategory + '_inv_current'] || 0
      else if (adjField === 'theo_cost') originalValue = d[adjCategory + '_theo_cost'] || 0
      else if (adjField === 'sales_adjustment') originalValue = d[adjCategory + '_sales'] || 0
    }
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('costo_uso_adjustments').insert({
      restaurant_id: restaurantId, report_id: adjReportId, week: adjWeek,
      category: adjCategory, field: adjField, original_value: originalValue,
      adjustment_value: numVal, note: adjNote.trim(),
      created_by: user?.email || user?.id || 'unknown',
    })
    if (error) { setAdjError('Error al guardar: ' + error.message); setAdjSaving(false); return }
    const { data: adjs } = await supabase.from('costo_uso_adjustments')
      .select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false })
    setAdjustments(adjs || [])
    setAdjValue(''); setAdjNote(''); setShowAdjPanel(false); setAdjSaving(false)
  }

  async function deleteAdjustment(id: string) {
    if (!confirm('¿Eliminar este ajuste? Esta acción no se puede deshacer.')) return
    await supabase.from('costo_uso_adjustments').delete().eq('id', id)
    setAdjustments(prev => prev.filter(a => a.id !== id))
  }

  function openAdjPanel(week: string, reportId: string, category: string) {
    setAdjWeek(week); setAdjReportId(reportId); setAdjCategory(category)
    setAdjField('inv_previous'); setAdjValue(''); setAdjNote(''); setAdjError('')
    setShowAdjPanel(true)
  }

  // ── NUEVO: funciones para marcar/desmarcar semanas saltadas ─────────────
  function openSkipPanel(week: string) {
    setSkipWeekTarget(week); setSkipReason(''); setSkipError('')
    setShowSkipPanel(true)
  }

  async function saveSkippedWeek() {
    if (!skipReason.trim()) { setSkipError('Debes ingresar un motivo'); return }
    if (!skipWeekTarget) { setSkipError('No hay semana seleccionada'); return }
    if (!restaurantId) { setSkipError('Restaurant no identificado'); return }
    setSkipSaving(true); setSkipError('')

    // Calcular week_start a partir de la semana (si existe en weeks[])
    const w = weeks.find(w => w.report.week === skipWeekTarget)
    const weekStart = w?.report?.week_start || null

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('skipped_inventory_weeks').insert({
      restaurant_id: restaurantId,
      week: skipWeekTarget,
      week_start: weekStart,
      reason: skipReason.trim(),
      created_by: user?.email || user?.id || 'unknown',
    })
    if (error) {
      setSkipError('Error al guardar: ' + error.message)
      setSkipSaving(false); return
    }
    // Recargar skippedWeeks desde BD
    const { data: skipped } = await supabase.from('skipped_inventory_weeks')
      .select('*').eq('restaurant_id', restaurantId).order('week', { ascending: true })
    setSkippedWeeks(skipped || [])
    setSkipReason(''); setShowSkipPanel(false); setSkipSaving(false)
  }

  async function deleteSkippedWeek(id: string, week: string) {
    if (!confirm(`¿Desmarcar ${week} como saltada? El cálculo volverá a comportarse normalmente.`)) return
    const { error } = await supabase.from('skipped_inventory_weeks').delete().eq('id', id)
    if (error) { alert('Error al desmarcar: ' + error.message); return }
    setSkippedWeeks(prev => prev.filter(s => s.id !== id))
  }

  // Helper: la semana actualmente seleccionada está marcada como saltada?
  function isSelectedWeekSkipped(): { skipped: boolean; record: any | null } {
    if (shortcut !== 'week' || !selectedWeek) return { skipped: false, record: null }
    const record = skippedWeeks.find((s: any) => s.week === selectedWeek)
    return { skipped: !!record, record: record || null }
  }

  const filtered = (() => {
    if (weeks.length === 0) return []
    if (shortcut === 'week') return weeks.filter(w => w.report.week === selectedWeek)
    if (shortcut === 'last4') return weeks.slice(-4)
    if (shortcut === 'last8') return weeks.slice(-8)
    if (shortcut === 'month') {
      const now = new Date(); const y = now.getFullYear(), m = now.getMonth()
      return weeks.filter(w => { const d = new Date(w.report.week_start); return d.getFullYear() === y && d.getMonth() === m })
    }
    if (shortcut === 'custom' && customFrom && customTo) {
      const from = customFrom <= customTo ? customFrom : customTo
      const to = customFrom <= customTo ? customTo : customFrom
      return weeks.filter(w => w.report.week >= from && w.report.week <= to)
    }
    return weeks.slice(-4)
  })()

  function fmt(n: any) { if (n === null || n === undefined) return '—'; return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) }
  function fmtPct(n: any) { if (n === null || n === undefined) return '—'; return Number(n).toFixed(1) + '%' }
  function pct(part: any, total: any) { if (!part || !total) return null; return parseFloat((Number(part) / Number(total) * 100).toFixed(1)) }

  function getMappedSales(categories: any[], targetType: string) {
    if (!categories || !mappings.length) return 0
    return categories.filter((cat: any) => {
      const mapping = mappings.find(m => m.source_category.toLowerCase() === cat.name.toLowerCase())
      return mapping?.mapped_to === targetType
    }).reduce((sum: number, cat: any) => sum + Number(cat.net || 0), 0)
  }


  // Ventas brutas (net + descuentos) por categoria — para modo + Desc. Operativos
  function getMappedGross(categories: any[], targetType: string) {
    if (!categories || !mappings.length) return 0
    return categories.filter((cat: any) => {
      const mapping = mappings.find(m => m.source_category.toLowerCase() === cat.name.toLowerCase())
      return mapping?.mapped_to === targetType
    }).reduce((sum: number, cat: any) => sum + Number(cat.gross || cat.net || 0), 0)
  }

  function getInventoryByCategory(invAccounts: any[], categoryKey: string) {
    if (!invAccounts) return { current: 0, previous: 0 }
    const accounts = Object.entries(ACCOUNT_MAP).filter(([_, cat]) => cat === categoryKey).map(([acc]) => acc)
    return {
      current: invAccounts.filter(a => accounts.includes(a.account)).reduce((s, a) => s + Number(a.current_value || 0), 0),
      previous: invAccounts.filter(a => accounts.includes(a.account)).reduce((s, a) => s + Number(a.previous_value || 0), 0),
    }
  }

  function buildWeekData(w: any) {
    const netSales = w.sales?.net_sales || 0
    const cogsCat = w.cogs?.by_category || {}
    const invAccounts = w.inventory?.by_account || []
    const salesCategories = w.sales?.categories || []
    const theoCostByCat = w.productMix?.theo_cost_by_category || {}
    const hasInventory = invAccounts.length > 0
    const week = w.report.week

    // ── NUEVO: total descuentos operativos de la semana ───────────────────
    const opDiscTotal = getOpDiscountTotal(w)

    const result: any = { week: week.replace('2026-', ''), fullWeek: week, reportId: w.report.id, netSales, hasInventory, hasProductMix: !!w.productMix, opDiscTotal }
    let totalUsoCost = 0, totalTheoCost = 0, totalABSales = 0

    CATEGORIES.forEach(cat => {
      const inv = getInventoryByCategory(invAccounts, cat.key)
      const adjInvPrev = getAdj(week, cat.key, 'inv_previous')
      const adjPurchases = getAdj(week, cat.key, 'purchases')
      const adjInvCurr = getAdj(week, cat.key, 'inv_current')
      const adjTheo = getAdj(week, cat.key, 'theo_cost')
      const invPrevious = inv.previous + adjInvPrev
      const purchases = (cogsCat[cat.key] || 0) + adjPurchases
      const invCurrent = inv.current + adjInvCurr
      const uso = hasInventory ? Math.max((invPrevious + purchases - invCurrent), 0) : 0
      const catSalesBase = getMappedSales(salesCategories, cat.key) || 0
      // Con toggle activo: usar ventas brutas (net + descuentos) + ajuste manual de ventas
      const catSalesGross = getMappedGross(salesCategories, cat.key) || 0
      const adjSales = getAdj(week, cat.key, 'sales_adjustment')
      const catSales = includeOpDiscounts && catSalesGross > catSalesBase
        ? catSalesGross + adjSales
        : catSalesBase

      const theoCost = (theoCostByCat[cat.key] || 0) + adjTheo
      const realPct = catSales > 0 ? pct(uso, catSales) : null
      const mixPct = catSales > 0 ? pct(theoCost, catSales) : null
      const variacionDolares = realPct !== null && mixPct !== null && catSales > 0
        ? parseFloat(((realPct - mixPct) / 100 * catSales).toFixed(2)) : null
      const diasInv = uso > 0 ? parseFloat((((invCurrent + invPrevious) / 2) / uso * operatingDays).toFixed(1)) : null
      const hasAdj = adjInvPrev !== 0 || adjPurchases !== 0 || adjInvCurr !== 0 || adjTheo !== 0
      result[cat.key + '_uso'] = uso
      result[cat.key + '_uso_pct'] = realPct || 0
      result[cat.key + '_theo_pct'] = mixPct || 0
      result[cat.key + '_variacion'] = variacionDolares
      result[cat.key + '_dias_inv'] = diasInv
      result[cat.key + '_inv_current'] = invCurrent
      result[cat.key + '_inv_previous'] = invPrevious
      result[cat.key + '_purchases'] = purchases
      result[cat.key + '_sales'] = catSales
      result[cat.key + '_has_adj'] = hasAdj
      result[cat.key + '_theo_cost'] = theoCost
      if (uso > 0) totalUsoCost += uso
      if (theoCost > 0) totalTheoCost += theoCost
      if (catSales > 0) totalABSales += catSales
    })

    result.totalUsoCost = totalUsoCost; result.totalTheoCost = totalTheoCost
    result.totalABSales = totalABSales
    result.totalRealPct = totalABSales > 0 ? pct(totalUsoCost, totalABSales) : null
    result.totalMixPct = totalABSales > 0 ? pct(totalTheoCost, totalABSales) : null
    result.totalVariacion = result.totalRealPct !== null && result.totalMixPct !== null
      ? parseFloat(((result.totalRealPct - result.totalMixPct) / 100 * totalABSales).toFixed(2)) : null
    result.hasAnyAdj = hasAdjustments(week)
    return result
  }

  // ── NUEVO: helpers para consolidar semanas saltadas ───────────────────
  // Set de lookup O(1) para semanas marcadas como saltadas
  const skippedWeekSet = new Set<string>(skippedWeeks.map((s: any) => s.week))

  // Si hay semanas saltadas inmediatamente previas al filtro, las incluye
  // junto con la última semana CON inventario real anterior (ancla de inv_previous).
  // Eso permite que buildRangeData() consolide automáticamente el cálculo.
  function expandToIncludeSkippedPredecessors(filteredWeeks: any[]): any[] {
    if (!filteredWeeks.length || !skippedWeeks.length) return filteredWeeks
    const firstWeek = filteredWeeks[0].report.week
    const firstIdx = weeks.findIndex(w => w.report.week === firstWeek)
    if (firstIdx <= 0) return filteredWeeks

    const predecessors: any[] = []
    let foundInvAnchor = false
    for (let i = firstIdx - 1; i >= 0; i--) {
      const w = weeks[i]
      const isSkipped = skippedWeekSet.has(w.report.week)
      const hasInv = w.inventory?.by_account?.length > 0
      if (isSkipped) {
        predecessors.unshift(w)
        continue
      }
      if (hasInv) {
        predecessors.unshift(w)
        foundInvAnchor = true
        break
      }
      // semana sin inv y sin marca de saltada → datos ambiguos, no expandimos
      break
    }

    // Solo expandimos si encontramos ancla + al menos 1 saltada en el camino
    const hasSkippedInPath = predecessors.some(w => skippedWeekSet.has(w.report.week))
    if (!foundInvAnchor || !hasSkippedInPath) return filteredWeeks

    return [...predecessors, ...filteredWeeks]
  }

  // Rango efectivo de cálculo (puede incluir saltadas previas y su ancla de inv)
  const effectiveFiltered = expandToIncludeSkippedPredecessors(filtered)

  // Semanas saltadas que están consolidadas en el cálculo actual
  const consolidatedSkippedWeeks = effectiveFiltered
    .filter(w => skippedWeekSet.has(w.report.week))
    .map(w => w.report.week)

  const chartData = effectiveFiltered.map(buildWeekData)
  const latest = effectiveFiltered[effectiveFiltered.length - 1]
  const isMultiWeek = effectiveFiltered.length > 1
  // detailWeek: solo se usa para título y vista single-week (no entra cuando isMultiWeek=true)
  // Mantenemos filtered[0] para que el título refleje la semana que el usuario seleccionó
  const detailWeek = shortcut === 'week' ? (filtered[0] || effectiveFiltered[effectiveFiltered.length - 1] || latest) : latest

  function buildRangeData() {
    if (!effectiveFiltered.length) return null
    const weeklyData = effectiveFiltered.map(w => ({ raw: w, data: buildWeekData(w) }))
    const withInv = weeklyData.filter(wd => wd.data.hasInventory)
    if (!withInv.length) return null
    const firstWD = withInv[0]
    const lastWD = withInv[withInv.length - 1]
    const nSemanas = effectiveFiltered.length
    const diasRango = nSemanas * operatingDays
    const result: any = {
      fullWeek: latest?.report?.week, reportId: latest?.report?.id,
      hasInventory: true, hasAnyAdj: effectiveFiltered.some(w => hasAdjustments(w.report.week)), diasRango, consolidatedSkippedWeeks,
    }
    CATEGORIES.forEach(cat => {
      const invPrevious = firstWD.data[cat.key + '_inv_previous'] ?? 0
      const invCurrent = lastWD.data[cat.key + '_inv_current'] ?? 0
      const purchases = weeklyData.reduce((sum, wd) => sum + (wd.data[cat.key + '_purchases'] ?? 0), 0)
      const uso = Math.max(invPrevious + purchases - invCurrent, 0)
      const catSales = weeklyData.reduce((sum, wd) => sum + (wd.data[cat.key + '_sales'] ?? 0), 0)
      const theoCost = weeklyData.reduce((sum, wd) => sum + (wd.data[cat.key + '_theo_cost'] ?? 0), 0)
      const realPct = catSales > 0 ? pct(uso, catSales) : null
      const mixPct = catSales > 0 ? pct(theoCost, catSales) : null
      const variacion = realPct !== null && mixPct !== null && catSales > 0
        ? parseFloat(((realPct - mixPct) / 100 * catSales).toFixed(2)) : null
      const diasInv = uso > 0 ? parseFloat((((invCurrent + invPrevious) / 2) / (uso / diasRango)).toFixed(1)) : null
      const hasAdj = weeklyData.some(wd => wd.data[cat.key + '_has_adj'])
      result[cat.key + '_uso'] = uso; result[cat.key + '_uso_pct'] = realPct || 0
      result[cat.key + '_theo_pct'] = mixPct || 0; result[cat.key + '_variacion'] = variacion
      result[cat.key + '_dias_inv'] = diasInv; result[cat.key + '_inv_current'] = invCurrent
      result[cat.key + '_inv_previous'] = invPrevious; result[cat.key + '_purchases'] = purchases
      result[cat.key + '_sales'] = catSales; result[cat.key + '_has_adj'] = hasAdj
      result[cat.key + '_theo_cost'] = theoCost
    })
    let totalUso = 0, totalTheo = 0, totalSales = 0
    CATEGORIES.forEach(cat => {
      totalUso += result[cat.key + '_uso'] || 0
      totalTheo += result[cat.key + '_theo_cost'] || 0
      totalSales += result[cat.key + '_sales'] || 0
    })
    result.totalUsoCost = totalUso; result.totalTheoCost = totalTheo; result.totalABSales = totalSales
    result.totalRealPct = totalSales > 0 ? pct(totalUso, totalSales) : null
    result.totalMixPct = totalSales > 0 ? pct(totalTheo, totalSales) : null
    result.totalVariacion = result.totalRealPct !== null && result.totalMixPct !== null
      ? parseFloat(((result.totalRealPct - result.totalMixPct) / 100 * totalSales).toFixed(2)) : null
    return result
  }

  const detailData = isMultiWeek ? buildRangeData() : (detailWeek ? buildWeekData(detailWeek) : null)
  const hasInventory = weeks.some(w => w.inventory?.by_account?.length > 0)

  const SHORTCUTS: { key: Shortcut; label: string }[] = [
    { key: 'week', label: 'Semana' }, { key: 'last4', label: 'Últimas 4 sem' },
    { key: 'last8', label: 'Últimas 8 sem' }, { key: 'month', label: 'Este mes' }, { key: 'custom', label: 'Custom' },
  ]

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Cargando costo de uso...</p></div>

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-white font-bold text-lg">📦 Costo de Uso</h1>
            <span className="bg-blue-900 text-blue-400 text-xs px-2 py-0.5 rounded-full font-medium">Inventario Real</span>
            <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">{operatingDays} días/semana</span>
            {adjustments.length > 0 && (
              <button onClick={() => setShowAdjLog(!showAdjLog)}
                className="bg-yellow-900 text-yellow-400 text-xs px-2 py-0.5 rounded-full font-medium hover:bg-yellow-800 transition">
                ✏️ {adjustments.length} ajuste{adjustments.length !== 1 ? 's' : ''} manual{adjustments.length !== 1 ? 'es' : ''}
              </button>
            )}
            {/* ── NUEVO: Botón log de semanas saltadas ── */}
            {skippedWeeks.length > 0 && (
              <button onClick={() => setShowSkipLog(!showSkipLog)}
                className="bg-orange-900 text-orange-400 text-xs px-2 py-0.5 rounded-full font-medium hover:bg-orange-800 transition">
                📭 {skippedWeeks.length} semana{skippedWeeks.length !== 1 ? 's' : ''} sin inventario
              </button>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-0.5">{restaurantName} · (Inv. Anterior + Compras − Inv. Actual) / Ventas</p>
        </div>

        {/* ── NUEVO: Toggle descuentos operativos ── */}
        <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5">
          <div className="text-right">
            <p className="text-gray-400 text-xs font-medium">Ventas base</p>
            <p className="text-gray-600 text-xs">% Real estándar</p>
          </div>
          <button
            onClick={() => setIncludeOpDiscounts(!includeOpDiscounts)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              includeOpDiscounts ? 'bg-green-600' : 'bg-gray-600'
            }`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              includeOpDiscounts ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
          <div className="text-left">
            <p className={`text-xs font-medium ${includeOpDiscounts ? 'text-green-400' : 'text-gray-400'}`}>
              + Desc. Operativos
            </p>
            <p className="text-gray-600 text-xs">
              {opDiscountMappings.length > 0
                ? opDiscountMappings.length + ' tipo' + (opDiscountMappings.length !== 1 ? 's' : '') + ' configurado' + (opDiscountMappings.length !== 1 ? 's' : '')
                : 'Sin configurar en Settings'}
            </p>
          </div>
        </div>
      </div>

      {/* Shortcuts */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {SHORTCUTS.map(s => (
            <button key={s.key} onClick={() => setShortcut(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${shortcut === s.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {s.label}
            </button>
          ))}
          {shortcut === 'week' && weeks.length > 0 && (
            <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
              {[...weeks].reverse().map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
            </select>
          )}
          {shortcut === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <select value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
                {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
              </select>
              <span className="text-gray-500 text-xs">→</span>
              <select value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
                {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
              </select>
            </div>
          )}
          {/* ── NUEVO: Botón contextual Marcar/Desmarcar saltada (solo vista Semana, con permiso) ── */}
          {canSkipWeek && shortcut === 'week' && selectedWeek && (() => {
            const { skipped, record } = isSelectedWeekSkipped()
            if (skipped && record) {
              return (
                <button onClick={() => deleteSkippedWeek(record.id, record.week)}
                  className="bg-orange-900 text-orange-300 hover:bg-orange-800 text-xs font-medium px-3 py-1.5 rounded-lg transition ml-2"
                  title="Esta semana está marcada como sin inventario. Click para desmarcar.">
                  📭 Desmarcar {selectedWeek}
                </button>
              )
            }
            return (
              <button onClick={() => openSkipPanel(selectedWeek)}
                className="bg-gray-800 hover:bg-orange-900 text-gray-400 hover:text-orange-300 text-xs font-medium px-3 py-1.5 rounded-lg transition ml-2 border border-gray-700 hover:border-orange-800"
                title="Marcar esta semana como sin inventario">
                📭 Marcar {selectedWeek} sin inventario
              </button>
            )
          })()}
          <span className="text-gray-600 text-xs ml-2">{filtered.length} semana{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Modal ajuste */}
        {showAdjPanel && canEdit && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-white font-bold text-base">✏️ Ajuste manual</h3>
                  <p className="text-gray-500 text-xs mt-0.5">{adjWeek} · {CATEGORIES.find(c => c.key === adjCategory)?.label}</p>
                </div>
                <button onClick={() => setShowAdjPanel(false)} className="text-gray-500 hover:text-white">✕</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Campo a ajustar</label>
                  <select value={adjField} onChange={e => setAdjField(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    {ADJUSTMENT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Valor a <strong>sumar</strong> al actual (negativo para restar)</label>
                  <input type="number" value={adjValue} onChange={e => setAdjValue(e.target.value)}
                    placeholder="Ej: 500 o -200"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                  <p className="text-gray-600 text-xs mt-1">Positivo = incrementar · Negativo = reducir</p>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Nota explicativa <span className="text-red-400">*</span></label>
                  <textarea value={adjNote} onChange={e => setAdjNote(e.target.value)}
                    placeholder="Explica la razón del ajuste..."
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
                </div>
                {adjError && <p className="text-red-400 text-xs">{adjError}</p>}
                <div className="bg-gray-800 rounded-lg px-4 py-3">
                  <p className="text-gray-500 text-xs">⚠️ Este ajuste quedará registrado con tu usuario y fecha.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAdjPanel(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm transition">Cancelar</button>
                  <button onClick={saveAdjustment} disabled={adjSaving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white py-2 rounded-lg text-sm font-medium transition">
                    {adjSaving ? 'Guardando...' : 'Guardar ajuste'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── NUEVO: Modal marcar semana sin inventario ── */}
        {showSkipPanel && canSkipWeek && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-white font-bold text-base">📭 Marcar semana sin inventario</h3>
                  <p className="text-gray-500 text-xs mt-0.5">{skipWeekTarget}</p>
                </div>
                <button onClick={() => setShowSkipPanel(false)} className="text-gray-500 hover:text-white">✕</button>
              </div>
              <div className="space-y-4">
                <div className="bg-blue-950 border border-blue-900 rounded-lg px-4 py-3">
                  <p className="text-blue-300 text-xs leading-relaxed">
                    Al marcar la semana sin inventario, el cálculo de Costo de Uso se consolidará automáticamente cuando se haga inventario en una semana posterior.
                  </p>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Motivo <span className="text-red-400">*</span></label>
                  <textarea value={skipReason} onChange={e => setSkipReason(e.target.value)}
                    placeholder="Ej: equipo de cocina no pudo contar inventario por evento privado"
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
                </div>
                {skipError && <p className="text-red-400 text-xs">{skipError}</p>}
                <div className="bg-gray-800 rounded-lg px-4 py-3">
                  <p className="text-gray-500 text-xs">⚠️ Este registro quedará guardado con tu usuario y fecha. Puedes desmarcarlo después.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowSkipPanel(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm transition">Cancelar</button>
                  <button onClick={saveSkippedWeek} disabled={skipSaving}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 text-white py-2 rounded-lg text-sm font-medium transition">
                    {skipSaving ? 'Guardando...' : 'Marcar saltada'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Log de ajustes */}
        {showAdjLog && (
          <div className="bg-gray-900 border border-yellow-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-yellow-400 font-semibold">✏️ Registro completo de ajustes manuales</h3>
              <button onClick={() => setShowAdjLog(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            {adjustments.length === 0 ? (
              <p className="text-gray-500 text-sm">No hay ajustes registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 pb-2 font-medium">Semana</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Categoría</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Campo</th>
                      <th className="text-right text-gray-500 pb-2 font-medium">Valor original</th>
                      <th className="text-right text-gray-500 pb-2 font-medium">Ajuste</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Nota</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Por</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Fecha</th>
                      {canEdit && <th className="pb-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.map(a => (
                      <tr key={a.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="py-2 text-gray-300">{a.week}</td>
                        <td className="py-2 text-gray-300">{CATEGORIES.find(c => c.key === a.category)?.label || a.category}</td>
                        <td className="py-2 text-gray-400">{ADJUSTMENT_FIELDS.find(f => f.key === a.field)?.label || a.field}</td>
                        <td className="py-2 text-right text-gray-500">{fmt(a.original_value)}</td>
                        <td className={`py-2 text-right font-bold ${Number(a.adjustment_value) > 0 ? 'text-yellow-400' : 'text-blue-400'}`}>
                          {Number(a.adjustment_value) > 0 ? '+' : ''}{fmt(a.adjustment_value)}
                        </td>
                        <td className="py-2 text-gray-400 max-w-xs"><span title={a.note} className="truncate block">{a.note}</span></td>
                        <td className="py-2 text-gray-500">{a.created_by?.split('@')[0] || '—'}</td>
                        <td className="py-2 text-gray-600">{new Date(a.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                        {canEdit && (
                          <td className="py-2">
                            <button onClick={() => deleteAdjustment(a.id)}
                              className="text-red-500 hover:text-red-400 text-xs px-2 py-0.5 rounded hover:bg-red-950 transition">Eliminar</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── NUEVO: Log de semanas saltadas ── */}
        {showSkipLog && (
          <div className="bg-gray-900 border border-orange-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-orange-400 font-semibold">📭 Semanas marcadas sin inventario</h3>
              <button onClick={() => setShowSkipLog(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            {skippedWeeks.length === 0 ? (
              <p className="text-gray-500 text-sm">No hay semanas marcadas como saltadas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 pb-2 font-medium">Semana</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Motivo</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Por</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Fecha</th>
                      {canSkipWeek && <th className="text-right text-gray-500 pb-2 font-medium">Acción</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {skippedWeeks.map((sk: any) => (
                      <tr key={sk.id} className="border-b border-gray-900">
                        <td className="text-orange-400 py-2 font-medium">{sk.week}</td>
                        <td className="text-gray-300 py-2 max-w-md">{sk.reason}</td>
                        <td className="text-gray-500 py-2">{sk.created_by}</td>
                        <td className="text-gray-500 py-2">
                          {new Date(sk.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </td>
                        {canSkipWeek && (
                          <td className="text-right py-2">
                            <button onClick={() => deleteSkippedWeek(sk.id, sk.week)}
                              className="text-red-400 hover:text-red-300 text-xs">
                              Desmarcar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── NUEVO: banner cuando toggle activo ── */}
        {includeOpDiscounts && (
          <div className="bg-green-950 border border-green-800 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-green-400 text-lg">✅</span>
            <div>
              <p className="text-green-300 text-sm font-medium">Modo: Ventas Brutas por categoría</p>
              <p className="text-green-600 text-xs mt-0.5">
                El denominador usa ventas brutas (net + descuentos) de cada categoría según el Sales Summary de Toast.
              </p>
            </div>
          </div>
        )}

        <div className="bg-blue-950 border border-blue-900 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-blue-400 text-lg">ℹ️</span>
          <div>
            <p className="text-blue-300 text-sm font-medium">Costo de Uso de Inventario</p>
            <p className="text-blue-400 text-xs mt-0.5">
              <strong>% Real</strong> = (Inv. Anterior + Compras − Inv. Actual) / Ventas{includeOpDiscounts ? ' (+Desc. Op.)' : ''} ·
              <strong> % P.Mix</strong> = Costo teórico según lo vendido ·
              <strong> Variación $</strong> = (% Real − % P.Mix) × Ventas ·
              <strong> Días Inv</strong> = ((Inv. Final + Inv. Inicial) / 2) / Uso × {operatingDays} días
            </p>
          </div>
        </div>

        {alerts.map((alert, i) => (
          <div key={i} className="bg-yellow-950 border border-yellow-800 rounded-xl px-5 py-3 flex items-start gap-3">
            <span className="text-yellow-400 shrink-0">⚠️</span>
            <p className="text-yellow-300 text-sm">{alert}</p>
          </div>
        ))}

        {!hasInventory ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">📦</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de inventario</h2>
            <p className="text-gray-500 mb-6">Sube el <strong>Inventory Count Review</strong> de R365 para ver el costo de uso real.</p>
            <button onClick={() => window.location.href = '/upload'} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg">Subir reporte</button>
          </div>
        ) : (
          <>
            {/* ── NUEVO: Banner cuando la semana seleccionada está marcada como saltada ── */}
            {(() => {
              const { skipped, record } = isSelectedWeekSkipped()
              if (!skipped || !record) return null
              return (
                <div className="bg-gray-900 border-2 border-orange-800 rounded-2xl p-6 opacity-90">
                  <div className="flex items-start gap-4">
                    <span className="text-orange-400 text-3xl">📭</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h2 className="text-orange-400 font-bold text-lg">{selectedWeek} — Sin inventario</h2>
                        <span className="bg-orange-900 text-orange-300 text-xs px-2 py-0.5 rounded-full font-medium">semana saltada</span>
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed mb-3">
                        <span className="text-gray-500">Motivo:</span> {record.reason}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>Marcada por <span className="text-gray-400">{record.created_by}</span></span>
                        <span>·</span>
                        <span>{new Date(record.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                        {canSkipWeek && (
                          <>
                            <span>·</span>
                            <button onClick={() => deleteSkippedWeek(record.id, record.week)}
                              className="text-red-400 hover:text-red-300">Desmarcar</button>
                          </>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs mt-3 leading-relaxed">
                        Los cálculos de Costo de Uso se consolidarán automáticamente en la próxima semana con inventario real. Las ventas y compras de esta semana se sumarán al rango consolidado.
                      </p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {detailData && !isSelectedWeekSkipped().skipped && (
              <div>
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
                  {consolidatedSkippedWeeks.length > 0
                    ? `Cálculo consolidado — ${selectedWeek} + ${consolidatedSkippedWeeks.length} semana${consolidatedSkippedWeeks.length !== 1 ? 's' : ''} sin inventario`
                    : isMultiWeek
                      ? `Promedio ponderado del período — ${filtered[0]?.report?.week} → ${latest?.report?.week} (${filtered.length} semanas)`
                      : `Semana — ${detailWeek?.report?.week} (${detailWeek?.report?.week_start} al ${detailWeek?.report?.week_end})`}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5" title={isMultiWeek ? 'Cálculo consolidado del período: usa el inventario anterior de la primera semana, las compras de todas las semanas y el inventario actual de la última semana. Mismo número que el total de la tabla de detalle.' : undefined}>
                    <p className="text-gray-500 text-xs mb-1">% Costo Real A&B {isMultiWeek ? '(consolidado)' : ''}</p>
                    <p className="text-3xl font-bold text-blue-400">{detailData.totalRealPct !== null ? detailData.totalRealPct + '%' : '—'}</p>
                    <p className="text-gray-600 text-xs mt-1">{fmt(detailData.totalUsoCost)} uso {isMultiWeek ? 'consolidado' : 'real'}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5" title={isMultiWeek ? 'Suma del costo teórico de todas las semanas del rango, dividido entre las ventas A&B totales.' : undefined}>
                    <p className="text-gray-500 text-xs mb-1">% Costo P.Mix {isMultiWeek ? '(consolidado)' : ''}</p>
                    <p className="text-3xl font-bold text-green-400">{detailData.totalMixPct !== null ? detailData.totalMixPct + '%' : '—'}</p>
                    <p className="text-gray-600 text-xs mt-1">{fmt(detailData.totalTheoCost)} teórico</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5" title={isMultiWeek ? 'Diferencia entre % Real consolidado y % P.Mix consolidado, expresada en dólares sobre las ventas A&B del período.' : undefined}>
                    <p className="text-gray-500 text-xs mb-1">Variación $ {isMultiWeek ? 'del período' : ''}</p>
                    <p className={`text-3xl font-bold ${detailData.totalVariacion > 0 ? 'text-red-400' : detailData.totalVariacion < 0 ? 'text-green-400' : 'text-gray-400'}`}>
                      {detailData.totalVariacion !== null ? (detailData.totalVariacion > 0 ? '+' : '') + fmt(detailData.totalVariacion) : '—'}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">{detailData.totalVariacion > 0 ? 'sobre lo teórico' : detailData.totalVariacion < 0 ? 'bajo lo teórico' : ''}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">Inv. Actual Total</p>
                    <p className="text-2xl font-bold text-white">{fmt(detailWeek?.inventory?.grand_total_current)}</p>
                    <p className="text-gray-600 text-xs mt-1">cierre de semana más reciente</p>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-white font-semibold">Detalle por categoría — {detailWeek?.report?.week}</h2>
                      {consolidatedSkippedWeeks.length > 0 && (
                        <span className="bg-orange-900 text-orange-300 text-xs px-2 py-1 rounded-full font-medium" title={`Semanas saltadas consolidadas: ${consolidatedSkippedWeeks.join(', ')}`}>
                          📭 Incluye {consolidatedSkippedWeeks.length} sem. saltada{consolidatedSkippedWeeks.length !== 1 ? 's' : ''} ({consolidatedSkippedWeeks.join(', ')})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {includeOpDiscounts && detailData.opDiscTotal > 0 && (
                        <span className="text-green-400 text-xs bg-green-950 px-2 py-1 rounded-full">
                          +{fmt(detailData.opDiscTotal)} desc. op. incluidos
                        </span>
                      )}
                      {detailData.hasAnyAdj && <span className="text-yellow-400 text-xs bg-yellow-950 px-2 py-1 rounded-full">✏️ Contiene ajustes manuales</span>}
                    </div>
                  </div>

                  {/* ── MOBILE: cards por categoría ── */}
                  <div className="md:hidden space-y-3">
                    {CATEGORIES.map(cat => {
                      const realPct = detailData[cat.key + '_uso_pct']
                      const variacion = detailData[cat.key + '_variacion']
                      const overMeta = cat.meta && realPct && realPct > cat.meta
                      if (!detailData[cat.key + '_uso']) return null
                      return (
                        <div key={cat.key} className="bg-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-gray-300 text-sm font-medium">{cat.label}</span>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${overMeta ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(realPct)}</p>
                            <p className="text-gray-500 text-xs">{fmt(detailData[cat.key + '_uso'])} uso</p>
                            {variacion !== null && (
                              <p className={`text-xs font-medium ${variacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {variacion > 0 ? '+' : ''}{fmt(variacion)}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <div className="bg-gray-700 rounded-xl px-4 py-3 flex items-center justify-between">
                      <span className="text-white font-bold text-sm">Total A&B</span>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${detailData.totalRealPct && detailData.totalRealPct > 35 ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(detailData.totalRealPct)}</p>
                        <p className="text-gray-400 text-xs">{fmt(detailData.totalUsoCost)} uso</p>
                        {detailData.totalVariacion !== null && (
                          <p className={`text-xs font-bold ${detailData.totalVariacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {detailData.totalVariacion > 0 ? '+' : ''}{fmt(detailData.totalVariacion)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── DESKTOP: tabla completa ── */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left text-gray-500 text-xs pb-3 font-medium">Categoría</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Inv. Ant.</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Compras</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Inv. Act.</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Uso $</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">
                            Ventas{includeOpDiscounts ? ' (+D.Op)' : ''}
                          </th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">% Real</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">% P.Mix</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Variación $</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Días Inv</th>
                          {canEdit && shortcut === 'week' && <th className="text-center text-gray-500 text-xs pb-3 font-medium">Ajuste</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {CATEGORIES.map(cat => {
                          const realPct = detailData[cat.key + '_uso_pct']
                          const mixPct = detailData[cat.key + '_theo_pct']
                          const variacion = detailData[cat.key + '_variacion']
                          const dias = detailData[cat.key + '_dias_inv']
                          const hasAdj = detailData[cat.key + '_has_adj']
                          const overMeta = cat.meta && realPct && realPct > cat.meta
                          return (
                            <tr key={cat.key} className="border-b border-gray-800 hover:bg-gray-800 transition">
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                                  <span className="text-gray-300 text-sm">{cat.label}</span>
                                  {hasAdj && <span className="text-yellow-400 text-xs" title="Tiene ajuste manual aplicado">✏️</span>}
                                </div>
                              </td>
                              <td className="py-3 text-right text-gray-500 text-xs">{fmt(detailData[cat.key + '_inv_previous'])}</td>
                              <td className="py-3 text-right text-gray-500 text-xs">{fmt(detailData[cat.key + '_purchases'])}</td>
                              <td className="py-3 text-right text-gray-500 text-xs">{fmt(detailData[cat.key + '_inv_current'])}</td>
                              <td className="py-3 text-right text-white text-sm font-medium">{fmt(detailData[cat.key + '_uso'])}</td>
                              <td className="py-3 text-right text-gray-400 text-sm">{fmt(detailData[cat.key + '_sales'])}</td>
                              <td className="py-3 text-right"><span className={`font-bold text-sm ${overMeta ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(realPct)}</span></td>
                              <td className="py-3 text-right text-blue-400 text-sm">{fmtPct(mixPct)}</td>
                              <td className="py-3 text-right">
                                {variacion !== null ? (
                                  <span className={`text-sm font-medium ${variacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {variacion > 0 ? '+' : ''}{fmt(variacion)}
                                  </span>
                                ) : <span className="text-gray-600">—</span>}
                              </td>
                              <td className="py-3 text-right text-gray-400 text-sm">{dias !== null ? dias + 'd' : '—'}</td>
                              {canEdit && shortcut === 'week' && (
                                <td className="py-3 text-center">
                                  <button onClick={() => openAdjPanel(detailWeek.report.week, detailWeek.report.id, cat.key)}
                                    className="text-xs px-2 py-1 rounded-lg bg-gray-800 hover:bg-yellow-900 text-gray-400 hover:text-yellow-400 transition">
                                    + Ajuste
                                  </button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                        <tr className="border-t-2 border-gray-700">
                          <td className="py-3 text-white font-bold">Total A&B</td>
                          <td colSpan={3} />
                          <td className="py-3 text-right text-white font-bold">{fmt(detailData.totalUsoCost)}</td>
                          <td className="py-3 text-right text-white font-bold">{fmt(detailData.totalABSales)}</td>
                          <td className="py-3 text-right"><span className={`font-bold ${detailData.totalRealPct && detailData.totalRealPct > 35 ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(detailData.totalRealPct)}</span></td>
                          <td className="py-3 text-right text-blue-400 font-bold">{fmtPct(detailData.totalMixPct)}</td>
                          <td className="py-3 text-right">
                            {detailData.totalVariacion !== null ? (
                              <span className={`font-bold ${detailData.totalVariacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {detailData.totalVariacion > 0 ? '+' : ''}{fmt(detailData.totalVariacion)}
                              </span>
                            ) : '—'}
                          </td>
                          <td />{canEdit && shortcut === 'week' && <td />}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {detailData.hasAnyAdj && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <p className="text-yellow-400 text-xs font-semibold mb-2">✏️ Ajustes aplicados esta semana:</p>
                      <div className="space-y-1">
                        {getWeekAdjustments(detailWeek?.report?.week).map(a => (
                          <div key={a.id} className="flex items-center gap-3 text-xs bg-yellow-950/40 rounded-lg px-3 py-2">
                            <span className="text-yellow-300 font-medium shrink-0">{CATEGORIES.find(c => c.key === a.category)?.label}</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-gray-400 shrink-0">{ADJUSTMENT_FIELDS.find(f => f.key === a.field)?.label}</span>
                            <span className={`font-bold shrink-0 ${Number(a.adjustment_value) > 0 ? 'text-yellow-400' : 'text-blue-400'}`}>
                              {Number(a.adjustment_value) > 0 ? '+' : ''}{fmt(a.adjustment_value)}
                            </span>
                            <span className="text-gray-600">·</span>
                            <span className="text-gray-400 flex-1 truncate">{a.note}</span>
                            <span className="text-gray-600 shrink-0">{a.created_by?.split('@')[0]}</span>
                            {canEdit && (
                              <button onClick={() => deleteAdjustment(a.id)}
                                className="text-red-500 hover:text-red-400 hover:bg-red-950 px-1.5 py-0.5 rounded transition shrink-0">✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {chartData.filter(d => d.hasInventory).length >= 1 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="text-white font-semibold mb-1">% Real vs % P.Mix por semana</h2>
                    <p className="text-gray-500 text-xs mb-4">Total A&B</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData.filter(d => d.hasInventory)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => [v + '%', name]} />
                        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                        <Line type="monotone" dataKey="totalRealPct" name="% Real" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                        <Line type="monotone" dataKey="totalMixPct" name="% P.Mix" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#22c55e', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="text-white font-semibold mb-1">Variación $ por semana</h2>
                    <p className="text-gray-500 text-xs mb-4">Positivo = sobre teórico (malo) · Negativo = bajo teórico (bueno)</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData.filter(d => d.hasInventory)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [fmt(v), 'Variación']} />
                        <Bar dataKey="totalVariacion" name="Variación $" radius={[4, 4, 0, 0]} fill="#ef4444" label={false}>
                          {chartData.filter(d => d.hasInventory).map((entry, index) => (
                            <Cell key={index} fill={entry.totalVariacion <= 0 ? '#22c55e' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-semibold mb-1">% Costo Real por categoría</h2>
                  <p className="text-gray-500 text-xs mb-4">Tendencia semanal</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData.filter(d => d.hasInventory)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => [v + '%', name]} />
                      <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                      {CATEGORIES.map(cat => (
                        <Line key={cat.key} type="monotone" dataKey={cat.key + '_uso_pct'} name={cat.label} stroke={cat.color} strokeWidth={2} dot={{ fill: cat.color, r: 3 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h2 className="text-white font-semibold">Histórico por semana</h2>
                    <p className="text-gray-500 text-xs">
                      {effectiveFiltered.length} semana{effectiveFiltered.length !== 1 ? 's' : ''} en el rango
                      {consolidatedSkippedWeeks.length > 0 && ` · incluye ${consolidatedSkippedWeeks.length} semana${consolidatedSkippedWeeks.length !== 1 ? 's' : ''} sin inventario`}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left text-gray-500 text-xs pb-3 font-medium">Semana</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">% Real</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">% P.Mix</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Variación $</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Uso $</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Ventas A&B</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Inventario</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">P.Mix</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...effectiveFiltered].reverse().map((w) => {
                          const d = buildWeekData(w)
                          return (
                            <tr key={w.report.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <div>
                                    <p className="text-gray-300">{w.report.week}</p>
                                    <p className="text-gray-600 text-xs">{w.report.week_start} → {w.report.week_end}</p>
                                  </div>
                                  {d.hasAnyAdj && <span className="text-yellow-400 text-xs" title="Semana con ajustes manuales">✏️</span>}
                                </div>
                              </td>
                              <td className="py-3 text-right"><span className={`font-medium ${d.totalRealPct && d.totalRealPct > 35 ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(d.totalRealPct)}</span></td>
                              <td className="py-3 text-right text-blue-400">{fmtPct(d.totalMixPct)}</td>
                              <td className="py-3 text-right">
                                {d.totalVariacion !== null ? (
                                  <span className={`font-medium ${d.totalVariacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {d.totalVariacion > 0 ? '+' : ''}{fmt(d.totalVariacion)}
                                  </span>
                                ) : <span className="text-gray-600">—</span>}
                              </td>
                              <td className="py-3 text-right text-white">{fmt(d.totalUsoCost)}</td>
                              <td className="py-3 text-right text-gray-400">{fmt(d.totalABSales)}</td>
                              <td className="py-3 text-right">{d.hasInventory ? <span className="text-green-400 text-xs">✓</span> : <span className="text-gray-600 text-xs">—</span>}</td>
                              <td className="py-3 text-right">{d.hasProductMix ? <span className="text-green-400 text-xs">✓</span> : <span className="text-gray-600 text-xs">—</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}