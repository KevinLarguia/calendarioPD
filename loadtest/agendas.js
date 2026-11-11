// Prueba de carga del agendador. Correr SIEMPRE contra un deploy con AGENDADOR_MODO=test.
//
//   k6 run -e BASE_URL=https://<deploy> -e ESCENARIO=pico500 loadtest/agendas.js
//
// Escenarios (ESCENARIO=...):
//   pico500   -> 500 usuarios en 90 s (abren la página, piden slots y reservan)
//   pico300   -> 300 reservas en 5 min
//   hora1000  -> 1.000 reservas en 60 min
//   humo      -> 5 reservas (para probar el script)
//
// Cada usuario: GET / -> GET /api/slots -> GET /api/token -> espera >= 4 s -> POST /api/reservar.
// Manda x-prueba-ip con una IP distinta por iteración (solo la respeta el modo test).
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'
import exec from 'k6/execution'

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const ESCENARIO = __ENV.ESCENARIO || 'humo'

const resultados = new Counter('reservas_resultado')
const sinCupo = new Counter('reservas_sin_cupo')
const ok = new Counter('reservas_ok')
const tPagina = new Trend('t_pagina', true)
const tSlots = new Trend('t_slots', true)
const tReservar = new Trend('t_reservar', true)

const ESCENARIOS = {
  humo: { executor: 'shared-iterations', vus: 2, iterations: 5, maxDuration: '2m' },
  rafaga60: { executor: 'shared-iterations', vus: 30, iterations: 60, maxDuration: '3m' },
  // 500 llegadas repartidas en 90 s (~5,5 por segundo); cada una tarda ~5 s por la espera del token.
  pico500: { executor: 'constant-arrival-rate', rate: 500, timeUnit: '90s', duration: '90s', preAllocatedVUs: 100, maxVUs: 600 },
  pico300: { executor: 'constant-arrival-rate', rate: 1, timeUnit: '1s', duration: '5m', preAllocatedVUs: 40, maxVUs: 200 },
  hora1000: { executor: 'constant-arrival-rate', rate: 1000, timeUnit: '60m', duration: '60m', preAllocatedVUs: 20, maxVUs: 100 },
}

const httpErrores = new Counter('http_errores')

function registrar(res) {
  if (res.status === 0 || res.status >= 400) httpErrores.add(1, { status: String(res.status), ruta: res.request.url.replace(BASE, '') })
  return res
}

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
  scenarios: { [ESCENARIO]: ESCENARIOS[ESCENARIO] },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    // k6 solo incluye submétricas por tag en el resumen si están en thresholds: las declaramos con un umbral trivial.
    ...Object.fromEntries(
      ['ok', 'sin_cupo', 'ya_agendado', 'rate_limit', 'invalido', 'inactivo', 'http_500', 'http_502', 'http_503', 'http_504', 'http_0'].map((r) => [
        `reservas_resultado{resultado:${r}}`,
        ['count>=0'],
      ]),
    ),
    ...Object.fromEntries(['0', '400', '401', '403', '404', '422', '429', '500', '502', '503', '504'].map((s) => [`http_errores{status:${s}}`, ['count>=0']])),
    t_pagina: ['p(95)<1500'],
    t_slots: ['p(95)<1500'],
    t_reservar: ['p(95)<3000'],
  },
}

const RESPUESTAS = {
  instagram: '@k6_prueba',
  dedicacion: 'Prueba de carga',
  ingresos: 'No tengo ingresos',
  urgencia: 'Lo quiero resolver ya mismo',
  inversion: 'Tengo entre $500 a $1.000 USD',
  decision: 'No, puedo tomar la decisión solo/a',
}

function ipSimulada(n) {
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`
}

// setup() corre una sola vez: la semilla hace que emails y teléfonos no se repitan entre corridas
// (el código de init corre por VU, así que un Date.now() ahí no sirve para esto).
export function setup() {
  const semilla = Date.now().toString(36).slice(-5)
  return { prefijo: __ENV.PREFIJO || `k6-${semilla}`, bloqueTel: Date.now() % 9000 }
}

export default function (data) {
  const PREFIJO = data.prefijo
  const n = exec.scenario.iterationInTest + 1
  const headers = { 'x-prueba-ip': ipSimulada(n) }

  const pagina = registrar(http.get(`${BASE}/`, { headers, tags: { name: 'pagina' } }))
  tPagina.add(pagina.timings.duration)
  check(pagina, { 'pagina 200': (r) => r.status === 200 })

  const slots = registrar(http.get(`${BASE}/api/slots`, { headers, tags: { name: 'slots' } }))
  tSlots.add(slots.timings.duration)
  if (!check(slots, { 'slots 200': (r) => r.status === 200 })) return
  const lista = slots.json('slots') || []
  if (lista.length === 0) {
    sinCupo.add(1)
    return
  }

  const token = registrar(http.get(`${BASE}/api/token`, { headers, tags: { name: 'token' } })).json('token')
  // El token exige >= 4 s desde su emisión (tiempo mínimo de llenado del formulario).
  sleep(4.2)

  // Elegimos un slot al azar entre los primeros 40 para concentrar la pelea por el mismo horario.
  const slot = lista[Math.floor(Math.random() * Math.min(40, lista.length))]
  const cuerpo = {
    inicio: slot.inicio,
    nombre: `Carga ${PREFIJO} ${n}`,
    email: `${PREFIJO}-${n}@carga.test`,
    telefono: `9 11 ${String(data.bloqueTel).padStart(4, '0')}${String(n).padStart(4, '0')}`,
    pais: 'AR',
    timezone: 'America/Argentina/Buenos_Aires',
    respuestas: RESPUESTAS,
    token,
    sitio_web: '',
  }

  const res = registrar(http.post(`${BASE}/api/reservar`, JSON.stringify(cuerpo), {
    headers: { ...headers, 'content-type': 'application/json' },
    tags: { name: 'reservar' },
  }))
  tReservar.add(res.timings.duration)
  const resultado = res.status < 500 ? res.json('resultado') : `http_${res.status}`
  resultados.add(1, { resultado })
  if (resultado === 'ok') ok.add(1)
  if (resultado === 'sin_cupo') sinCupo.add(1)
  check(res, { 'reservar ok|sin_cupo|ya_agendado': () => ['ok', 'sin_cupo', 'ya_agendado'].includes(resultado) })
}

export function handleSummary(data) {
  const m = data.metrics
  const pct = (k, p) => (m[k] ? Math.round(m[k].values[p]) : null)
  const porTag = (prefijo, tag) =>
    Object.fromEntries(
      Object.keys(m)
        .filter((k) => k.startsWith(`${prefijo}{`))
        .map((k) => [k.match(new RegExp(`${tag}:([^,}]+)`))?.[1] ?? k, m[k].values.count]),
    )
  const resumen = {
    escenario: ESCENARIO,
    base: BASE,
    iteraciones: m.iterations ? m.iterations.values.count : 0,
    http_requests: m.http_reqs ? m.http_reqs.values.count : 0,
    http_fallidas: m.http_req_failed ? m.http_req_failed.values.passes : 0,
    http_fallidas_por_status: porTag('http_errores', 'status'),
    resultados_reservar: porTag('reservas_resultado', 'resultado'),
    p95_ms: { pagina: pct('t_pagina', 'p(95)'), slots: pct('t_slots', 'p(95)'), reservar: pct('t_reservar', 'p(95)') },
    p99_ms: { pagina: pct('t_pagina', 'p(99)'), slots: pct('t_slots', 'p(99)'), reservar: pct('t_reservar', 'p(99)') },
  }
  return {
    stdout: `\n${JSON.stringify(resumen, null, 2)}\n`,
    [`loadtest/resultados/${ESCENARIO}-${Date.now()}.json`]: JSON.stringify({ resumen, metrics: data.metrics }, null, 2),
  }
}
