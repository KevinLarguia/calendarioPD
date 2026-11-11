// Prueba la cola en modo prod contra el mock (scripts/n8n/mock-n8n.mjs en :3999).
// Uso: NODE_PATH=/tmp/medir/stub pnpm exec tsx --env-file=.env.development.local --env-file=.env.local scripts/n8n/probar-cola.ts
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import Module from 'node:module'

// Fuera de Next, `server-only` lanza al importarse: lo anulamos solo en este arnés.
const cargaOriginal = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load
;(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (req: unknown, ...resto: unknown[]) {
  if (req === 'server-only') return {}
  return cargaOriginal.call(this, req, ...resto)
}

process.env.AGENDADOR_MODO = 'prod'
const MOCK = 'http://127.0.0.1:3999'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function reservar(i: number, inicio: string) {
  const { data, error } = await supabase.rpc('agendador_reservar', {
    p_inicio: inicio,
    p_nombre: `Cola Prueba ${i}`,
    p_email: `cola-prueba-${i}@test.local`,
    p_telefono_e164: `+54934199900${String(i).padStart(2, '0')}`,
    p_timezone: 'America/Argentina/Buenos_Aires',
    p_respuestas: [{ answer: '@x', position: 0, question: 'Instagram' }, { answer: '+54 9 341 999 0000', position: 1, question: 'Numero de telefono' }],
    p_ip: '10.0.0.1',
    p_user_agent: 'probar-cola',
    p_host: 'agendador.prueba.local',
    p_es_prueba: true,
  })
  if (error) throw error
  return data as { resultado: string; id?: string }
}

async function estados() {
  const { data } = await supabase
    .from('agendador_reservas')
    .select('nombre, estado_envio, intentos, ultimo_error')
    .like('email', 'cola-prueba-%')
    .order('nombre')
  return data
}

async function correr(url: string) {
  process.env.N8N_WEBHOOK_URL = url
  const { procesarCola } = await import('../../lib/agendador/cola')
  const r = await procesarCola()
  console.log('  resumen', JSON.stringify(r))
}

async function main() {
  await supabase.from('agendador_reservas').delete().like('email', 'cola-prueba-%')
  const { data: slots } = await supabase.rpc('agendador_slots')
  const libres = (slots as { inicio: string; libres: number }[]).filter((s) => s.libres >= 2).slice(5, 8)
  for (let i = 0; i < 3; i++) console.log('reserva', i, (await reservar(i, libres[i].inicio)).resultado)

  console.log('\n1) envío OK')
  await correr(`${MOCK}/ok`)
  console.log(await estados())
  const archivos = readdirSync('/tmp/mock-n8n').sort()
  const ultimo = JSON.parse(readFileSync(`/tmp/mock-n8n/${archivos.at(-1)}`, 'utf8'))
  console.log('  payload.uri', ultimo.payload.uri, '| old_invitee', ultimo.payload.old_invitee, '| utm', ultimo.payload.tracking.utm_source, '| host', ultimo.payload.scheduled_event.event_memberships[0].user_name)

  console.log('\n2) verificación: no aparecen en agendas_final -> revisar')
  await supabase.from('agendador_reservas').update({ enviado_at: new Date(Date.now() - 4 * 60_000).toISOString() }).like('email', 'cola-prueba-%')
  await correr(`${MOCK}/ok`)
  console.log(await estados())

  console.log('\n3) HTTP 500 -> revisar')
  await supabase.from('agendador_reservas').update({ estado_envio: 'pendiente', intentos: 0 }).eq('email', 'cola-prueba-0@test.local')
  await correr(`${MOCK}/error`)
  console.log((await estados())?.[0])

  console.log('\n4) conexión rechazada x3 -> pendiente, pendiente, error')
  await supabase.from('agendador_reservas').update({ estado_envio: 'pendiente', intentos: 0 }).eq('email', 'cola-prueba-1@test.local')
  for (let i = 0; i < 3; i++) {
    await correr('http://127.0.0.1:3998/nada')
    console.log('  ', (await estados())?.[1])
  }

  console.log('\n5) timeout (20 s) -> revisar sin reenvío')
  await supabase.from('agendador_reservas').update({ estado_envio: 'pendiente', intentos: 0 }).eq('email', 'cola-prueba-2@test.local')
  await correr(`${MOCK}/lento`)
  console.log((await estados())?.[2])

  console.log('\n6) enviando colgado > 5 min -> revisar')
  await supabase
    .from('agendador_reservas')
    .update({ estado_envio: 'enviando', updated_at: new Date(Date.now() - 6 * 60_000).toISOString() })
    .eq('email', 'cola-prueba-2@test.local')
  await correr(`${MOCK}/ok`)
  console.log((await estados())?.[2])

  await supabase.from('agendador_reservas').delete().like('email', 'cola-prueba-%')
  console.log('\nlimpieza ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
