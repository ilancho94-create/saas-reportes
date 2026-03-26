'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const STEPS = [
  {
    id: 'sales', label: 'Ventas', icon: '💰', system: 'Toast', required: true,
    accept: '.xlsx', acceptLabel: 'Excel (.xlsx)',
    where: 'Toast → Reports → Sales Summary',
    instructions: ['Abre Toast POS', 'Ve a Reports en el menú izquierdo', 'Click en "Sales Summary"', 'Selecciona el rango de fechas de tu semana', 'Click en Export y descarga el .xlsx'],
    extracts: 'Ventas netas, brutas, órdenes, guests, categorías, áreas',
  },
  {
    id: 'labor', label: 'Labor', icon: '👥', system: 'Toast', required: true,
    accept: '.csv', acceptLabel: 'CSV (.csv)',
    where: 'Toast → Reports → Labor → Payroll Export',
    instructions: ['Abre Toast POS', 'Ve a Reports → Labor', 'Click en Payroll Export', 'Selecciona el rango de fechas de tu semana', 'Click en Export y descarga el .csv'],
    extracts: 'Horas regulares, overtime, costo por empleado y puesto',
  },
  {
    id: 'cogs', label: 'Compras COGS', icon: '🛒', system: 'R365', required: false,
    accept: '.xlsx', acceptLabel: 'Excel (.xlsx)',
    where: 'R365 → Reports → COGS Analysis by Vendor',
    instructions: ['Abre Restaurant365', 'Ve a Reports en el menú', 'Busca COGS Analysis by Vendor', 'Selecciona el rango de fechas de tu semana', 'Exporta como .xlsx'],
    extracts: 'Compras por proveedor y categoría (Food, Liquor, Beer, etc)',
  },
  {
    id: 'voids', label: 'Voids', icon: '❌', system: 'Toast', required: false,
    accept: '.csv', acceptLabel: 'CSV (.csv)',
    where: 'Toast → Reports → Void Details',
    instructions: ['Abre Toast POS', 'Ve a Reports', 'Click en Void Details', 'Selecciona el rango de fechas de tu semana', 'Exporta como .csv'],
    extracts: 'Items voideados, razón, servidor y valor',
  },
  {
    id: 'discounts', label: 'Descuentos', icon: '🏷️', system: 'Toast', required: false,
    accept: '.csv', acceptLabel: 'CSV (.csv)',
    where: 'Toast → Reports → Discount Details',
    instructions: ['Abre Toast POS', 'Ve a Reports', 'Click en Discount Details', 'Selecciona el rango de fechas de tu semana', 'Exporta como .csv'],
    extracts: 'Descuentos por nombre, aplicaciones y monto total',
  },
  {
    id: 'waste', label: 'Waste', icon: '🗑️', system: 'R365', required: false,
    accept: '.xlsx', acceptLabel: 'Excel (.xlsx)',
    where: 'R365 → Inventory → Waste History',
    instructions: ['Abre Restaurant365', 'Ve a Inventory → Waste', 'Click en Waste History', 'Selecciona el rango de fechas de tu semana', 'Exporta como .xlsx'],
    extracts: 'Items de merma, cantidad, costo unitario y total',
  },
  {
    id: 'inventory', label: 'Inventory Count', icon: '🏭', system: 'R365', required: false,
    accept: '.xlsx', acceptLabel: 'Excel (.xlsx)',
    where: 'R365 → Inventory → Inventory Count Review',
    instructions: ['Abre Restaurant365', 'Ve a Inventory', 'Click en Inventory Count Review', 'Selecciona la fecha del conteo (lunes de tu semana)', 'Exporta como .xlsx'],
    extracts: 'Inventario actual y anterior por categoría para calcular costo de uso',
  },
  {
    id: 'avt', label: 'Actual vs Teórico', icon: '📊', system: 'R365', required: false,
    accept: '.csv', acceptLabel: 'CSV (.csv)',
    where: 'R365 → Reports → Actual vs Theoretical Analysis',
    instructions: ['Abre Restaurant365', 'Ve a Reports', 'Busca Actual vs Theoretical Analysis', 'Selecciona el rango de fechas de tu semana', 'Exporta como .csv o .xlsx'],
    extracts: 'Faltantes y sobrantes de inventario con impacto en dólares',
  },
  {
    id: 'product_mix', label: 'Product Mix', icon: '🍽️', system: 'Toast', required: false,
    accept: '.xlsx', acceptLabel: 'Excel (.xlsx)',
    where: 'Toast → Reports → Product Mix',
    instructions: ['Abre Toast POS', 'Ve a Reports', 'Click en Product Mix', 'Selecciona el rango de fechas de tu semana', 'Exporta como .xlsx'],
    extracts: 'Ventas por item, menú y categoría para calcular costo teórico',
  },
  {
    id: 'menu_analysis', label: 'Menu Item Analysis', icon: '📋', system: 'R365', required: false,
    accept: '.xlsx', acceptLabel: 'Excel (.xlsx)',
    where: 'R365 → Reports → Menu Item Analysis',
    instructions: ['Abre Restaurant365', 'Ve a Reports', 'Busca Menu Item Analysis', 'Selecciona el rango de fechas de tu semana', 'Exporta como .xlsx'],
    extracts: 'Costo teórico por item para calcular % de costo de uso',
  },
  {
    id: 'receiving', label: 'Compras de Insumos', icon: '📦', system: 'R365', required: false,
    accept: '.csv', acceptLabel: 'CSV (.csv)',
    where: 'R365 → Reports → Receiving by Purchased Item',
    instructions: ['Abre Restaurant365', 'Ve a Reports', 'Busca Receiving by Purchased Item', 'Selecciona el rango de fechas de tu semana', 'Exporta como .csv'],
    extracts: 'Costo unitario por insumo, proveedor y categoría para análisis de variación de precios',
  },
  {
    id: 'employee_performance', label: 'Employee Performance', icon: '🏆', system: 'Toast', required: false,
    accept: '.xlsx', acceptLabel: 'Excel (.xlsx)',
    where: 'Toast → Reports → Employee Performance',
    instructions: ['Abre Toast POS', 'Ve a Reports', 'Click en Employee Performance', 'Selecciona el rango de fechas de tu semana', 'Exporta como .xlsx'],
    extracts: 'Ventas por servidor, ventas/hora, ticket promedio, voids y tiempo de turno',
  },
  {
  id: 'kitchen_details', label: 'Kitchen Details', icon: '🍳', system: 'Toast', required: false,
  accept: '.csv', acceptLabel: 'CSV (.csv)',
  where: 'Toast → Reports → Kitchen Details',
  instructions: ['Abre Toast POS', 'Ve a Reports', 'Click en Kitchen Details', 'Selecciona el rango de fechas', 'Exporta como .csv'],
  extracts: 'Tiempos de cocina y bar por estación, día y hora',
},
]

export default function UploadPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [week, setWeek] = useState('')
  const [files, setFiles] = useState<Record<string, File>>({})
  const [fileError, setFileError] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const isLastStep = currentStep === STEPS.length
  const step = STEPS[currentStep]
  const completedRequired = files['sales'] || files['labor']

  function validateFile(file: File, stepId: string): string | null {
    const s = STEPS.find(s => s.id === stepId)
    if (!s) return null
    const allowed = s.accept.split(',').map(a => a.trim().toLowerCase())
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!allowed.includes(ext)) return `Este paso requiere ${s.acceptLabel}. El archivo "${file.name}" no es válido.`
    return null
  }

  function handleFile(file: File) {
    const error = validateFile(file, step.id)
    if (error) { setFileError(error); return }
    setFileError('')
    setFiles(prev => ({ ...prev, [step.id]: file }))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [step?.id])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false) }, [])

  function goNext() { setFileError(''); setCurrentStep(prev => prev + 1) }
  function goBack() { setFileError(''); setCurrentStep(prev => prev - 1) }

  async function handleProcess() {
    if (!week) return setStatus('Por favor selecciona la semana')
    if (!completedRequired) return setStatus('Necesitas subir al menos Ventas o Labor')
    setUploading(true); setStatus('Procesando...')
    const formData = new FormData()
    formData.append('week', week)
    Object.entries(files).forEach(([type, file]) => formData.append(type, file))
    try {
      const res = await fetch('/api/process', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        const warningKeys = Object.keys(data.warnings || {})
        if (warningKeys.length > 0) {
          const msgs = warningKeys.map((k: string) => `• ${k.toUpperCase()}: ${data.warnings[k]}`).join('\n')
          setStatus(`⚠️ Reporte procesado con advertencias de fecha:\n${msgs}`)
          setTimeout(() => router.push('/dashboard'), 6000)
        } else {
          setStatus('✅ Reporte procesado correctamente')
          setTimeout(() => router.push('/dashboard'), 2000)
        }
      } else {
        setStatus('❌ Error: ' + (data.error || 'Intenta de nuevo')); setUploading(false)
      }
    } catch {
      setStatus('❌ Error al conectar. Intenta de nuevo.'); setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center gap-4">
        <a href="/dashboard" className="text-gray-400 hover:text-white text-sm">← Volver al dashboard</a>
        <span className="text-white font-semibold">Subir reporte semanal</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {currentStep === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <label className="text-white font-semibold block mb-1">¿Qué semana es este reporte?</label>
            <p className="text-gray-500 text-sm mb-3">Selecciona el lunes de inicio de tu semana</p>
            <input type="week" value={week} onChange={e => setWeek(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
          </div>
        )}

        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`h-2 flex-1 rounded-full transition-all ${i < currentStep ? 'bg-blue-500' : i === currentStep ? 'bg-blue-400' : 'bg-gray-800'}`} />
          ))}
        </div>

        {!isLastStep ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{step.icon}</span>
                <div>
                  <p className="text-white font-bold text-lg">{step.label}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${step.system === 'Toast' ? 'bg-orange-900 text-orange-300' : 'bg-blue-900 text-blue-300'}`}>{step.system}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-xs">Paso {currentStep + 1} de {STEPS.length}</p>
                {step.required ? <span className="text-red-400 text-xs">Requerido</span> : <span className="text-gray-600 text-xs">Opcional</span>}
              </div>
            </div>

            <div className="px-6 py-5 border-b border-gray-800">
              <p className="text-gray-400 text-sm font-medium mb-3">📍 Dónde descargarlo:</p>
              <p className="text-blue-400 text-sm font-mono bg-gray-800 px-3 py-2 rounded-lg mb-4">{step.where}</p>
              <ol className="space-y-2">
                {step.instructions.map((inst, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-400">
                    <span className="bg-gray-800 text-gray-500 rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">{i + 1}</span>
                    {inst}
                  </li>
                ))}
              </ol>
            </div>

            <div className="px-6 py-4 border-b border-gray-800 bg-gray-950 flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-xs mb-0.5">El sistema va a extraer:</p>
                <p className="text-gray-400 text-sm">{step.extracts}</p>
              </div>
              <div className="shrink-0 ml-4 text-right">
                <p className="text-gray-600 text-xs mb-0.5">Formato requerido</p>
                <span className="inline-block bg-gray-800 border border-gray-700 text-gray-300 text-xs px-2.5 py-1 rounded-lg font-mono">{step.acceptLabel}</span>
              </div>
            </div>

            <div className="px-6 py-5">
              {fileError && (
                <div className="mb-3 flex items-start gap-2 bg-red-950 border border-red-800 rounded-xl px-4 py-3">
                  <span className="text-red-400 text-lg shrink-0">⚠️</span>
                  <p className="text-red-300 text-sm">{fileError}</p>
                </div>
              )}
              {files[step.id] ? (
                <div className="flex items-center justify-between bg-green-950 border border-green-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-green-400 text-xl">✓</span>
                    <div>
                      <p className="text-green-400 font-medium text-sm">Archivo listo</p>
                      <p className="text-green-600 text-xs">{files[step.id].name}</p>
                    </div>
                  </div>
                  <label className="cursor-pointer text-gray-400 text-sm hover:text-white">
                    Cambiar
                    <input type="file" accept={step.accept} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  </label>
                </div>
              ) : (
                <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                  className={`relative rounded-xl border-2 border-dashed transition-all ${dragOver ? 'border-blue-400 bg-blue-950/30' : 'border-gray-700 hover:border-gray-500'}`}>
                  <label className="cursor-pointer block p-8 text-center">
                    <div className="text-4xl mb-3">{dragOver ? '📂' : '📎'}</div>
                    <p className="text-white font-medium mb-1">{dragOver ? 'Suelta el archivo aquí' : 'Arrastra tu archivo aquí'}</p>
                    <p className="text-gray-500 text-sm mb-3">o</p>
                    <span className="inline-block bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-4 py-2 rounded-lg transition">Buscar archivo</span>
                    <p className="text-gray-600 text-xs mt-3">Solo se acepta: <span className="text-gray-400 font-medium">{step.acceptLabel}</span></p>
                    <input type="file" accept={step.accept} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  </label>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-800 flex justify-between">
              <button onClick={goBack} disabled={currentStep === 0} className="text-gray-400 hover:text-white disabled:opacity-0 transition text-sm">← Anterior</button>
              <div className="flex gap-3">
                {!step.required && !files[step.id] && (
                  <button onClick={goNext} className="text-gray-500 hover:text-gray-300 text-sm transition">Omitir →</button>
                )}
                <button onClick={goNext} disabled={step.required && !files[step.id]}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                  {files[step.id] ? 'Continuar →' : step.required ? 'Archivo requerido' : 'Continuar →'}
                </button>
              </div>
            </div>
          </div>

        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-800">
              <h2 className="text-white font-bold text-lg">Resumen del reporte</h2>
              <p className="text-gray-500 text-sm mt-1">Semana: {week || 'No seleccionada'}</p>
            </div>
            <div className="divide-y divide-gray-800">
              {STEPS.map(s => (
                <div key={s.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{s.icon}</span>
                    <span className="text-gray-300 text-sm">{s.label}</span>
                    {s.required && <span className="text-red-400 text-xs">requerido</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {files[s.id] ? (
                      <><span className="text-gray-500 text-xs">{files[s.id].name}</span><span className="text-green-400 text-sm">✓</span></>
                    ) : (
                      <span className="text-gray-600 text-sm">— No subido</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-5 border-t border-gray-800">
              {status && (
                <div className={`mb-4 px-4 py-3 rounded-lg text-sm whitespace-pre-line ${
                  status.startsWith('✅') ? 'bg-green-950 border border-green-800 text-green-400' :
                  status.startsWith('⚠️') ? 'bg-yellow-950 border border-yellow-800 text-yellow-400' :
                  status.startsWith('❌') ? 'bg-red-950 border border-red-800 text-red-400' :
                  'bg-blue-950 border border-blue-800 text-blue-400'
                }`}>{status}</div>
              )}
              <div className="flex gap-3">
                <button onClick={goBack} className="text-gray-400 hover:text-white text-sm transition">← Regresar</button>
                <button onClick={handleProcess} disabled={uploading || !completedRequired || !week}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold py-3 rounded-xl transition">
                  {uploading ? 'Procesando...' : '🚀 Procesar reporte'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}