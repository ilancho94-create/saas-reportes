// Ruta de sandbox de pruebas visuales gateada por NODE_ENV=development.
// En producción devuelve notFound() sin ejecutar ninguna lógica de negocio.
// No expone datos reales, no requiere sesión Supabase, no crea rutas
// públicas de diagnóstico. Su único propósito es habilitar Playwright
// contra los componentes reales con fixtures deterministas.

import { notFound } from 'next/navigation'
import { getScenario, SCENARIO_NAMES } from '@/lib/costo-uso/__fixtures__/scenarios'
import SandboxClient from './SandboxClient'

export const dynamic = 'force-dynamic'

export default async function SandboxScenarioPage({
  params,
}: {
  params: Promise<{ scenario: string }>
}) {
  // Gate estricto: fuera de development, no existe.
  if (process.env.NODE_ENV !== 'development') notFound()

  const { scenario } = await params
  const data = getScenario(scenario)
  if (!data) notFound()

  return <SandboxClient scenario={scenario} available={SCENARIO_NAMES as unknown as string[]} data={data} />
}
