import 'server-only'
import { env } from '@/lib/env'

/** Host público del deploy (para armar invitee_uri). Prioriza x-forwarded-host (Vercel). */
export function hostDe(req: Request): string {
  const h = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost'
  return h.split(',')[0].trim()
}

export function ipDe(req: Request): string | null {
  // Solo en modo test: k6 corre desde una IP y necesita simular leads distintos para no chocar con el rate limit.
  const simulada = env.modo === 'test' ? req.headers.get('x-prueba-ip') : null
  if (simulada) return simulada.slice(0, 64)
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim().slice(0, 64)
  return req.headers.get('x-real-ip')?.slice(0, 64) ?? null
}

export function userAgentDe(req: Request): string | null {
  return req.headers.get('user-agent')?.slice(0, 500) ?? null
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init?.headers ?? {}) },
  })
}
