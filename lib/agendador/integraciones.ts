import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'
import { avisarDiscordTexto } from '@/lib/agendador/discord'
import { borrarEvento, crearEvento, eventIdDeReserva, listarBloques } from '@/lib/integraciones/google'
import { borrarReunion, crearReunion } from '@/lib/integraciones/zoom'
import type { Closer, Config, Reserva } from '@/lib/agendador/tipos'

const MAX_INTENTOS_GCAL = 5
const MAX_EVENTOS_POR_CORRIDA = 40
const REALERTA_MIN = 30
/** Margen hacia adelante del sync de bloques sobre dias_adelante, para cubrir el último día completo. */
const DIAS_EXTRA_SYNC = 2

export const integracionesActivas = () => env.modo === 'prod'

const calendarioDe = (c: Closer) => (c.gcal_calendar_id?.trim() || c.email?.trim() || null)
const emailGoogleDe = (c: Closer) => c.email?.trim() || null
const usuarioZoomDe = (c: Closer) => (c.zoom_user?.trim() || c.email?.trim() || null)

async function guardar(id: string, cambios: Record<string, unknown>) {
  const { error } = await supabaseAdmin()
    .from('agendador_reservas')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[integraciones] update', id, error.message)
}

// ───────────────────────────── Zoom ─────────────────────────────

/**
 * Asegura una reunión de Zoom propia para la reserva y devuelve el link a usar.
 * Nunca lanza ni frena el envío: si Zoom falla, devuelve null y el payload usa el zoom_link fijo del closer.
 * Idempotente: si la reserva ya tiene zoom_join_url (p. ej. un reenvío manual) no crea otra.
 */
export async function asegurarZoom(reserva: Reserva, closer: Closer | null, config: Config): Promise<string | null> {
  if (reserva.zoom_join_url) return reserva.zoom_join_url
  if (!integracionesActivas() || !env.zoomConfigurado) return null

  const host = closer ? usuarioZoomDe(closer) : null
  if (!host) {
    await guardar(reserva.id, { zoom_error: 'el closer no tiene email / usuario de Zoom' })
    return null
  }
  try {
    const r = await crearReunion({
      host,
      tema: `${config.evento_nombre} · ${reserva.nombre}`,
      inicio: new Date(reserva.inicio),
      duracionMin: config.duracion_min,
      zona: config.zona,
      agenda: `Lead: ${reserva.nombre}`,
    })
    reserva.zoom_meeting_id = r.id
    reserva.zoom_join_url = r.join_url
    await guardar(reserva.id, { zoom_meeting_id: r.id, zoom_join_url: r.join_url, zoom_error: null })
    return r.join_url
  } catch (e) {
    const detalle = (e as Error).message
    await guardar(reserva.id, { zoom_error: detalle.slice(0, 300) })
    await avisarDiscordTexto('Zoom: no se pudo crear la reunión', `Reserva ${reserva.id} · closer ${reserva.closer}\nSe envía con el link fijo del closer.\n${detalle}`)
    return null
  }
}

// ───────────────────────── Google Calendar ─────────────────────────

function descripcionEvento(reserva: Reserva, link: string | null): string {
  const lineas = [
    `Lead: ${reserva.nombre}`,
    `Email: ${reserva.email}`,
    `Teléfono: ${reserva.telefono_e164}`,
    link ? `Zoom: ${link}` : 'Zoom: (sin link)',
  ]
  const respuestas = reserva.respuestas.filter((r) => r.answer?.trim())
  if (respuestas.length) {
    lineas.push('', ...respuestas.sort((a, b) => a.position - b.position).map((r) => `${r.question}\n→ ${r.answer}`))
  }
  lineas.push('', `Reserva del agendador: ${reserva.id}`)
  return lineas.join('\n')
}

/** Crea los eventos pendientes en el calendario de cada closer y borra los de las reservas canceladas. */
export async function sincronizarEventos(config: Config, closers: Map<string, Closer>) {
  const resumen = { creados: 0, borrados: 0, errores: 0 }
  if (!integracionesActivas() || !env.googleConfigurado) return resumen
  const supabase = supabaseAdmin()

  // Reservas ya salidas de la cola de envío (el link de Zoom se define antes de enviar) y todavía sin evento.
  const { data: pendientes, error } = await supabase
    .from('agendador_reservas')
    .select('*')
    .eq('estado', 'activa')
    .eq('es_prueba', false)
    .is('gcal_event_id', null)
    .lt('gcal_intentos', MAX_INTENTOS_GCAL)
    .not('estado_envio', 'in', '(pendiente,enviando)')
    .gt('fin', new Date().toISOString())
    .order('created_at')
    .limit(MAX_EVENTOS_POR_CORRIDA)
  if (error) {
    console.error('[gcal] pendientes', error.message)
    return resumen
  }

  for (const r of (pendientes ?? []) as Reserva[]) {
    const closer = closers.get(r.closer)
    const sub = closer ? emailGoogleDe(closer) : null
    const cal = closer ? calendarioDe(closer) : null
    if (!closer || !sub || !cal) {
      await guardar(r.id, { gcal_error: 'el closer no tiene email / calendario', gcal_intentos: MAX_INTENTOS_GCAL })
      resumen.errores++
      continue
    }
    const link = r.zoom_join_url || closer.zoom_link
    try {
      const ev = await crearEvento(sub, cal, {
        id: eventIdDeReserva(r.id),
        titulo: `${config.evento_nombre} · ${r.nombre}`,
        descripcion: descripcionEvento(r, link),
        ubicacion: link,
        inicio: new Date(r.inicio),
        fin: new Date(r.fin),
        zona: config.zona,
        reservaId: r.id,
      })
      await guardar(r.id, { gcal_event_id: ev.id, gcal_synced_at: new Date().toISOString(), gcal_error: null })
      resumen.creados++
    } catch (e) {
      const intentos = r.gcal_intentos + 1
      const detalle = (e as Error).message.slice(0, 300)
      await guardar(r.id, { gcal_error: detalle, gcal_intentos: intentos })
      resumen.errores++
      if (intentos >= MAX_INTENTOS_GCAL) {
        await avisarDiscordTexto('Google Calendar: no se pudo crear el evento', `Reserva ${r.id} · closer ${r.closer}\nSe rindió tras ${intentos} intentos.\n${detalle}`)
      }
    }
  }

  // Canceladas: sacar el evento (y la reunión de Zoom) para que el horario quede libre y sin links vivos.
  const { data: canceladas } = await supabase
    .from('agendador_reservas')
    .select('*')
    .eq('estado', 'cancelada')
    .or('gcal_event_id.not.is.null,zoom_meeting_id.not.is.null')
    .limit(MAX_EVENTOS_POR_CORRIDA)
  for (const r of (canceladas ?? []) as Reserva[]) {
    const closer = closers.get(r.closer)
    try {
      if (r.gcal_event_id) {
        const sub = closer ? emailGoogleDe(closer) : null
        const cal = closer ? calendarioDe(closer) : null
        if (sub && cal) await borrarEvento(sub, cal, r.gcal_event_id)
        await guardar(r.id, { gcal_event_id: null, gcal_error: null })
      }
      if (r.zoom_meeting_id && env.zoomConfigurado) {
        await borrarReunion(r.zoom_meeting_id)
        await guardar(r.id, { zoom_meeting_id: null, zoom_join_url: null })
      }
      resumen.borrados++
    } catch (e) {
      resumen.errores++
      console.error('[gcal] limpiar cancelada', r.id, (e as Error).message)
    }
  }

  return resumen
}

/**
 * Copia a agendador_bloqueos_gcal lo que el pre call tiene ocupado en el calendario de cada closer activo.
 * Si un closer falla, sus bloques anteriores se conservan (más seguro que liberar horarios por un error de red)
 * y se avisa a Discord (como mucho cada 30 min por closer).
 */
export async function sincronizarBloqueos(config: Config, closers: Closer[]) {
  const resumen = { closers_ok: 0, closers_error: 0, bloques: 0 }
  if (!integracionesActivas() || !env.googleConfigurado) return resumen
  const supabase = supabaseAdmin()

  const ahora = Date.now()
  const desde = new Date(ahora - config.duracion_min * 60_000)
  const hasta = new Date(ahora + (config.dias_adelante + DIAS_EXTRA_SYNC) * 86_400_000)

  await Promise.all(
    closers
      .filter((c) => c.activo)
      .map(async (c) => {
        const sub = emailGoogleDe(c)
        const cal = calendarioDe(c)
        try {
          if (!sub || !cal) throw new Error('el closer no tiene email / calendario')
          const bloques = await listarBloques(sub, cal, desde, hasta, config.zona)
          const { data, error } = await supabase.rpc('agendador_reemplazar_bloqueos', {
            p_closer: c.nombre,
            p_desde: desde.toISOString(),
            p_hasta: hasta.toISOString(),
            p_bloques: bloques,
          })
          if (error) throw new Error(`agendador_reemplazar_bloqueos: ${error.message}`)
          resumen.closers_ok++
          resumen.bloques += Number(data ?? bloques.length)
        } catch (e) {
          resumen.closers_error++
          const detalle = (e as Error).message.slice(0, 300)
          console.error('[gcal] sync', c.nombre, detalle)
          await registrarFalloSync(c.nombre, detalle)
        }
      }),
  )
  return resumen
}

async function registrarFalloSync(closer: string, detalle: string) {
  const supabase = supabaseAdmin()
  const { data: previo } = await supabase.from('agendador_gcal_sync').select('alertado_at').eq('closer', closer).maybeSingle()
  const alertadoMs = previo?.alertado_at ? new Date(previo.alertado_at as string).getTime() : 0
  const alertar = Date.now() - alertadoMs > REALERTA_MIN * 60_000

  await supabase.from('agendador_gcal_sync').upsert(
    {
      closer,
      ultimo_intento_at: new Date().toISOString(),
      ultimo_error: detalle,
      ...(alertar ? { alertado_at: new Date().toISOString() } : {}),
    },
    { onConflict: 'closer' },
  )
  if (alertar) {
    await avisarDiscordTexto('Google Calendar: falla el sync de un closer', `${closer}: ${detalle}\nLos horarios que bloquee el pre call no se reflejan hasta que se arregle (se conservan los últimos bloques leídos).`)
  }
}
