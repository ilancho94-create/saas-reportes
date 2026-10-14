// src/app/api/process-delete/route.ts
//
// Da de baja un reporte semanal entero: borra el reporte y TODAS sus
// filas asociadas en las tablas *_data y en costo_uso_adjustments.
//
// Importante: NO borra skipped_inventory_weeks (es independiente del
// reporte — una semana puede estar marcada como saltada sin tener un
// reporte asociado).
//
// Permisos: historial:delete (owner/admin por default).

import { NextRequest, NextResponse } from 'next/server'
import { requireRestaurantAccess } from '@/lib/api-auth'
import { can } from '@/lib/permissions'

// Orden de borrado: primero las sub-tablas (algunas FKs son ON DELETE
// CASCADE pero otras son NO ACTION; borrar explícitamente aquí evita
// depender de la configuración de cada constraint).
const CHILD_TABLES = [
  'sales_data',
  'labor_data',
  'cogs_data',
  'voids_data',
  'discounts_data',
  'waste_data',
  'inventory_data',
  'product_mix_data',
  'avt_data',
  'employee_performance_data',
  'kitchen_performance_data',
  'receiving_data',
  'costo_uso_adjustments',
] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const reportId: string | undefined = body?.reportId
    if (!reportId || typeof reportId !== 'string') {
      return NextResponse.json({ success: false, error: 'reportId requerido' }, { status: 400 })
    }

    // Autenticación: necesitamos el restaurant_id del reporte para
    // validar membresía. Primero traemos el reporte con el JWT del
    // usuario (RLS filtra si no tiene acceso).
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
    }

    // Usamos el cliente anon con el JWT; RLS devuelve null si no hay
    // acceso al restaurante del reporte.
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

    // Membresía activa en el restaurante del reporte + rol permiso delete.
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
    if (!can(role, 'historial', 'delete', customPerms)) {
      return NextResponse.json({ success: false, error: 'Sin permiso para dar de baja reportes' }, { status: 403 })
    }

    // Delete en cadena. Si alguno falla, lo propagamos — queda estado
    // parcial pero el error se refleja al usuario para reintentar.
    const results: Record<string, string | null> = {}
    for (const table of CHILD_TABLES) {
      const { error } = await auth.supabase.from(table).delete().eq('report_id', reportId)
      results[table] = error ? (error.message || 'error') : null
      if (error) {
        console.error(`delete ${table} error:`, error)
        return NextResponse.json({
          success: false,
          error: `No se pudo borrar ${table}`,
          partial: results,
        }, { status: 500 })
      }
    }

    const { error: delReportErr } = await auth.supabase
      .from('reports')
      .delete()
      .eq('id', reportId)
    if (delReportErr) {
      console.error('reports.delete error:', delReportErr)
      return NextResponse.json({
        success: false,
        error: 'No se pudo borrar el reporte',
        partial: results,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      reportId,
      week: report.week,
      deleted: results,
    })
  } catch (err: any) {
    console.error('process-delete route error:', err)
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 })
  }
}
