// Loading UI mostrado por Next mientras el segment carga.
// Aplica como Suspense boundary del dashboard layout.

export default function DashboardLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-sm">Cargando...</p>
      </div>
    </div>
  )
}
