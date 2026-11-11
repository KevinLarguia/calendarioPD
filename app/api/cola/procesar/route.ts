import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'
import { procesarCola } from '@/lib/agendador/cola'
import { json } from '@/lib/agendador/request'

export const maxDuration = 60

function secretoValido(recibido: string | null): boolean {
  const esperado = env.cronSecret
  if (!esperado || !recibido) return false
  const a = Buffer.from(esperado)
  const b = Buffer.from(recibido)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!secretoValido(req.headers.get('x-cron-secret'))) {
    return json({ error: 'no autorizado' }, { status: 401 })
  }
  try {
    const resumen = await procesarCola()
    console.log('[cola]', JSON.stringify(resumen))
    return json(resumen)
  } catch (e) {
    console.error('[cola] fallo', (e as Error).message)
    return json({ error: 'fallo al procesar la cola' }, { status: 500 })
  }
}
