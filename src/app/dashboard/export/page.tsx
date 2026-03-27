'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { fetchExportData } from '@/lib/export/data-fetcher'
import type { ExportConfig, ExportTemplate } from '@/lib/export/data-fetcher'

const ALL_SECTIONS = [
  { key: 'executive', label: '📊 Resumen Ejecutivo', icon: '📊' },
  { key: 'ventas', label: '💰 Ventas', icon: '💰' },
  { key: 'labor', label: '👥 Labor', icon: '👥' },
  { key: 'food_cost', label: '🛒 Food Cost / Costo de Uso', icon: '🛒' },
  { key: 'waste', label: '🗑️ Waste / Merma', icon: '🗑️' },
  { key: 'employee', label: '🏆 Employee Performance', icon: '🏆' },
  { key: 'avt', label: '📊 Actual vs Teórico', icon: '📊' },
  { key: 'kitchen', label: '🍳 Kitchen Performance', icon: '🍳' },
  { key: 'compras', label: '🧾 Compras', icon: '🧾' },
]

const SYSTEM_TEMPLATES: ExportTemplate[] = [
  { id: 'midnight', name: 'Midnight Executive', colorPrimary: '1E2761', colorSecondary: 'CADCFC', colorAccent: 'FFFFFF' },
  { id: 'charcoal', name: 'Charcoal Minimal', colorPrimary: '36454F', colorSecondary: 'F2F2F2', colorAccent: '212121' },
  { id: 'coral', name: 'Coral Energy', colorPrimary: 'F96167', colorSecondary: 'F9E795', colorAccent: '2F3C7E' },
  { id: 'forest', name: 'Forest & Moss', colorPrimary: '2C5F2D', colorSecondary: '97BC62', colorAccent: 'F5F5F5' },
  { id: 'ocean', name: 'Ocean Gradient', colorPrimary: '065A82', colorSecondary: '1C7293', colorAccent: '21295C' },
  { id: 'cherry', name: 'Cherry Bold', colorPrimary: '990011', colorSecondary: 'FCF6F5', colorAccent: '2F3C7E' },
]

type Step = 'restaurantes' | 'periodo' | 'secciones' | 'template' | 'preview'

export default function ExportPage() {
  const { currentRestaurant, currentOrganization, organizations } = useAuth()
  const [step, setStep] = useState<Step>('restaurantes')
  const [generating, setGenerating] = useState(false)
  const [generatingFormat, setGeneratingFormat] = useState<string>('')
  const [error, setError] = useState('')

  // Config state
  const [selectedRestaurants, setSelectedRestaurants] = useState<string[]>([])
  const [allWeeks, setAllWeeks] = useState<any[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [sections, setSections] = useState<string[]>(ALL_SECTIONS.map(s => s.key))
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [selectedTemplate, setSelectedTemplate] = useState<ExportTemplate>(SYSTEM_TEMPLATES[0])
  const [customLogo, setCustomLogo] = useState<File | null>(null)
  const [customLogoUrl, setCustomLogoUrl] = useState('')
  const [savedTemplates, setSavedTemplates] = useState<any[]>([])
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [reportMode, setReportMode] = useState<'individual' | 'ceo'>('individual')
  const [dragSection, setDragSection] = useState<string | null>(null)

  // All restaurants from organizations
  const allRestaurants = organizations.flatMap(o => o.restaurants.map(r => ({ ...r, orgName: o.name })))

  useEffect(() => {
    if (currentRestaurant) {
      setSelectedRestaurants([currentRestaurant.id])
      loadWeeks(currentRestaurant.id)
    }
    loadSavedTemplates()
  }, [currentRestaurant])

  async function loadWeeks(restaurantId: string) {
    const { data } = await supabase.from('reports').select('week, week_start, week_end')
      .eq('restaurant_id', restaurantId).order('week', { ascending: false }).limit(52)
    setAllWeeks(data || [])
    if (data?.length) {
      setSelectedWeek(data[0].week)
    }
  }

  async function loadSavedTemplates() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('export_templates').select('*')
      .eq('is_system_template', false).order('created_at', { ascending: false })
    setSavedTemplates(data || [])
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true)
    setError('')
    try {
      const ext = file.name.split('.').pop()
      const path = `logos/${currentRestaurant?.id}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('restaurant-logos').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('restaurant-logos').getPublicUrl(path)
      setCustomLogoUrl(publicUrl)
      setSelectedTemplate(prev => ({ ...prev, logoUrl: publicUrl }))
    } catch (e: any) {
      setError('Error subiendo logo: ' + e.message)
    }
    setUploadingLogo(false)
  }

  async function saveTemplate() {
    if (!newTemplateName) return
    setSavingTemplate(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('export_templates').insert({
      name: newTemplateName,
      restaurant_id: currentRestaurant?.id,
      organization_id: currentRestaurant?.organization_id,
      is_system_template: false,
      template_type: 'pptx',
      color_primary: selectedTemplate.colorPrimary,
      color_secondary: selectedTemplate.colorSecondary,
      color_accent: selectedTemplate.colorAccent,
      file_path: customLogoUrl || null,
      created_by: user?.id,
    })
    if (!err) {
      setNewTemplateName('')
      loadSavedTemplates()
    }
    setSavingTemplate(false)
  }

  function toggleRestaurant(id: string) {
    setSelectedRestaurants(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    )
  }

  function toggleSection(key: string) {
    setSections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function moveSectionUp(key: string) {
    setSections(prev => {
      const idx = prev.indexOf(key)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveSectionDown(key: string) {
    setSections(prev => {
      const idx = prev.indexOf(key)
      if (idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  const selectedWeeks = allWeeks
    .filter(w => w.week >= weekFrom && w.week <= weekTo)
    .map(w => w.week)

  async function generate(format: 'pptx' | 'xlsx' | 'pdf') {
    if (!selectedRestaurants.length || !selectedWeeks.length) {
      setError('Selecciona al menos un restaurante y un período')
      return
    }
    setGenerating(true)
    setGeneratingFormat(format)
    setError('')
    try {
      const config: ExportConfig = {
        restaurantIds: selectedRestaurants,
        weeks: selectedWeeks,
        sections: sections.filter(s => ALL_SECTIONS.some(a => a.key === s)),
        notes,
        template: selectedTemplate,
        format,
        language: 'es',
      }

      // Fetch data for all selected restaurants
      const dataArr = await Promise.all(
        selectedRestaurants.map(id => fetchExportData(id, selectedWeeks))
      )
      const validData = dataArr.filter(Boolean) as any[]

      if (!validData.length) {
        setError('No se encontraron datos para el período seleccionado')
        setGenerating(false)
        return
      }

      if (format === 'pptx') {
        const { generatePPTX } = await import('@/lib/export/generate-pptx')
        await generatePPTX(config, validData)
      } else if (format === 'xlsx') {
        const { generateXLSX } = await import('@/lib/export/generate-xlsx')
        await generateXLSX(config, validData)
      } else if (format === 'pdf') {
        const { generatePDF } = await import('@/lib/export/generate-pdf')
        await generatePDF(config, validData)
      }
    } catch (e: any) {
      setError('Error generando reporte: ' + e.message)
      console.error(e)
    }
    setGenerating(false)
    setGeneratingFormat('')
  }

  const STEPS: { id: Step; label: string; num: number }[] = [
    { id: 'restaurantes', label: 'Restaurantes', num: 1 },
    { id: 'periodo', label: 'Período', num: 2 },
    { id: 'secciones', label: 'Secciones', num: 3 },
    { id: 'template', label: 'Template', num: 4 },
    { id: 'preview', label: 'Exportar', num: 5 },
  ]

  const stepOrder: Step[] = ['restaurantes', 'periodo', 'secciones', 'template', 'preview']

  function canProceed(s: Step): boolean {
    if (s === 'restaurantes') return selectedRestaurants.length > 0
    if (s === 'periodo') return selectedWeeks.length > 0
    if (s === 'secciones') return sections.length > 0
    return true
  }

  const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500'

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <h1 className="text-white font-bold text-lg">📤 Exportar Reporte</h1>
        <p className="text-gray-500 text-xs mt-0.5">Configura y genera reportes en PDF, PPTX o Excel</p>
      </div>

      {/* Step navigator */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <button onClick={() => setStep(s.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${step === s.id ? 'bg-blue-600 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s.id ? 'bg-white text-blue-600' : 'bg-gray-700 text-gray-400'}`}>{s.num}</span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <span className="text-gray-700">›</span>}
            </div>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {error && <div className="bg-red-950 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

        {/* ── STEP 1: Restaurantes ────────────────────────────────────── */}
        {step === 'restaurantes' && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Tipo de reporte</h2>
              <p className="text-gray-500 text-xs mb-4">¿Es un reporte individual o multi-restaurante?</p>
              <div className="flex gap-3">
                {[{ id: 'individual', label: '🏠 Restaurante individual' }, { id: 'ceo', label: '👑 Multi-restaurante (CEO)' }].map(m => (
                  <button key={m.id} onClick={() => setReportMode(m.id as any)}
                    className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition ${reportMode === m.id ? 'border-blue-500 bg-blue-950 text-blue-300' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Seleccionar restaurantes</h2>
              <div className="space-y-2">
                {organizations.map(org => (
                  <div key={org.id}>
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">{org.name}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                      {org.restaurants.map(rest => (
                        <button key={rest.id}
                          onClick={() => reportMode === 'individual' ? setSelectedRestaurants([rest.id]) : toggleRestaurant(rest.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${selectedRestaurants.includes(rest.id) ? 'border-blue-500 bg-blue-950' : 'border-gray-700 hover:border-gray-600'}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selectedRestaurants.includes(rest.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}`}>
                            {selectedRestaurants.includes(rest.id) && <span className="text-white text-xs">✓</span>}
                          </div>
                          <span className={`text-sm font-medium ${selectedRestaurants.includes(rest.id) ? 'text-blue-300' : 'text-gray-300'}`}>{rest.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={() => setStep('periodo')} disabled={!canProceed('restaurantes')}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Período ──────────────────────────────────────────── */}
        {step === 'periodo' && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Período del reporte</h2>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Semana inicio</label>
                  <select value={weekFrom} onChange={e => setWeekFrom(e.target.value)} className={inputCls}>
                    {allWeeks.map(w => <option key={w.week} value={w.week}>{w.week} ({w.week_start})</option>)}
                  </select>
                </div>
                <span className="text-gray-500 mt-4">→</span>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Semana fin</label>
                  <select value={weekTo} onChange={e => setWeekTo(e.target.value)} className={inputCls}>
                    {allWeeks.map(w => <option key={w.week} value={w.week}>{w.week} ({w.week_start})</option>)}
                  </select>
                </div>
              </div>
              <p className="text-gray-500 text-xs mt-3">
                {selectedWeeks.length} semana{selectedWeeks.length !== 1 ? 's' : ''} seleccionada{selectedWeeks.length !== 1 ? 's' : ''}: {selectedWeeks.join(', ')}
              </p>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep('restaurantes')} className="text-gray-400 hover:text-white text-sm transition">← Atrás</button>
              <button onClick={() => setStep('secciones')} disabled={!canProceed('periodo')}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Secciones ────────────────────────────────────────── */}
        {step === 'secciones' && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Secciones del reporte</h2>
                <div className="flex gap-2">
                  <button onClick={() => setSections(ALL_SECTIONS.map(s => s.key))} className="text-xs text-blue-400 hover:text-blue-300">Seleccionar todo</button>
                  <span className="text-gray-700">·</span>
                  <button onClick={() => setSections([])} className="text-xs text-gray-500 hover:text-gray-400">Limpiar</button>
                </div>
              </div>
              <div className="space-y-2">
                {sections.map((key, idx) => {
                  const sec = ALL_SECTIONS.find(s => s.key === key)
                  if (!sec) return null
                  return (
                    <div key={key} className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveSectionUp(key)} disabled={idx === 0} className="text-gray-600 hover:text-gray-400 disabled:opacity-30 text-xs leading-none">▲</button>
                          <button onClick={() => moveSectionDown(key)} disabled={idx === sections.length - 1} className="text-gray-600 hover:text-gray-400 disabled:opacity-30 text-xs leading-none">▼</button>
                        </div>
                        <span className="text-gray-500 text-xs w-4">{idx + 1}</span>
                        <button onClick={() => toggleSection(key)}
                          className="w-5 h-5 rounded border-2 border-blue-500 bg-blue-500 flex items-center justify-center shrink-0">
                          <span className="text-white text-xs">✓</span>
                        </button>
                        <span className="text-gray-200 text-sm font-medium flex-1">{sec.label}</span>
                        <button onClick={() => toggleSection(key)} className="text-gray-600 hover:text-red-400 text-xs transition">✕</button>
                      </div>
                      <input type="text" placeholder={`Nota para ${sec.label} (opcional)...`}
                        value={notes[key] || ''} onChange={e => setNotes(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 text-xs focus:outline-none focus:border-blue-500 placeholder-gray-600" />
                    </div>
                  )
                })}
              </div>

              {/* Secciones no incluidas */}
              {ALL_SECTIONS.filter(s => !sections.includes(s.key)).length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-gray-600 text-xs mb-2">No incluidas (click para agregar):</p>
                  <div className="flex gap-2 flex-wrap">
                    {ALL_SECTIONS.filter(s => !sections.includes(s.key)).map(sec => (
                      <button key={sec.key} onClick={() => setSections(prev => [...prev, sec.key])}
                        className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 transition">
                        + {sec.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep('periodo')} className="text-gray-400 hover:text-white text-sm transition">← Atrás</button>
              <button onClick={() => setStep('template')} disabled={!canProceed('secciones')}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Template ─────────────────────────────────────────── */}
        {step === 'template' && (
          <div className="space-y-4">
            {/* Sistema templates */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Templates del sistema</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {SYSTEM_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setSelectedTemplate(t)}
                    className={`p-4 rounded-xl border-2 text-left transition ${selectedTemplate.id === t.id ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded" style={{ backgroundColor: '#' + t.colorPrimary }} />
                      <div className="w-5 h-5 rounded" style={{ backgroundColor: '#' + t.colorSecondary }} />
                      <div className="w-5 h-5 rounded border border-gray-600" style={{ backgroundColor: '#' + t.colorAccent }} />
                    </div>
                    <p className="text-gray-200 text-sm font-medium">{t.name}</p>
                    {selectedTemplate.id === t.id && <p className="text-blue-400 text-xs mt-0.5">✓ Seleccionado</p>}
                  </button>
                ))}
              </div>
            </div>

            {/* Templates guardados */}
            {savedTemplates.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Templates guardados</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {savedTemplates.map(t => (
                    <button key={t.id} onClick={() => setSelectedTemplate({
                      id: t.id, name: t.name,
                      colorPrimary: t.color_primary, colorSecondary: t.color_secondary,
                      colorAccent: t.color_accent, logoUrl: t.file_path || undefined,
                    })}
                      className={`p-4 rounded-xl border-2 text-left transition ${selectedTemplate.id === t.id ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded" style={{ backgroundColor: '#' + t.color_primary }} />
                        <div className="w-5 h-5 rounded" style={{ backgroundColor: '#' + t.color_secondary }} />
                      </div>
                      <p className="text-gray-200 text-sm font-medium">{t.name}</p>
                      {t.file_path && <p className="text-green-400 text-xs mt-0.5">🖼️ Con logo</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Personalización */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Personalizar colores</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { key: 'colorPrimary', label: 'Color Principal' },
                  { key: 'colorSecondary', label: 'Color Secundario' },
                  { key: 'colorAccent', label: 'Color Acento' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-gray-400 text-xs block mb-1">{label}</label>
                    <div className="flex items-center gap-2">
                      <input type="color"
                        value={'#' + (selectedTemplate[key as keyof ExportTemplate] as string)}
                        onChange={e => setSelectedTemplate(prev => ({ ...prev, [key]: e.target.value.replace('#', '') }))}
                        className="w-10 h-9 rounded cursor-pointer bg-transparent border-0" />
                      <input type="text" value={(selectedTemplate[key as keyof ExportTemplate] as string)}
                        onChange={e => setSelectedTemplate(prev => ({ ...prev, [key]: e.target.value.replace('#', '').substring(0, 6) }))}
                        className={`flex-1 ${inputCls} font-mono uppercase`} maxLength={6} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Logo */}
              <div className="mb-4">
                <label className="text-gray-400 text-xs block mb-1">Logo del restaurante</label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition">
                    {uploadingLogo ? 'Subiendo...' : '📁 Subir logo (PNG/JPG)'}
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]) }} />
                  </label>
                  {customLogoUrl && (
                    <div className="flex items-center gap-2">
                      <img src={customLogoUrl} alt="logo" className="h-10 w-auto rounded border border-gray-700" />
                      <button onClick={() => { setCustomLogoUrl(''); setSelectedTemplate(prev => ({ ...prev, logoUrl: undefined })) }}
                        className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Guardar template */}
              <div className="border-t border-gray-800 pt-4">
                <p className="text-gray-400 text-xs mb-2">Guardar como nuevo template:</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="Nombre del template" value={newTemplateName}
                    onChange={e => setNewTemplateName(e.target.value)}
                    className={`flex-1 ${inputCls}`} />
                  <button onClick={saveTemplate} disabled={savingTemplate || !newTemplateName}
                    className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition">
                    {savingTemplate ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep('secciones')} className="text-gray-400 hover:text-white text-sm transition">← Atrás</button>
              <button onClick={() => setStep('preview')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                Ver resumen →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Preview / Exportar ───────────────────────────────── */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Resumen de configuración */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Resumen de configuración</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-xl p-4">
                  <p className="text-gray-500 text-xs mb-1">Restaurantes</p>
                  <p className="text-white font-bold text-xl">{selectedRestaurants.length}</p>
                  <p className="text-gray-500 text-xs mt-1">{allRestaurants.filter(r => selectedRestaurants.includes(r.id)).map(r => r.name).join(', ')}</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-4">
                  <p className="text-gray-500 text-xs mb-1">Semanas</p>
                  <p className="text-white font-bold text-xl">{selectedWeeks.length}</p>
                  <p className="text-gray-500 text-xs mt-1">{weekFrom} → {weekTo}</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-4">
                  <p className="text-gray-500 text-xs mb-1">Secciones</p>
                  <p className="text-white font-bold text-xl">{sections.length}</p>
                  <p className="text-gray-500 text-xs mt-1">{sections.map(k => ALL_SECTIONS.find(s => s.key === k)?.icon).join(' ')}</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-4">
                  <p className="text-gray-500 text-xs mb-1">Template</p>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#' + selectedTemplate.colorPrimary }} />
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#' + selectedTemplate.colorSecondary }} />
                  </div>
                  <p className="text-gray-500 text-xs mt-1">{selectedTemplate.name}</p>
                </div>
              </div>
            </div>

            {/* Botones de exportación */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-2">Generar reporte</h2>
              <p className="text-gray-500 text-xs mb-6">El archivo se descargará automáticamente en tu dispositivo</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { format: 'pptx' as const, label: 'PowerPoint', sub: 'Presentación editable', icon: '📊', color: 'from-orange-700 to-orange-600' },
                  { format: 'pdf' as const, label: 'PDF', sub: 'Documento para compartir', icon: '📄', color: 'from-red-700 to-red-600' },
                  { format: 'xlsx' as const, label: 'Excel', sub: 'Datos para análisis', icon: '📈', color: 'from-green-700 to-green-600' },
                ].map(({ format, label, sub, icon, color }) => (
                  <button key={format} onClick={() => generate(format)}
                    disabled={generating}
                    className={`bg-gradient-to-br ${color} hover:opacity-90 disabled:opacity-50 text-white p-5 rounded-xl text-left transition`}>
                    <div className="text-3xl mb-2">{icon}</div>
                    <p className="font-bold text-lg">{label}</p>
                    <p className="text-white/70 text-xs mt-0.5">{sub}</p>
                    {generating && generatingFormat === format && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-white/80">Generando...</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Notas por sección */}
            {sections.some(k => notes[k]) && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-3">Notas incluidas</h2>
                <div className="space-y-2">
                  {sections.filter(k => notes[k]).map(k => (
                    <div key={k} className="flex items-start gap-3 bg-yellow-950/40 border border-yellow-900 rounded-lg px-3 py-2">
                      <span className="text-yellow-400 text-xs shrink-0 mt-0.5">{ALL_SECTIONS.find(s => s.key === k)?.icon}</span>
                      <div>
                        <p className="text-yellow-300 text-xs font-medium">{ALL_SECTIONS.find(s => s.key === k)?.label}</p>
                        <p className="text-yellow-400 text-xs mt-0.5">{notes[k]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-start">
              <button onClick={() => setStep('template')} className="text-gray-400 hover:text-white text-sm transition">← Atrás</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}