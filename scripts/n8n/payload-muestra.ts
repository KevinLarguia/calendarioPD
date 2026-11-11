// Imprime el payload que se mandaría a n8n para la última reserva, y lo compara con la plantilla real
// (misma forma: mismas claves, en todos los niveles).
// Uso: pnpm exec tsx scripts/n8n/payload-muestra.ts
import { armarPayloadCalendly } from '../../lib/n8n/payload'
import type { Reserva, Closer } from '../../lib/agendador/tipos'

const reserva: Reserva = {
  id: 'b397c713-345e-4a3e-8ad1-775e98c66dfa',
  invitee_uri: 'https://agendador.ejemplo.io/backup/invitees/b397c713-345e-4a3e-8ad1-775e98c66dfa',
  closer: 'Luciano Medina',
  inicio: '2026-11-11T14:00:00.000Z',
  fin: '2026-11-11T15:00:00.000Z',
  timezone_lead: 'Europe/Berlin',
  nombre: 'Nombre Apellido',
  email: 'lead@ejemplo.com',
  telefono_e164: '+5493410000000',
  respuestas: [
    { answer: '@usuario', position: 0, question: 'Instagram' },
    { answer: '+54 9 341 000 0000', position: 1, question: 'Numero de telefono' },
    { answer: 'Estudio marketing', position: 2, question: '¿A qué te dedicás hoy?' },
    { answer: 'No tengo ingresos', position: 3, question: ' ¿Cuánto estás ganando por mes hoy?' },
    { answer: 'Todavía no sé cuándo resolverlo', position: 4, question: '¿Qué tan pronto querés resolver los obstáculos que hoy te impiden alcanzar tu meta de ingresos?' },
    { answer: 'Tengo menos de $500 USD (ahora no puedo conseguir)', position: 5, question: '¿Cuánto dinero tenés disponible para invertir en aprender a vender Productos Digitales y generar $3.000 USD al mes haciéndolo?' },
    { answer: 'Sí, tengo que decidirlo con un familiar o amigo', position: 6, question: '¿Existe alguien más que deba estar presente para tomar la decisión de hacerlo?' },
  ],
  ip: null,
  user_agent: null,
  estado: 'activa',
  estado_envio: 'pendiente',
  intentos: 0,
  enviado_at: null,
  verificado_at: null,
  ultimo_error: null,
  es_prueba: false,
  created_at: '2026-11-11T03:43:54.732Z',
  updated_at: '2026-11-11T03:43:54.732Z',
}

const closer: Closer = {
  id: 'x',
  nombre: 'Luciano Medina',
  email: 'lucianom@productosdigitales.io',
  zoom_link: null,
  aliases: [],
  activo: true,
  orden: 6,
}

const plantilla = {
  created_at: '', created_by: '', event: '',
  payload: {
    cancel_url: '', created_at: '', email: '', event: '', first_name: null, invitee_scheduled_by: null, last_name: null,
    name: '', new_invitee: null, no_show: null, old_invitee: null, payment: null, questions_and_answers: [],
    reconfirmation: null, reschedule_url: '', rescheduled: false, routing_form_submission: null,
    scheduled_event: {
      created_at: '', end_time: '', event_guests: [], event_memberships: [{ user: '', user_email: '', user_name: '' }],
      event_type: '', invitees_counter: { total: 1, active: 1, limit: 1 }, location: { location: null, type: 'custom' },
      meeting_notes_html: null, meeting_notes_plain: null, name: '', start_time: '', status: 'active', updated_at: '', uri: '',
    },
    scheduling_method: null, status: 'active', text_reminder_number: null, timezone: '',
    tracking: { utm_campaign: null, utm_source: '', utm_medium: null, utm_content: null, utm_term: null, salesforce_uuid: null },
    updated_at: '', uri: '',
  },
}

function claves(o: unknown, prefijo = ''): string[] {
  if (Array.isArray(o)) return o.length ? claves(o[0], `${prefijo}[]`) : []
  if (o && typeof o === 'object') {
    return Object.keys(o).flatMap((k) => [`${prefijo}${k}`, ...claves((o as Record<string, unknown>)[k], `${prefijo}${k}.`)])
  }
  return []
}

const payload = armarPayloadCalendly(reserva, closer, {
  evento_nombre: 'Llamada de Admisión | ProductosDigitales.io',
  utm_source: 'webinar-11-11',
})
console.log(JSON.stringify(payload, null, 2))

const esperadas = new Set(claves(plantilla))
const obtenidas = new Set(claves(payload))
const faltan = [...esperadas].filter((k) => !obtenidas.has(k))
const sobran = [...obtenidas].filter((k) => !esperadas.has(k))
console.log('\nClaves que faltan:', faltan)
console.log('Claves que sobran:', sobran)
console.log('Fechas con 6 decimales:', /\.\d{6}Z$/.test(payload.payload.scheduled_event.start_time))
