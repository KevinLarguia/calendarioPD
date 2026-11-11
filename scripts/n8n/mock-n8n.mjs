// n8n simulado para probar la cola en modo prod sin tocar el real.
// Guarda cada payload recibido en /tmp/mock-n8n/<n>.json. Comportamiento según la ruta:
//   /ok -> 200 "Workflow got started."   /error -> 500   /lento -> no responde (timeout)
// Uso: node scripts/n8n/mock-n8n.mjs [puerto]
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'

const puerto = Number(process.argv[2] ?? 3999)
mkdirSync('/tmp/mock-n8n', { recursive: true })
let n = 0

createServer((req, res) => {
  let cuerpo = ''
  req.on('data', (d) => (cuerpo += d))
  req.on('end', () => {
    n++
    writeFileSync(`/tmp/mock-n8n/${n}.json`, cuerpo)
    console.log(`[mock-n8n] #${n} ${req.method} ${req.url} ${cuerpo.length} bytes`)
    if (req.url?.startsWith('/lento')) return
    if (req.url?.startsWith('/error')) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      return res.end('Internal error')
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Workflow got started.' }))
  })
}).listen(puerto, () => console.log(`[mock-n8n] escuchando en ${puerto}`))
