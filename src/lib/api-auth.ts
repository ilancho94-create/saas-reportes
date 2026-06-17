// src/lib/api-auth.ts
//
// Helpers de autenticación y autorización para route handlers en /api/.
//
// Patrón: cada handler debe llamar requireAuth() / requireRestaurantAccess() /
// requireSuperadmin() al inicio. Retornan o un objeto con supabase + userId,
// o un NextResponse de error que el handler debe propagar.
//
// Importante: el cliente devuelto está enlazado al JWT del usuario, por lo
// que las queries siguen sujetas a RLS — defensa en profundidad.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export type AuthedContext = {
  supabase: SupabaseClient
  userId: string
  userEmail: string | null | undefined
}

function clientWithJwt(jwt: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

/**
 * Verifica que el request traiga un JWT válido en Authorization: Bearer <token>.
 * Devuelve el contexto con un cliente Supabase autenticado, o un 401.
 */
export async function requireAuth(req: NextRequest): Promise<AuthedContext | NextResponse> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    return NextResponse.json({ error: 'Token vacío' }, { status: 401 })
  }
  const supabase = clientWithJwt(token)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }
  return { supabase, userId: data.user.id, userEmail: data.user.email }
}

/**
 * Verifica auth + que el usuario tenga membresía activa en el restaurante dado.
 */
export async function requireRestaurantAccess(
  req: NextRequest,
  restaurantId: string,
): Promise<AuthedContext | NextResponse> {
  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurant_id requerido' }, { status: 400 })
  }
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const { data, error } = await auth.supabase
    .from('user_restaurants')
    .select('role, active')
    .eq('user_id', auth.userId)
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Sin acceso a este restaurante' }, { status: 403 })
  }
  return auth
}

/**
 * Verifica auth + que el usuario sea superadmin.
 */
export async function requireSuperadmin(
  req: NextRequest,
): Promise<AuthedContext | NextResponse> {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const { data, error } = await auth.supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', auth.userId)
    .maybeSingle()

  if (error || !data?.is_superadmin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return auth
}
