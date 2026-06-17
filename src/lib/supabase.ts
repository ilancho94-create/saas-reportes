// src/lib/supabase.ts
//
// Backward-compat shim. Las páginas client existentes importan `supabase`
// directo; este archivo expone una instancia singleton del browser client
// para que esos imports sigan funcionando sin tocar 23 archivos a la vez.
//
// Para código nuevo: importa createClient desde @/lib/supabase/client
// (browser) o @/lib/supabase/server (RSC + route handlers).

import { createClient } from './supabase/client'

export const supabase = createClient()
