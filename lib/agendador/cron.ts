import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

/** Valida el header x-cron-secret que manda pg_cron (comparación en tiempo constante). */
export function secretoCronValido(recibido: string | null): boolean {
  const esperado = env.cronSecret
  if (!esperado || !recibido) return false
  const a = Buffer.from(esperado)
  const b = Buffer.from(recibido)
  return a.length === b.length && timingSafeEqual(a, b)
}
