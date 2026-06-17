// src/lib/supabase/client.ts
//
// Cliente Supabase para CLIENT components (browser).
// Reemplaza el viejo createClient de @supabase/supabase-js — la diferencia
// clave es que las sesiones se persisten en cookies (no localStorage),
// permitiendo que Server Components y proxy.ts las lean.
//
// Migración: usuarios con sesión vieja en localStorage tendrán que
// loguearse una vez después del primer deploy. Las nuevas sesiones se
// guardan en cookies httpOnly desde el primer signIn.

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
