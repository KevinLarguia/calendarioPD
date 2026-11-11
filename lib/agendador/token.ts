import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

export const TOKEN_MIN_SEGUNDOS = 4
const TOKEN_MAX_SEGUNDOS = 3 * 60 * 60

function firmar(cuerpo: string): string {
  return createHmac('sha256', env.formTokenSecret).update(cuerpo).digest('base64url')
}

/** Token firmado con la hora de emisión. El cliente lo pide al mostrar el formulario. */
export function emitirToken(): string {
  const cuerpo = Buffer.from(JSON.stringify({ t: Date.now() })).toString('base64url')
  return `${cuerpo}.${firmar(cuerpo)}`
}

export type ResultadoToken = { ok: true } | { ok: false; motivo: 'formato' | 'firma' | 'muy_rapido' | 'vencido' }

export function verificarToken(token: string): ResultadoToken {
  const [cuerpo, firma] = token.split('.')
  if (!cuerpo || !firma) return { ok: false, motivo: 'formato' }
  const esperada = Buffer.from(firmar(cuerpo))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    return { ok: false, motivo: 'firma' }
  }
  let emitido: number
  try {
    emitido = Number(JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')).t)
  } catch {
    return { ok: false, motivo: 'formato' }
  }
  if (!Number.isFinite(emitido)) return { ok: false, motivo: 'formato' }
  const edad = (Date.now() - emitido) / 1000
  if (edad < TOKEN_MIN_SEGUNDOS) return { ok: false, motivo: 'muy_rapido' }
  if (edad > TOKEN_MAX_SEGUNDOS) return { ok: false, motivo: 'vencido' }
  return { ok: true }
}
