// Ejecuta una consulta SQL de solo lectura y la imprime como JSON.
// Uso: node --env-file=.env.development.local scripts/db/consulta.mjs "select 1"
import pg from 'pg'

const sql = process.argv[2]
if (!sql) {
  console.error('Falta la consulta')
  process.exit(1)
}

const url = (process.env.POSTGRES_URL_NON_POOLING ?? '').replace(/[?&]sslmode=[^&]*/g, '')
const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await cliente.connect()
try {
  await cliente.query('begin read only')
  const r = await cliente.query(sql)
  const filas = Array.isArray(r) ? r.at(-1).rows : r.rows
  console.log(JSON.stringify(filas, null, 1))
  await cliente.query('rollback')
} catch (e) {
  console.error('ERROR:', e.message)
  process.exitCode = 1
} finally {
  await cliente.end()
}
