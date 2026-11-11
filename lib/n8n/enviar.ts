import 'server-only'
import { env } from '@/lib/env'
import type { PayloadCalendly } from '@/lib/n8n/payload'

const TIMEOUT_MS = 20_000

/** Códigos de error que garantizan que la petición NUNCA salió: seguro reintentar. */
const ERRORES_ANTES_DE_ENVIAR = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ERR_INVALID_URL', 'ECONNABORTED_PRE'])

export type ResultadoEnvio =
  | { tipo: 'ok'; status: number }
  | { tipo: 'conexion'; detalle: string }
  | { tipo: 'ambiguo'; detalle: string }
  | { tipo: 'http'; status: number; detalle: string }

function codigoDe(e: unknown): string {
  const err = e as { code?: string; cause?: { code?: string }; name?: string }
  return err?.cause?.code ?? err?.code ?? err?.name ?? 'desconocido'
}

/**
 * Hace UN solo POST a n8n. n8n responde 200 "Workflow got started." apenas recibe: el 2xx significa
 * "recibido", no "procesado". La confirmación real la hace la verificación contra agendas_final.
 */
export async function enviarAN8n(payload: PayloadCalendly): Promise<ResultadoEnvio> {
  const url = env.n8nWebhookUrl
  if (!url) return { tipo: 'conexion', detalle: 'N8N_WEBHOOK_URL no configurada' }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (res.ok) return { tipo: 'ok', status: res.status }
    const texto = await res.text().catch(() => '')
    return { tipo: 'http', status: res.status, detalle: `HTTP ${res.status} ${texto.slice(0, 200)}` }
  } catch (e) {
    const codigo = codigoDe(e)
    if (codigo === 'AbortError' || codigo === 'TimeoutError') return { tipo: 'ambiguo', detalle: `timeout ${TIMEOUT_MS} ms` }
    if (ERRORES_ANTES_DE_ENVIAR.has(codigo)) return { tipo: 'conexion', detalle: codigo }
    return { tipo: 'ambiguo', detalle: `${codigo}: ${(e as Error)?.message ?? ''}`.slice(0, 200) }
  } finally {
    clearTimeout(timer)
  }
}
