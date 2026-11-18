import 'server-only'
import { createSign } from 'node:crypto'
import { TZDate } from '@date-fns/tz'
import { env } from '@/lib/env'

/**
 * Cliente mínimo de Google Calendar con service account + domain-wide delegation (sin dependencias).
 * La service account se hace pasar (claim `sub`) por el closer, así lee y escribe en su calendario.
 * Scope necesario en la delegación del Workspace: https://www.googleapis.com/auth/calendar.events
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/calendar/v3'
const TIMEOUT_MS = 10_000

export class ErrorGoogle extends Error {
  constructor(
    mensaje: string,
    readonly status: number | null = null,
  ) {
    super(mensaje)
    this.name = 'ErrorGoogle'
  }
}

type CuentaServicio = { client_email: string; private_key: string }

let cuenta: CuentaServicio | null = null
const tokens = new Map<string, { token: string; venceMs: number }>()

function cuentaServicio(): CuentaServicio {
  if (cuenta) return cuenta
  const crudo = env.googleServiceAccountJson.trim()
  if (!crudo) throw new ErrorGoogle('Falta GOOGLE_SERVICE_ACCOUNT_JSON')
  let texto = crudo
  if (!crudo.startsWith('{')) {
    try {
      texto = Buffer.from(crudo, 'base64').toString('utf8')
    } catch {
      throw new ErrorGoogle('GOOGLE_SERVICE_ACCOUNT_JSON no es JSON ni base64')
    }
  }
  try {
    const j = JSON.parse(texto) as Partial<CuentaServicio>
    if (!j.client_email || !j.private_key) throw new Error('faltan client_email / private_key')
    cuenta = { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, '\n') }
    return cuenta
  } catch (e) {
    throw new ErrorGoogle(`GOOGLE_SERVICE_ACCOUNT_JSON inválido: ${(e as Error).message}`)
  }
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url')

/** JWT RS256 firmado por la service account, con `sub` = usuario a suplantar. Exportado para pruebas. */
export function firmarJwt(c: CuentaServicio, sub: string, ahoraSeg = Math.floor(Date.now() / 1000)): string {
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: c.client_email, sub, scope: SCOPE, aud: TOKEN_URL, iat: ahoraSeg, exp: ahoraSeg + 3600 }))
  const firma = createSign('RSA-SHA256').update(`${cabecera}.${claims}`).sign(c.private_key)
  return `${cabecera}.${claims}.${b64url(firma)}`
}

async function conTimeout(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  } catch (e) {
    throw new ErrorGoogle(`sin respuesta de Google: ${(e as Error).name}`)
  }
}

async function tokenPara(sub: string): Promise<string> {
  const guardado = tokens.get(sub)
  if (guardado && guardado.venceMs - 60_000 > Date.now()) return guardado.token
  const res = await conTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: firmarJwt(cuentaServicio(), sub) }),
  })
  const cuerpo = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !cuerpo.access_token) {
    // unauthorized_client = la delegación del Workspace no incluye el scope o el cliente; invalid_grant = el usuario no existe / es externo.
    throw new ErrorGoogle(`token para ${sub}: ${cuerpo.error ?? res.status} ${cuerpo.error_description ?? ''}`.trim(), res.status)
  }
  tokens.set(sub, { token: cuerpo.access_token, venceMs: Date.now() + (cuerpo.expires_in ?? 3600) * 1000 })
  return cuerpo.access_token
}

async function api(sub: string, ruta: string, init: RequestInit = {}, reintento = true): Promise<Response> {
  const token = await tokenPara(sub)
  const res = await conTimeout(`${API}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (res.status === 401 && reintento) {
    tokens.delete(sub)
    return api(sub, ruta, init, false)
  }
  return res
}

async function fallo(res: Response, accion: string): Promise<ErrorGoogle> {
  const texto = await res.text().catch(() => '')
  return new ErrorGoogle(`${accion}: HTTP ${res.status} ${texto.slice(0, 200)}`, res.status)
}

export type Bloque = { inicio: string; fin: string; gcal_event_id: string; titulo: string }

type EventoGoogle = {
  id: string
  status?: string
  summary?: string
  eventType?: string
  transparency?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: { self?: boolean; responseStatus?: string }[]
  extendedProperties?: { private?: Record<string, string> }
}

function aInstante(v: { date?: string; dateTime?: string } | undefined, zona: string): Date | null {
  if (!v) return null
  if (v.dateTime) return new Date(v.dateTime)
  if (v.date) {
    const [a, m, d] = v.date.split('-').map(Number)
    return new Date(new TZDate(a, m - 1, d, 0, 0, 0, zona).getTime())
  }
  return null
}

/** ¿Este evento ocupa al closer? Libre / rechazado / cancelado / lugar de trabajo / evento propio del agendador no cuentan. */
export function eventoOcupa(e: EventoGoogle): boolean {
  if (e.status === 'cancelled') return false
  if (e.transparency === 'transparent') return false
  if (e.eventType === 'workingLocation' || e.eventType === 'birthday') return false
  if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return false
  if (e.extendedProperties?.private?.agendador_reserva_id) return false
  return true
}

/** Bloques ocupados del calendario `calendarId` (vista de `sub`) entre desde y hasta. Eventos recurrentes expandidos. */
export async function listarBloques(sub: string, calendarId: string, desde: Date, hasta: Date, zona: string): Promise<Bloque[]> {
  const bloques: Bloque[] = []
  let pagina: string | undefined
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({
      timeMin: desde.toISOString(),
      timeMax: hasta.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      showDeleted: 'false',
      fields: 'nextPageToken,items(id,status,summary,eventType,transparency,start,end,attendees(self,responseStatus),extendedProperties/private)',
    })
    if (pagina) q.set('pageToken', pagina)
    const res = await api(sub, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`)
    if (!res.ok) throw await fallo(res, `listar eventos de ${calendarId}`)
    const cuerpo = (await res.json()) as { items?: EventoGoogle[]; nextPageToken?: string }
    for (const e of cuerpo.items ?? []) {
      if (!eventoOcupa(e)) continue
      const ini = aInstante(e.start, zona)
      const fin = aInstante(e.end, zona)
      if (!ini || !fin || fin <= ini) continue
      bloques.push({ inicio: ini.toISOString(), fin: fin.toISOString(), gcal_event_id: e.id, titulo: e.summary ?? '' })
    }
    pagina = cuerpo.nextPageToken
    if (!pagina) break
  }
  return bloques
}

export type NuevoEvento = {
  id: string
  titulo: string
  descripcion: string
  ubicacion: string | null
  inicio: Date
  fin: Date
  zona: string
  reservaId: string
}

/** Crea el evento en el calendario del closer. Id determinístico: repetirlo no duplica (409 = ya estaba). */
export async function crearEvento(sub: string, calendarId: string, ev: NuevoEvento): Promise<{ id: string; yaExistia: boolean }> {
  const res = await api(sub, `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, {
    method: 'POST',
    body: JSON.stringify({
      id: ev.id,
      summary: ev.titulo,
      description: ev.descripcion,
      location: ev.ubicacion ?? undefined,
      start: { dateTime: ev.inicio.toISOString(), timeZone: ev.zona },
      end: { dateTime: ev.fin.toISOString(), timeZone: ev.zona },
      transparency: 'opaque',
      extendedProperties: { private: { agendador_reserva_id: ev.reservaId } },
    }),
  })
  if (res.status === 409) return { id: ev.id, yaExistia: true }
  if (!res.ok) throw await fallo(res, 'crear evento')
  const cuerpo = (await res.json()) as { id: string }
  return { id: cuerpo.id, yaExistia: false }
}

/** Borra el evento. 404 / 410 (ya no existe) cuentan como éxito. */
export async function borrarEvento(sub: string, calendarId: string, eventId: string): Promise<void> {
  const res = await api(sub, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: 'DELETE' })
  if (res.ok || res.status === 404 || res.status === 410) return
  throw await fallo(res, 'borrar evento')
}

/** Id de evento de Google para una reserva: el uuid sin guiones (hex en minúscula, válido en base32hex). */
export const eventIdDeReserva = (reservaId: string) => reservaId.replace(/-/g, '').toLowerCase()
