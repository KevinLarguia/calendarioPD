import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'
import { armarPayloadCalendly } from '@/lib/n8n/payload'
import { enviarAN8n } from '@/lib/n8n/enviar'
import { avisarDiscord } from '@/lib/agendador/discord'
import type { Closer, Config, Reserva } from '@/lib/agendador/tipos'

const MAX_INTENTOS_CONEXION = 3
const MINUTOS_PARA_VERIFICAR = 3
const MINUTOS_ENVIANDO_COLGADO = 5
// Los envíos se reparten en 40 s para que la corrida (con verificación incluida) entre en maxDuration = 60.
const VENTANA_ENVIO_MS = 40_000
const MAX_VERIFICACIONES_POR_CORRIDA = 200

export type ResumenCola = {
  modo: 'test' | 'prod'
  tomadas: number
  enviadas: number
  reintentar: number
  revisar: number
  error: number
  verificadas: number
  no_verificadas: number
  colgadas: number
  duracion_ms: number
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function actualizar(id: string, cambios: Partial<Reserva> & { intentos?: number }) {
  const { error } = await supabaseAdmin()
    .from('agendador_reservas')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[cola] update', id, error.message)
}

async function marcarColgadas(): Promise<Reserva[]> {
  const limite = new Date(Date.now() - MINUTOS_ENVIANDO_COLGADO * 60_000).toISOString()
  const { data, error } = await supabaseAdmin()
    .from('agendador_reservas')
    .update({
      estado_envio: 'revisar',
      ultimo_error: `quedó en enviando más de ${MINUTOS_ENVIANDO_COLGADO} min`,
      updated_at: new Date().toISOString(),
    })
    .eq('estado_envio', 'enviando')
    .lt('updated_at', limite)
    .select('*')
  if (error) {
    console.error('[cola] colgadas', error.message)
    return []
  }
  return (data ?? []) as Reserva[]
}

async function enviarUna(reserva: Reserva, closers: Map<string, Closer>, config: Config, resumen: ResumenCola) {
  const intentos = reserva.intentos + 1

  if (env.modo === 'test') {
    await actualizar(reserva.id, {
      estado_envio: 'verificado',
      intentos,
      enviado_at: new Date().toISOString(),
      verificado_at: new Date().toISOString(),
      es_prueba: true,
      ultimo_error: null,
    })
    resumen.enviadas++
    resumen.verificadas++
    return
  }

  const payload = armarPayloadCalendly(reserva, closers.get(reserva.closer) ?? null, config)
  const r = await enviarAN8n(payload)

  if (r.tipo === 'ok') {
    await actualizar(reserva.id, { estado_envio: 'enviado', intentos, enviado_at: new Date().toISOString(), ultimo_error: null })
    resumen.enviadas++
    return
  }

  if (r.tipo === 'conexion') {
    if (intentos >= MAX_INTENTOS_CONEXION) {
      await actualizar(reserva.id, { estado_envio: 'error', intentos, ultimo_error: `sin conexión (${r.detalle}) tras ${intentos} intentos` })
      resumen.error++
      await avisarDiscord(reserva, 'error', `No se pudo conectar con n8n: ${r.detalle}`)
    } else {
      await actualizar(reserva.id, { estado_envio: 'pendiente', intentos, ultimo_error: `sin conexión (${r.detalle})` })
      resumen.reintentar++
    }
    return
  }

  // Timeout, error de red a mitad de camino o respuesta no 2xx: pudo haber llegado. Nunca reenviar solo.
  const detalle = r.tipo === 'http' ? r.detalle : `respuesta ambigua: ${r.detalle}`
  await actualizar(reserva.id, { estado_envio: 'revisar', intentos, enviado_at: new Date().toISOString(), ultimo_error: detalle })
  resumen.revisar++
  await avisarDiscord(reserva, 'revisar', detalle)
}

async function verificarEnviadas(resumen: ResumenCola) {
  const supabase = supabaseAdmin()
  const limite = new Date(Date.now() - MINUTOS_PARA_VERIFICAR * 60_000).toISOString()
  const { data, error } = await supabase
    .from('agendador_reservas')
    .select('*')
    .eq('estado_envio', 'enviado')
    .lt('enviado_at', limite)
    .order('enviado_at')
    .limit(MAX_VERIFICACIONES_POR_CORRIDA)
  if (error) {
    console.error('[cola] verificar', error.message)
    return
  }
  const pendientes = (data ?? []) as Reserva[]
  if (pendientes.length === 0) return

  const uris = pendientes.map((r) => r.invitee_uri)
  const { data: encontradas, error: e2 } = await supabase
    .from('agendas_final')
    .select('calendly_invitee_uri')
    .eq('organization_id', 2)
    .in('calendly_invitee_uri', uris)
  if (e2) {
    console.error('[cola] agendas_final', e2.message)
    return
  }
  const presentes = new Set((encontradas ?? []).map((f) => f.calendly_invitee_uri as string))

  for (const r of pendientes) {
    if (presentes.has(r.invitee_uri)) {
      await actualizar(r.id, { estado_envio: 'verificado', verificado_at: new Date().toISOString() })
      resumen.verificadas++
    } else {
      const motivo = `n8n recibió la agenda pero no apareció en agendas_final en ${MINUTOS_PARA_VERIFICAR} min`
      await actualizar(r.id, { estado_envio: 'revisar', ultimo_error: motivo })
      resumen.no_verificadas++
      await avisarDiscord(r, 'revisar', motivo)
    }
  }
}

/** Una corrida de la cola (la dispara pg_cron cada minuto). */
export async function procesarCola(): Promise<ResumenCola> {
  const t0 = Date.now()
  const supabase = supabaseAdmin()
  const resumen: ResumenCola = {
    modo: env.modo,
    tomadas: 0,
    enviadas: 0,
    reintentar: 0,
    revisar: 0,
    error: 0,
    verificadas: 0,
    no_verificadas: 0,
    colgadas: 0,
    duracion_ms: 0,
  }

  const [{ data: config }, { data: closersData }] = await Promise.all([
    supabase.from('agendador_config').select('*').eq('id', 1).single(),
    supabase.from('agendador_closers').select('*'),
  ])
  if (!config) throw new Error('agendador_config sin fila')
  const closers = new Map((closersData ?? []).map((c) => [c.nombre as string, c as Closer]))

  const colgadas = await marcarColgadas()
  resumen.colgadas = colgadas.length
  for (const r of colgadas) await avisarDiscord(r, 'revisar', r.ultimo_error ?? 'enviando colgado')

  const { data: lote, error } = await supabase.rpc('agendador_tomar_lote', { p_n: config.envios_por_minuto })
  if (error) throw new Error(`agendador_tomar_lote: ${error.message}`)
  const reservas = (lote ?? []) as Reserva[]
  resumen.tomadas = reservas.length

  const espacio = reservas.length > 1 && env.modo === 'prod' ? Math.floor(VENTANA_ENVIO_MS / reservas.length) : 0
  for (let i = 0; i < reservas.length; i++) {
    if (i > 0 && espacio > 0) await dormir(espacio)
    await enviarUna(reservas[i], closers, config as Config, resumen)
  }

  await verificarEnviadas(resumen)

  resumen.duracion_ms = Date.now() - t0
  return resumen
}
