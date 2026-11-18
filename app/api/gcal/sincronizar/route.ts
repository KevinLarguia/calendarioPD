import { secretoCronValido } from '@/lib/agendador/cron'
import { json } from '@/lib/agendador/request'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'
import { integracionesActivas, sincronizarBloqueos, sincronizarEventos } from '@/lib/agendador/integraciones'
import type { Closer, Config } from '@/lib/agendador/tipos'

export const maxDuration = 60

/** Lo dispara pg_cron cada minuto: lee los bloques de Google Calendar y crea/borra los eventos de las reservas. */
export async function POST(req: Request) {
  if (!secretoCronValido(req.headers.get('x-cron-secret'))) {
    return json({ error: 'no autorizado' }, { status: 401 })
  }
  const t0 = Date.now()
  try {
    if (!integracionesActivas() || !env.googleConfigurado) {
      return json({ modo: env.modo, omitido: integracionesActivas() ? 'GOOGLE_SERVICE_ACCOUNT_JSON sin configurar' : 'AGENDADOR_MODO=test' })
    }
    const supabase = supabaseAdmin()
    const [{ data: config }, { data: closersData }] = await Promise.all([
      supabase.from('agendador_config').select('*').eq('id', 1).single(),
      supabase.from('agendador_closers').select('*'),
    ])
    if (!config) throw new Error('agendador_config sin fila')
    const closers = (closersData ?? []) as Closer[]

    const bloqueos = await sincronizarBloqueos(config as Config, closers)
    const eventos = await sincronizarEventos(config as Config, new Map(closers.map((c) => [c.nombre, c])))
    const resumen = { modo: env.modo, bloqueos, eventos, duracion_ms: Date.now() - t0 }
    console.log('[gcal]', JSON.stringify(resumen))
    return json(resumen)
  } catch (e) {
    console.error('[gcal] fallo', (e as Error).message)
    return json({ error: 'fallo al sincronizar' }, { status: 500 })
  }
}
