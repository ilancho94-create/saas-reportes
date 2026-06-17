import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperadmin } from '@/lib/api-auth'

// Cliente con service_role: SOLO para auth.admin.createUser (Supabase Auth
// requiere service_role para crear usuarios). NO se usa para nada más.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    // Auth: solo superadmin (verificado contra el JWT, NO contra un body field).
    const auth = await requireSuperadmin(req)
    if (auth instanceof NextResponse) return auth

    const body = await req.json()
    const { email, password, organizationId, restaurantId, role } = body

    if (!email || !password || !restaurantId || !role) {
      return NextResponse.json({ error: 'email, password, restaurantId y role son requeridos' }, { status: 400 })
    }

    // Crear usuario en Supabase Auth (requiere service_role).
    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!newUser?.user?.id) return NextResponse.json({ error: 'No se pudo crear el usuario' }, { status: 500 })

    // Asignar al restaurante. Usamos service_role porque el usuario recién
    // creado todavía no existe en user_restaurants; el helper de auth del
    // request superadmin ya validó el permiso para hacer esto.
    const { error: insertError } = await supabaseAdmin.from('user_restaurants').insert({
      user_id: newUser.user.id,
      restaurant_id: restaurantId,
      organization_id: organizationId,
      role,
      active: true,
    })
    if (insertError) {
      // Rollback el usuario para no dejar cuentas huérfanas.
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, userId: newUser.user.id })
  } catch (e: any) {
    // No exponer stack traces al cliente.
    console.error('admin/create-user error:', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
