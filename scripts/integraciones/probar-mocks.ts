// Prueba los clientes de Google Calendar y Zoom contra un fetch simulado (sin credenciales ni red).
// Uso: pnpm exec tsx scripts/integraciones/probar-mocks.ts
import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import Module from 'node:module'

// Fuera de Next, `server-only` lanza al importarse: lo anulamos solo en este arnés.
const cargaOriginal = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load
;(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (req: unknown, ...resto: unknown[]) {
  if (req === 'server-only') return {}
  return cargaOriginal.call(this, req, ...resto)
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'agendador@proyecto.iam.gserviceaccount.com', private_key: privateKey })
process.env.ZOOM_ACCOUNT_ID = 'acc'
process.env.ZOOM_CLIENT_ID = 'cid'
process.env.ZOOM_CLIENT_SECRET = 'sec'

const llamadas: { url: string; metodo: string; cuerpo?: unknown; auth?: string }[] = []
let insertados = 0
const subsVistos: string[] = []

const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const metodo = init?.method ?? 'GET'
  const h = new Headers(init?.headers)
  const cuerpo = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : undefined
  llamadas.push({ url, metodo, cuerpo: cuerpo, auth: h.get('authorization') ?? undefined })

  if (url === 'https://oauth2.googleapis.com/token') {
    const assertion = new URLSearchParams(cuerpo).get('assertion')!
    const [c, p, f] = assertion.split('.')
    assert.ok(createVerify('RSA-SHA256').update(`${c}.${p}`).verify(publicKey, Buffer.from(f, 'base64url')), 'firma del JWT inválida')
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/calendar.events')
    assert.equal(claims.aud, 'https://oauth2.googleapis.com/token')
    subsVistos.push(claims.sub)
    return respuesta({ access_token: `tok-${claims.sub}`, expires_in: 3600 })
  }
  if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/') && url.includes('/events?') && metodo === 'GET') {
    assert.equal(h.get('authorization'), 'Bearer tok-lucianom@productosdigitales.io')
    if (url.includes('pageToken=p2')) {
      return respuesta({ items: [{ id: 'ev4', summary: 'Todo el día', start: { date: '2026-11-20' }, end: { date: '2026-11-21' } }] })
    }
    return respuesta({
      nextPageToken: 'p2',
      items: [
        { id: 'ev1', summary: 'Reunión interna', start: { dateTime: '2026-11-19T15:00:00-03:00' }, end: { dateTime: '2026-11-19T16:00:00-03:00' } },
        { id: 'ev2', summary: 'Libre', transparency: 'transparent', start: { dateTime: '2026-11-19T17:00:00-03:00' }, end: { dateTime: '2026-11-19T18:00:00-03:00' } },
        { id: 'ev3', summary: 'Rechazado', attendees: [{ self: true, responseStatus: 'declined' }], start: { dateTime: '2026-11-19T19:00:00-03:00' }, end: { dateTime: '2026-11-19T20:00:00-03:00' } },
        { id: 'ev5', summary: 'Cancelado', status: 'cancelled', start: { dateTime: '2026-11-19T21:00:00-03:00' }, end: { dateTime: '2026-11-19T22:00:00-03:00' } },
        { id: 'ev6', summary: 'Evento del agendador', extendedProperties: { private: { agendador_reserva_id: 'x' } }, start: { dateTime: '2026-11-19T12:00:00-03:00' }, end: { dateTime: '2026-11-19T13:00:00-03:00' } },
        { id: 'ev7', eventType: 'workingLocation', start: { date: '2026-11-19' }, end: { date: '2026-11-20' } },
      ],
    })
  }
  if (url.includes('/events?sendUpdates=none') && metodo === 'POST') {
    insertados++
    return insertados === 1 ? respuesta({ id: JSON.parse(cuerpo!).id }) : respuesta({ error: { message: 'duplicate' } }, 409)
  }
  if (url.includes('/events/') && metodo === 'DELETE') return new Response(null, { status: url.includes('noexiste') ? 404 : 204 })

  if (url.startsWith('https://zoom.us/oauth/token')) {
    assert.ok(url.includes('grant_type=account_credentials') && url.includes('account_id=acc'))
    assert.equal(h.get('authorization'), `Basic ${Buffer.from('cid:sec').toString('base64')}`)
    return respuesta({ access_token: 'zoom-tok', expires_in: 3600 })
  }
  if (url === 'https://api.zoom.us/v2/users/lucianom%40productosdigitales.io/meetings' && metodo === 'POST') {
    assert.equal(h.get('authorization'), 'Bearer zoom-tok')
    const b = JSON.parse(cuerpo!)
    assert.equal(b.type, 2)
    assert.equal(b.start_time, '2026-11-19T18:00:00Z')
    assert.equal(b.duration, 60)
    return respuesta({ id: 83412345678, join_url: 'https://zoom.us/j/83412345678?pwd=abc' }, 201)
  }
  if (url.startsWith('https://api.zoom.us/v2/meetings/') && metodo === 'DELETE') return new Response(null, { status: 204 })
  throw new Error(`fetch no simulado: ${metodo} ${url}`)
}) as typeof fetch

async function main() {
  const g = await import('../../lib/integraciones/google')
  const z = await import('../../lib/integraciones/zoom')
  const { armarPayloadCalendly } = await import('../../lib/n8n/payload')

  // Google: lectura de bloques (paginación, filtros, todo el día en la zona del negocio).
  const sub = 'lucianom@productosdigitales.io'
  const bloques = await g.listarBloques(sub, sub, new Date('2026-11-18T00:00:00Z'), new Date('2026-11-28T00:00:00Z'), 'America/Argentina/Buenos_Aires')
  assert.deepEqual(bloques.map((b) => b.gcal_event_id), ['ev1', 'ev4'], 'solo ocupan ev1 (normal) y ev4 (todo el día)')
  assert.equal(bloques[0].inicio, '2026-11-19T18:00:00.000Z')
  assert.equal(bloques[1].inicio, '2026-11-20T03:00:00.000Z', 'todo el día arranca a las 00:00 ART = 03:00Z')
  assert.equal(bloques[1].fin, '2026-11-21T03:00:00.000Z')
  assert.equal(subsVistos.filter((s) => s === sub).length, 1, 'el token se cachea')

  // Google: evento idempotente (409 = ya existía) y borrado tolerante.
  const ev = { id: g.eventIdDeReserva('B397C713-345E-4A3E-8AD1-775E98C66DFA'), titulo: 't', descripcion: 'd', ubicacion: 'https://zoom.us/j/1', inicio: new Date('2026-11-19T18:00:00Z'), fin: new Date('2026-11-19T19:00:00Z'), zona: 'America/Argentina/Buenos_Aires', reservaId: 'r1' }
  assert.equal(ev.id, 'b397c713345e4a3e8ad1775e98c66dfa')
  assert.deepEqual(await g.crearEvento(sub, sub, ev), { id: ev.id, yaExistia: false })
  assert.deepEqual(await g.crearEvento(sub, sub, ev), { id: ev.id, yaExistia: true })
  await g.borrarEvento(sub, sub, 'abc')
  await g.borrarEvento(sub, sub, 'noexiste')

  // Zoom: crear y borrar.
  const r = await z.crearReunion({ host: sub, tema: 'Llamada', inicio: new Date('2026-11-19T18:00:00Z'), duracionMin: 60, zona: 'America/Argentina/Buenos_Aires' })
  assert.deepEqual(r, { id: '83412345678', join_url: 'https://zoom.us/j/83412345678?pwd=abc' })
  await z.borrarReunion(r.id)
  assert.equal(llamadas.filter((l) => l.url.startsWith('https://zoom.us/oauth/token')).length, 1, 'el token de Zoom se cachea')

  // Payload a n8n: el link de Zoom de la reserva pisa al link fijo del closer.
  const reserva = { id: 'b397c713-345e-4a3e-8ad1-775e98c66dfa', invitee_uri: 'https://x.io/backup/invitees/b397', closer: 'Luciano Medina', inicio: '2026-11-19T18:00:00.000Z', fin: '2026-11-19T19:00:00.000Z', timezone_lead: null, nombre: 'N', email: 'a@b.c', respuestas: [], created_at: '2026-11-18T00:00:00.000Z', zoom_join_url: r.join_url } as never
  const closer = { email: sub, zoom_link: 'https://zoom.us/j/fijo' } as never
  const cfg = { evento_nombre: 'Llamada', utm_source: 'x' }
  assert.equal(armarPayloadCalendly(reserva, closer, cfg).payload.scheduled_event.location.join_url, r.join_url)
  assert.equal(armarPayloadCalendly({ ...(reserva as object), zoom_join_url: null } as never, closer, cfg).payload.scheduled_event.location.join_url, 'https://zoom.us/j/fijo')

  console.log('OK: google + zoom + payload')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
