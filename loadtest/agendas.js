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
const PREFIJO = __ENV.PREFIJO || `k6-${Date.now().toString(36)}`

const resultados = new Counter('reservas_resultado')
const sinCupo = new Counter('reservas_sin_cupo')
const ok = new Counter('reservas_ok')
const tPagina = new Trend('t_pagina', true)
const tSlots = new Trend('t_slots', true)
const tReservar = new Trend('t_reservar', true)

const ESCENARIOS = {
  humo: { executor: 'shared-iterations', vus: 2, iterations: 5, maxDuration: '2m' },
  rafaga60: { executor: 'shared-iterations', vus: 30, iterations: 60, maxDuration: '3m' },
  pico500: { executor: 'ramping-arrival-rate', startRate: 1, timeUnit: '1s', preAllocatedVUs: 150, maxVUs: 600, stages: [{ target: 6, duration: '90s' }, { target: 0, duration: '10s' }] },
  pico300: { executor: 'constant-arrival-rate', rate: 1, timeUnit: '1s', duration: '5m', preAllocatedVUs: 40, maxVUs: 200 },
  hora1000: { executor: 'constant-arrival-rate', rate: 1000, timeUnit: '60m', duration: '60m', preAllocatedVUs: 20, maxVUs: 100 },
}

export const options = {
  scenarios: { [ESCENARIO]: ESCENARIOS[ESCENARIO] },
  thresholds: {
    http_req_failed: ['rate<0.02'],
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

export default function () {
  const n = exec.scenario.iterationInTest + 1
  const headers = { 'x-prueba-ip': ipSimulada(n) }

  const pagina = http.get(`${BASE}/`, { headers, tags: { name: 'pagina' } })
  tPagina.add(pagina.timings.duration)
  check(pagina, { 'pagina 200': (r) => r.status === 200 })

  const slots = http.get(`${BASE}/api/slots`, { headers, tags: { name: 'slots' } })
  tSlots.add(slots.timings.duration)
  if (!check(slots, { 'slots 200': (r) => r.status === 200 })) return
  const lista = slots.json('slots') || []
  if (lista.length === 0) {
    sinCupo.add(1)
    return
  }

  const token = http.get(`${BASE}/api/token`, { headers, tags: { name: 'token' } }).json('token')
  // El token exige >= 4 s desde su emisión (tiempo mínimo de llenado del formulario).
  sleep(4.2)

  // Elegimos un slot al azar entre los primeros 40 para concentrar la pelea por el mismo horario.
  const slot = lista[Math.floor(Math.random() * Math.min(40, lista.length))]
  const cuerpo = {
    inicio: slot.inicio,
    nombre: `Carga ${PREFIJO} ${n}`,
    email: `${PREFIJO}-${n}@carga.test`,
    telefono: `9 11 ${String(10000000 + n).slice(-8)}`,
    pais: 'AR',
    timezone: 'America/Argentina/Buenos_Aires',
    respuestas: RESPUESTAS,
    token,
    sitio_web: '',
  }

  const res = http.post(`${BASE}/api/reservar`, JSON.stringify(cuerpo), {
    headers: { ...headers, 'content-type': 'application/json' },
    tags: { name: 'reservar' },
  })
  tReservar.add(res.timings.duration)
  const resultado = res.status < 500 ? res.json('resultado') : `http_${res.status}`
  resultados.add(1, { resultado })
  if (resultado === 'ok') ok.add(1)
  if (resultado === 'sin_cupo') sinCupo.add(1)
  check(res, { 'reservar ok|sin_cupo|ya_agendado': () => ['ok', 'sin_cupo', 'ya_agendado'].includes(resultado) })
}

export function handleSummary(data) {
  const m = data.metrics
  const p95 = (k) => (m[k] ? Math.round(m[k].values['p(95)']) : null)
  const resumen = {
    escenario: ESCENARIO,
    base: BASE,
    iteraciones: m.iterations ? m.iterations.values.count : 0,
    reservas_ok: m.reservas_ok ? m.reservas_ok.values.count : 0,
    sin_cupo: m.reservas_sin_cupo ? m.reservas_sin_cupo.values.count : 0,
    errores_http: m.http_req_failed ? m.http_req_failed.values.passes : 0,
    p95_ms: { pagina: p95('t_pagina'), slots: p95('t_slots'), reservar: p95('t_reservar') },
  }
  return {
    stdout: `\n${JSON.stringify(resumen, null, 2)}\n`,
    [`loadtest/resultados/${ESCENARIO}-${Date.now()}.json`]: JSON.stringify({ resumen, metrics: data.metrics }, null, 2),
  }
}
