import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

let cliente: SupabaseClient | null = null

/** Cliente con service role. Solo en el servidor: nunca importar desde componentes cliente. */
export function supabaseAdmin(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(env.supabaseUrl, env.supabaseServiceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return cliente
}
