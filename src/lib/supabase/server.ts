// src/lib/supabase/server.ts
//
// Cliente Supabase para SERVER components, route handlers y server actions.
// Usa cookies() de Next 16 para leer la sesión que el browser client
// estableció — sujeto a RLS con el JWT del usuario logueado.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll desde un Server Component falla — esto es ok porque
            // el proxy.ts se encarga de refrescar las cookies en cada
            // request antes de que llegue el RSC.
          }
        },
      },
    }
  )
}
