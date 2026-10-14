// src/app/api/process-delete-file/route.ts
//
// Borra UN tipo de archivo de un reporte semanal, dejando los demás
// intactos. Útil cuando se subió un archivo erróneo (ej. Inventory
// Count Review de otra semana) y hay que quitarlo sin tocar los otros.
//
// Nota especial: product_mix y menu_analysis comparten UNA sola fila
// en product_mix_data (processProductMixDirect los combina al cargar).
// Borrar "product_mix" o "menu_analysis" elimina la fila entera; el
// cliente debe confirmar esto al usuario antes de llamar.
//
// Permisos: historial:edit (owner/admin por default; equivalente a
// "reemplazar" sin reinsertar).

import { NextRequest, NextResponse } from 'next/server'
import { requireRestaurantAccess } from '@/lib/api-auth'
import { can } from '@/lib/permissions'

// fileType → tabla(s). product_mix y menu_analysis → MISMA fila.
const FILE_TABLE_MAP: Record<string, string> = {
  sales: 'sales_data',
  labor: 'labor_data',
  cogs: 'cogs_data',
  voids: 'voids_data',
  discounts: 'discounts_data',
  waste: 'waste_data',
  inventory: 'inventory_data',
  avt: 'avt_data',
  product_mix: 'product_mix_data',
  menu_analysis: 'product_mix_data',
  receiving: 'receiving_data',
  employee_performance: 'employee_performance_data',
  kitchen_details: 'kitchen_performance_data',
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const reportId: string | undefined = body?.reportId
    const fileType: string | undefined = body?.fileType
    if (!reportId || typeof reportId !== 'string') {
      return NextResponse.json({ success: false, error: 'reportId requerido' }, { status: 400 })
    }
    if (!fileType || typeof fileType !== 'string' || !(fileType in FILE_TABLE_MAP)) {
      return NextResponse.json({ success: false, error: 'fileType inválido' }, { status: 400 })
    }
    const table = FILE_TABLE_MAP[fileType]

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const token = authHeader.slice('Bearer '.length).trim()
    const probe = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
    const { data: report, error: lookupErr } = await probe
      .from('reports')
      .select('id, restaurant_id, week')
      .eq('id', reportId)
      .maybeSingle()
    if (lookupErr) {
      console.error('reports.select error:', lookupErr)
      return NextResponse.json({ success: false, error: 'No se pudo verificar el reporte' }, { status: 500 })
    }
    if (!report) {
      return NextResponse.json({ success: false, error: 'Reporte no encontrado' }, { status: 404 })
    }

    const auth = await requireRestaurantAccess(request, report.restaurant_id as string)
    if (auth instanceof NextResponse) return auth

    const { data: ur, error: urErr } = await auth.supabase
      .from('user_restaurants')
      .select('role, custom_permissions')
      .eq('user_id', auth.userId)
      .eq('restaurant_id', report.restaurant_id as string)
      .eq('active', true)
      .maybeSingle()
    if (urErr) {
      console.error('user_restaurants.select error:', urErr)
      return NextResponse.json({ success: false, error: 'No se pudo verificar permisos' }, { status: 500 })
    }
    const role = (ur as any)?.role || ''
    const customPerms = (ur as any)?.custom_permissions || undefined
    if (!can(role, 'historial', 'edit', customPerms)) {
      return NextResponse.json({ success: false, error: 'Sin permiso para editar reportes' }, { status: 403 })
    }

    const { error: delErr } = await auth.supabase.from(table).delete().eq('report_id', reportId)
    if (delErr) {
      console.error(`delete ${table} error:`, delErr)
      return NextResponse.json({
        success: false,
        error: 'No se pudo borrar ' + fileType,
        detail: delErr.message || null,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      reportId,
      fileType,
      table,
      week: report.week,
      // Aviso al cliente: product_mix y menu_analysis comparten fila.
      sharedTableNote: (fileType === 'product_mix' || fileType === 'menu_analysis')
        ? 'product_mix y menu_analysis comparten la misma fila: al borrar uno, se borra el otro.'
        : null,
    })
  } catch (err: any) {
    console.error('process-delete-file route error:', err)
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 })
  }
}
