import { secretoCronValido } from '@/lib/agendador/cron'
import { procesarCola } from '@/lib/agendador/cola'
import { json } from '@/lib/agendador/request'

export const maxDuration = 60

export async function POST(req: Request) {
  if (!secretoCronValido(req.headers.get('x-cron-secret'))) {
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
