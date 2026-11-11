// Borra SOLO las reservas marcadas como prueba (es_prueba = true) y los contadores de rate limit viejos.
// Uso: node --env-file=.env.development.local scripts/db/limpiar-pruebas.mjs [--ejecutar]
import pg from 'pg'

const ejecutar = process.argv.includes('--ejecutar')
const url = (process.env.POSTGRES_URL_NON_POOLING ?? '').replace(/[?&]sslmode=[^&]*/g, '')
const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await cliente.connect()
try {
  const { rows } = await cliente.query('select count(*)::int as n from public.agendador_reservas where es_prueba')
  console.log(`Reservas de prueba: ${rows[0].n}`)
  if (!ejecutar) {
    console.log('Dry-run. Agregá --ejecutar para borrarlas.')
  } else {
    const r1 = await cliente.query('delete from public.agendador_reservas where es_prueba')
    const r2 = await cliente.query("delete from public.agendador_rate_limits where ventana < now() - interval '1 hour'")
    console.log(`Borradas ${r1.rowCount} reservas de prueba y ${r2.rowCount} ventanas de rate limit viejas.`)
  }
} finally {
  await cliente.end()
}
