import 'server-only'
import { env } from '@/lib/env'
import type { Reserva } from '@/lib/agendador/tipos'

export function enmascararEmail(email: string): string {
  const [usuario, dominio] = email.split('@')
  if (!dominio) return '***'
  return `${usuario.slice(0, 2)}***@${dominio}`
}

export function enmascararTelefono(tel: string): string {
  return `***${tel.slice(-4)}`
}

function horarioArgentina(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Aviso al canal de alertas. Nunca lanza: una falla de Discord no puede frenar la cola. */
export async function avisarDiscord(reserva: Reserva, estado: 'revisar' | 'error', motivo: string): Promise<void> {
  const url = env.discordWebhookUrl
  if (!url) return
  const titulo = estado === 'revisar' ? 'Reserva para REVISAR' : 'Reserva con ERROR'
  const contenido = [
    `**[Agendador] ${titulo}**`,
    `Lead: ${reserva.nombre} · ${enmascararEmail(reserva.email)} · ${enmascararTelefono(reserva.telefono_e164)}`,
    `Horario: ${horarioArgentina(reserva.inicio)} (ART) · Closer: ${reserva.closer}`,
    `Motivo: ${motivo}`,
    `Id: ${reserva.id}${reserva.es_prueba ? ' · PRUEBA' : ''}`,
  ].join('\n')
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: contenido.slice(0, 1900) }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
  } catch (e) {
    console.error('[discord]', (e as Error).message)
  }
}
