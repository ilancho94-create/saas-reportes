import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { email, password, organizationId, restaurantId, role, requesterId } = await req.json()

    // Verificar superadmin
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('is_superadmin').eq('id', requesterId).single()
    if (!profile?.is_superadmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Crear usuario en Supabase Auth
    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Asignar al restaurante con el rol
    await supabaseAdmin.from('user_restaurants').insert({
      user_id: newUser.user.id,
      restaurant_id: restaurantId,
      organization_id: organizationId,
      role,
      active: true,
    })

    return NextResponse.json({ success: true, userId: newUser.user.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}