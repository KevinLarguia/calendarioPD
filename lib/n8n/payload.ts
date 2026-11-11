import type { Closer, Config, Reserva } from '@/lib/agendador/tipos'

/** ISO UTC con 6 decimales, como lo manda Calendly: 2026-11-11T03:43:55.000000Z */
export function isoCalendly(valor: string | Date): string {
  const d = typeof valor === 'string' ? new Date(valor) : valor
  return d.toISOString().replace(/\.(\d{3})Z$/, '.$1000Z')
}

export function slugDe(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Host del deploy a partir del invitee_uri guardado (https://{host}/backup/invitees/{id}). */
export function hostDesdeInviteeUri(inviteeUri: string): string {
  try {
    return new URL(inviteeUri).host
  } catch {
    return 'localhost'
  }
}

export type PayloadCalendly = ReturnType<typeof armarPayloadCalendly>

/**
 * Reproduce exactamente la forma del webhook `invitee.created` de Calendly que hoy recibe n8n.
 * Campos que n8n lee: event, payload.old_invitee (null), payload.uri, name, email, text_reminder_number (null),
 * questions_and_answers, scheduled_event.start_time/end_time/name/event_memberships/location, tracking.utm_source.
 */
export function armarPayloadCalendly(reserva: Reserva, closer: Closer | null, config: Pick<Config, 'evento_nombre' | 'utm_source'>) {
  const host = hostDesdeInviteeUri(reserva.invitee_uri)
  const base = `https://${host}/backup`
  const creado = isoCalendly(reserva.created_at)
  const zoom = closer?.zoom_link?.trim() || null
  const location = zoom ? { type: 'custom', location: zoom, join_url: zoom } : { type: 'custom', location: null }

  return {
    created_at: isoCalendly(new Date()),
    created_by: `${base}/users/agendador`,
    event: 'invitee.created',
    payload: {
      cancel_url: `${base}/cancellations/${reserva.id}`,
      created_at: creado,
      email: reserva.email.trim().toLowerCase(),
      event: `${base}/scheduled_events/${reserva.id}`,
      first_name: null,
      invitee_scheduled_by: null,
      last_name: null,
      name: reserva.nombre.trim(),
      new_invitee: null,
      no_show: null,
      old_invitee: null,
      payment: null,
      questions_and_answers: reserva.respuestas.map((r) => ({ answer: r.answer, position: r.position, question: r.question })),
      reconfirmation: null,
      reschedule_url: `${base}/reschedulings/${reserva.id}`,
      rescheduled: false,
      routing_form_submission: null,
      scheduled_event: {
        created_at: creado,
        end_time: isoCalendly(reserva.fin),
        event_guests: [],
        event_memberships: [
          {
            user: `${base}/users/${slugDe(reserva.closer)}`,
            user_email: closer?.email ?? null,
            user_name: reserva.closer,
          },
        ],
        event_type: `${base}/event_types/llamada-admision`,
        invitees_counter: { total: 1, active: 1, limit: 1 },
        location,
        meeting_notes_html: null,
        meeting_notes_plain: null,
        name: config.evento_nombre,
        start_time: isoCalendly(reserva.inicio),
        status: 'active',
        updated_at: creado,
        uri: `${base}/scheduled_events/${reserva.id}`,
      },
      scheduling_method: null,
      status: 'active',
      text_reminder_number: null,
      timezone: reserva.timezone_lead ?? 'America/Argentina/Buenos_Aires',
      tracking: {
        utm_campaign: null,
        utm_source: config.utm_source,
        utm_medium: null,
        utm_content: null,
        utm_term: null,
        salesforce_uuid: null,
      },
      updated_at: creado,
      uri: reserva.invitee_uri,
    },
  }
}
