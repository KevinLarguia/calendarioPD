import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Closer, Config, EstadoEnvio, Reserva } from '@/lib/agendador/tipos'

export const ESTADOS_ENVIO: EstadoEnvio[] = ['pendiente', 'enviando', 'enviado', 'verificado', 'revisar', 'error']

export type DatosAdmin = {
  config: Config
  closers: Closer[]
  reservas: Reserva[]
  contadores: Record<EstadoEnvio, number>
  pruebas: number
}

export async function cargarDatosAdmin(filtro: EstadoEnvio | null, limite = 200): Promise<DatosAdmin> {
  const supabase = supabaseAdmin()

  let consulta = supabase.from('agendador_reservas').select('*').order('created_at', { ascending: false }).limit(limite)
  if (filtro) consulta = consulta.eq('estado_envio', filtro)

  const [config, closers, reservas, pruebas, ...conteos] = await Promise.all([
    supabase.from('agendador_config').select('*').eq('id', 1).single(),
    supabase.from('agendador_closers').select('*').order('orden').order('nombre'),
    consulta,
    supabase.from('agendador_reservas').select('id', { count: 'exact', head: true }).eq('es_prueba', true),
    ...ESTADOS_ENVIO.map((e) => supabase.from('agendador_reservas').select('id', { count: 'exact', head: true }).eq('estado_envio', e)),
  ])

  if (config.error) throw new Error(config.error.message)

  const contadores = Object.fromEntries(ESTADOS_ENVIO.map((e, i) => [e, conteos[i].count ?? 0])) as Record<EstadoEnvio, number>

  return {
    config: config.data as Config,
    closers: (closers.data ?? []) as Closer[],
    reservas: (reservas.data ?? []) as Reserva[],
    contadores,
    pruebas: pruebas.count ?? 0,
  }
}
