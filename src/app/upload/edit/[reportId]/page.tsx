'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STEPS = [
  {
    id: 'sales', label: 'Ventas', icon: '💰', system: 'Toast', required: true,
    where: 'Toast → Reports → Sales Summary',
    extracts: 'Ventas netas, brutas, órdenes, guests, categorías, áreas',
  },
  {
    id: 'labor', label: 'Labor', icon: '👥', system: 'Toast', required: true,
    where: 'Toast → Reports → Labor → Payroll Export',
    extracts: 'Horas regulares, overtime, costo por empleado y puesto',
  },
  {
    id: 'cogs', label: 'Compras', icon: '🛒', system: 'R365', required: false,
    where: 'R365 → Reports → COGS Analysis by Vendor',
    extracts: 'Compras por proveedor y categoría',
  },
  {
    id: 'voids', label: 'Voids', icon: '❌', system: 'Toast', required: false,
    where: 'Toast → Reports → Void Details',
    extracts: 'Items voideados, razón, servidor y valor',
  },
  {
    id: 'discounts', label: 'Descuentos', icon: '🏷️', system: 'Toast', required: false,
    where: 'Toast → Reports → Discount Details',
    extracts: 'Descuentos por nombre, aplicaciones y monto total',
  },
  {
    id: 'waste', label: 'Waste', icon: '🗑️', system: 'R365', required: false,
    where: 'R365 → Inventory → Waste History',
    extracts: 'Items de merma, cantidad, costo unitario y total',
  },
  {
    id: 'inventory', label: 'Inventory Count', icon: '📦', system: 'R365', required: false,
    where: 'R365 → Inventory → Inventory Count Review',
    extracts: 'Inventario actual y anterior por categoría',
  },
  {
    id: 'avt', label: 'Actual vs Teórico', icon: '📊', system: 'R365', required: false,
    where: 'R365 → Reports → Actual vs Theoretical Analysis',
    extracts: 'Faltantes y sobrantes de inventario',
  },
  {
    id: 'product_mix',
    label: 'Product Mix Toast',
    icon: '🍽️',
    system: 'Toast',
    required: false,
    where: 'Toast → Reports → Product Mix',
    instructions: [
      'Abre Toast POS',
      'Ve a Reports',
      'Click en Product Mix',
      'Selecciona el rango de fechas de tu semana',
      'Exporta como .xlsx',
    ],
    extracts: 'Ventas por item y categoría de menú',
  },
  {
    id: 'menu_analysis',
    label: 'Menu Item Analysis',
    icon: '📋',
    system: 'R365',
    required: false,
    where: 'R365 → Reports → Menu Item Analysis',
    instructions: [
      'Abre Restaurant365',
      'Ve a Reports',
      'Busca Menu Item Analysis',
      'Selecciona el rango de fechas de tu semana',
      'Exporta como .xlsx',
    ],
    extracts: 'Costo teórico por item para calcular % P.Mix',
  },
]

const TABLE_MAP: Record<string, string> = {
  sales: 'sales_data',
  labor: 'labor_data',
  cogs: 'cogs_data',
  voids: 'voids_data',
  discounts: 'discounts_data',
  waste: 'waste_data',
  inventory: 'inventory_data',
  avt: 'avt_data',
}

export default function EditReportPage() {
  const { reportId } = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<any>(null)
  const [existingData, setExistingData] = useState<Record<string, boolean>>({})
  const [files, setFiles] = useState<Record<string, File>>({})
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else loadReport()
    })
  }, [reportId])

  async function loadReport() {
    const { data: rep } = await supabase
      .from('reports').select('*').eq('id', reportId).single()
    if (!rep) { window.location.href = '/dashboard/history'; return }
    setReport(rep)

    // Verificar qué datos ya existen en tablas estándar
    const checks = await Promise.all(
      Object.entries(TABLE_MAP).map(async ([fileType, table]) => {
        const { data } = await supabase
          .from(table).select('id').eq('report_id', reportId).single()
        return [fileType, !!data]
      })
    )

    // Verificar product_mix_data (cubre product_mix Y menu_analysis)
    const { data: pmData } = await supabase
      .from('product_mix_data').select('id').eq('report_id', reportId).single()

    const existingMap = Object.fromEntries(checks)
    existingMap['product_mix'] = !!pmData
    existingMap['menu_analysis'] = !!pmData

    setExistingData(existingMap)
    setLoading(false)
  }

  function handleFile(file: File, stepId: string) {
    setFiles(prev => ({ ...prev, [stepId]: file }))
  }

  async function handleProcess() {
    if (Object.keys(files).length === 0) {
      setStatus('⚠️ No hay archivos nuevos para procesar')
      return
    }

    setUploading(true)
    setStatus('Procesando con IA...')

    const formData = new FormData()
    formData.append('week', report.week)
    formData.append('report_id', reportId as string)
    formData.append('mode', 'edit')
    Object.entries(files).forEach(([type, file]) => {
      formData.append(type, file)
    })

    try {
      const res = await fetch('/api/process-edit', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        const warningKeys = Object.keys(data.warnings || {})
        if (warningKeys.length > 0) {
          const msgs = warningKeys.map((k: string) => `• ${k.toUpperCase()}: ${data.warnings[k]}`).join('\n')
          setStatus(`⚠️ Procesado con advertencias:\n${msgs}`)
        } else {
          setStatus('✅ Reporte actualizado correctamente')
        }
        setTimeout(() => router.push('/dashboard/history'), 3000)
      } else {
        setStatus('❌ Error: ' + (data.error || 'Intenta de nuevo'))
        setUploading(false)
      }
    } catch {
      setStatus('❌ Error al conectar. Intenta de nuevo.')
      setUploading(false)
    }
  }

  const step = STEPS[currentStep]
  const isLastStep = currentStep === STEPS.length

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando reporte...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard/history')}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Historial
        </button>
        <div>
          <span className="text-white font-semibold">Editar reporte</span>
          <span className="text-gray-500 text-sm ml-2">{report?.week} · {report?.week_start} al {report?.week_end}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">

        {/* Progreso */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className={`h-2 flex-1 rounded-full transition-all cursor-pointer ${
                files[s.id] ? 'bg-blue-500' :
                existingData[s.id] ? 'bg-green-600' :
                i === currentStep ? 'bg-blue-400' :
                'bg-gray-800'
              }`}
              title={s.label}
            />
          ))}
        </div>

        {/* Leyenda */}
        <div className="flex items-center gap-4 mb-6 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-full bg-green-600" />
            <span>Ya subido</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-full bg-blue-500" />
            <span>Nuevo archivo seleccionado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-full bg-gray-800" />
            <span>Sin datos</span>
          </div>
        </div>

        {!isLastStep ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{step.icon}</span>
                <div>
                  <p className="text-white font-bold text-lg">{step.label}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    step.system === 'Toast' ? 'bg-orange-900 text-orange-300' : 'bg-blue-900 text-blue-300'
                  }`}>
                    {step.system}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-xs">Paso {currentStep + 1} de {STEPS.length}</p>
                {existingData[step.id] && !files[step.id] && (
                  <span className="text-green-400 text-xs">✓ Ya subido</span>
                )}
                {files[step.id] && (
                  <span className="text-blue-400 text-xs">↑ Nuevo archivo</span>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-b border-gray-800 bg-gray-950">
              <p className="text-gray-600 text-xs mb-1">📍 {step.where}</p>
              <p className="text-gray-500 text-xs">{step.extracts}</p>
            </div>

            <div className="px-6 py-5">
              {existingData[step.id] && !files[step.id] ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-green-950 border border-green-800 rounded-xl px-4 py-3">
                    <span className="text-green-400 text-xl">✓</span>
                    <div className="flex-1">
                      <p className="text-green-400 font-medium text-sm">Datos existentes</p>
                      <p className="text-green-600 text-xs">Este archivo ya fue procesado para {report?.week}</p>
                    </div>
                  </div>
                  <label className="cursor-pointer block border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-xl p-5 text-center transition">
                    <p className="text-gray-400 text-sm font-medium">🔄 Reemplazar con nuevo archivo</p>
                    <p className="text-gray-600 text-xs mt-1">Click para seleccionar un archivo diferente</p>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.pdf"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], step.id)}
                    />
                  </label>
                </div>
              ) : files[step.id] ? (
                <div className="flex items-center justify-between bg-blue-950 border border-blue-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-blue-400 text-xl">↑</span>
                    <div>
                      <p className="text-blue-400 font-medium text-sm">Nuevo archivo listo</p>
                      <p className="text-blue-600 text-xs">{files[step.id].name}</p>
                    </div>
                  </div>
                  <label className="cursor-pointer text-gray-400 text-sm hover:text-white">
                    Cambiar
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.pdf"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], step.id)}
                    />
                  </label>
                </div>
              ) : (
                <label className="cursor-pointer block border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-xl p-8 text-center transition">
                  <div className="text-4xl mb-3">📎</div>
                  <p className="text-white font-medium mb-1">Seleccionar archivo</p>
                  <p className="text-gray-500 text-sm">Excel, CSV o PDF</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], step.id)}
                  />
                </label>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-800 flex justify-between">
              <button
                onClick={() => setCurrentStep(prev => prev - 1)}
                disabled={currentStep === 0}
                className="text-gray-400 hover:text-white disabled:opacity-0 transition text-sm"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setCurrentStep(prev => prev + 1)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition"
              >
                Continuar →
              </button>
            </div>
          </div>

        ) : (

          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-800">
              <h2 className="text-white font-bold text-lg">Resumen de cambios</h2>
              <p className="text-gray-500 text-sm mt-1">Semana: {report?.week}</p>
            </div>

            <div className="divide-y divide-gray-800">
              {STEPS.map(s => (
                <div key={s.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{s.icon}</span>
                    <span className="text-gray-300 text-sm">{s.label}</span>
                  </div>
                  {files[s.id] ? (
                    <span className="text-blue-400 text-xs font-medium">↑ Se va a reemplazar</span>
                  ) : existingData[s.id] ? (
                    <span className="text-green-400 text-xs">✓ Sin cambios</span>
                  ) : (
                    <span className="text-gray-600 text-xs">— Sin datos</span>
                  )}
                </div>
              ))}
            </div>

            {Object.keys(files).length === 0 && (
              <div className="px-6 py-4 bg-yellow-950 border-t border-yellow-900">
                <p className="text-yellow-400 text-sm">⚠️ No seleccionaste ningún archivo nuevo. Regresa y selecciona al menos uno.</p>
              </div>
            )}

            <div className="px-6 py-5 border-t border-gray-800">
              {status && (
                <div className={`mb-4 px-4 py-3 rounded-lg text-sm whitespace-pre-line ${
                  status.startsWith('✅') ? 'bg-green-950 border border-green-800 text-green-400' :
                  status.startsWith('⚠️') ? 'bg-yellow-950 border border-yellow-800 text-yellow-400' :
                  status.startsWith('❌') ? 'bg-red-950 border border-red-800 text-red-400' :
                  'bg-blue-950 border border-blue-800 text-blue-400'
                }`}>
                  {status}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep(STEPS.length - 1)}
                  className="text-gray-400 hover:text-white text-sm transition"
                >
                  ← Regresar
                </button>
                <button
                  onClick={handleProcess}
                  disabled={uploading || Object.keys(files).length === 0}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold py-3 rounded-xl transition"
                >
                  {uploading ? 'Procesando...' : `🔄 Actualizar ${Object.keys(files).length} archivo(s)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}