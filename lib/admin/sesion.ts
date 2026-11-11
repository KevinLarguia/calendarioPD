import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'

export const COOKIE_ADMIN = 'agendador_admin'
const DURACION_SEGUNDOS = 12 * 60 * 60

function firmaSesion(): string {
  return createHmac('sha256', env.adminSecret).update('agendador-admin-v1').digest('base64url')
}

function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export function secretoAdminCorrecto(ingresado: string): boolean {
  return Boolean(env.adminSecret) && igualSeguro(ingresado, env.adminSecret)
}

export async function esAdmin(): Promise<boolean> {
  if (!env.adminSecret) return false
  const valor = (await cookies()).get(COOKIE_ADMIN)?.value
  return Boolean(valor) && igualSeguro(valor!, firmaSesion())
}

export async function abrirSesionAdmin(): Promise<void> {
  ;(await cookies()).set(COOKIE_ADMIN, firmaSesion(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: DURACION_SEGUNDOS,
  })
}

export async function cerrarSesionAdmin(): Promise<void> {
  ;(await cookies()).delete({ name: COOKIE_ADMIN, path: '/admin' })
}
