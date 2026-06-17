// src/proxy.ts
//
// Next 16 reemplazó middleware.ts por proxy.ts. Esta función corre en cada
// request ANTES de que el route handler / RSC lo procese.
//
// Propósito: refrescar la sesión de Supabase si está cerca de expirar y
// re-escribir las cookies al response. Sin esto, los Server Components
// pueden ver una sesión expirada y redirigir a login innecesariamente.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // El llamado a getUser() refresca el access token si está expirado y
  // emite Set-Cookie en el response.
  await supabase.auth.getUser()

  return response
}

export const config = {
  // Aplica a todas las rutas excepto assets estáticos y rutas internas.
  matcher: [
    /*
     * Excluye:
     * - _next/static (build assets)
     * - _next/image (image optimization)
     * - favicon, manifest, sw, icons (public assets)
     * - Archivos con extensión (svg, png, jpg, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
