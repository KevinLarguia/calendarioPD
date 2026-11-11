// Aplica un archivo SQL contra la base usando POSTGRES_URL_NON_POOLING.
// Uso: node --env-file=.env.development.local scripts/db/aplicar.mjs supabase/migrations/001_agendador_tablas.sql
import { readFileSync } from 'node:fs'
import pg from 'pg'

const archivo = process.argv[2]
if (!archivo) {
  console.error('Falta la ruta del .sql')
  process.exit(1)
}

const url = (process.env.POSTGRES_URL_NON_POOLING ?? '').replace(/[?&]sslmode=[^&]*/g, '')
if (!url) {
  console.error('Falta POSTGRES_URL_NON_POOLING')
  process.exit(1)
}

const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await cliente.connect()
try {
  await cliente.query('begin')
  await cliente.query(readFileSync(archivo, 'utf8'))
  await cliente.query('commit')
  console.log(`OK ${archivo}`)
} catch (e) {
  await cliente.query('rollback')
  console.error(`ERROR ${archivo}:`, e.message)
  process.exitCode = 1
} finally {
  await cliente.end()
}
