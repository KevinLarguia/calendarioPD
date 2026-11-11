import { reservaSchema } from '@/lib/agendador/schema'
import { verificarToken } from '@/lib/agendador/token'
import { normalizarTelefono } from '@/lib/agendador/telefono'
import { armarRespuestas } from '@/lib/agendador/preguntas'
import { hostDe, ipDe, json, userAgentDe } from '@/lib/agendador/request'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'
import type { ResultadoReserva } from '@/lib/agendador/tipos'

export const maxDuration = 30

const MENSAJE_TOKEN: Record<string, string> = {
  formato: 'El formulario venció. Recargá la página e intentá de nuevo.',
  firma: 'El formulario venció. Recargá la página e intentá de nuevo.',
  vencido: 'El formulario venció. Recargá la página e intentá de nuevo.',
  muy_rapido: 'Esperá unos segundos y volvé a enviar.',
}

export async function POST(req: Request) {
  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return json({ resultado: 'invalido', motivo: 'json' } satisfies ResultadoReserva, { status: 400 })
  }

  const parsed = reservaSchema.safeParse(cuerpo)
  if (!parsed.success) {
    const campos: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      campos[issue.path.join('.')] = issue.message
    }
    // El honeypot con contenido responde como si fuera válido para no dar pistas.
    if (campos.sitio_web) {
      return json({ resultado: 'ok', id: 'spam', inicio: '', fin: '', closer: '' } satisfies ResultadoReserva)
    }
    return json({ resultado: 'invalido', motivo: 'campos', campos } satisfies ResultadoReserva, { status: 422 })
  }

  const datos = parsed.data
  const token = verificarToken(datos.token)
  if (!token.ok) {
    return json(
      { resultado: 'invalido', motivo: 'token', campos: { token: MENSAJE_TOKEN[token.motivo] } } satisfies ResultadoReserva,
      { status: 422 },
    )
  }

  const telefono = normalizarTelefono(datos.telefono, datos.pais)
  if (!telefono) {
    return json(
      { resultado: 'invalido', motivo: 'campos', campos: { telefono: 'Revisá el número de teléfono' } } satisfies ResultadoReserva,
      { status: 422 },
    )
  }

  const inicio = new Date(datos.inicio)
  if (Number.isNaN(inicio.getTime())) {
    return json({ resultado: 'invalido', motivo: 'inicio' } satisfies ResultadoReserva, { status: 422 })
  }

  const respuestas = armarRespuestas({ ...datos.respuestas, telefono: telefono.internacional }, telefono.internacional)

  const { data, error } = await supabaseAdmin().rpc('agendador_reservar', {
    p_inicio: inicio.toISOString(),
    p_nombre: datos.nombre,
    p_email: datos.email,
    p_telefono_e164: telefono.e164,
    p_timezone: datos.timezone,
    p_respuestas: respuestas,
    p_ip: ipDe(req),
    p_user_agent: userAgentDe(req),
    p_host: hostDe(req),
    p_es_prueba: env.modo === 'test',
  })

  if (error) {
    console.error('[reservar] rpc', error.message)
    return json({ resultado: 'invalido', motivo: 'servidor' } satisfies ResultadoReserva, { status: 500 })
  }

  const resultado = data as ResultadoReserva
  const status = resultado.resultado === 'rate_limit' ? 429 : resultado.resultado === 'inactivo' ? 503 : 200
  return json(resultado, { status })
}
