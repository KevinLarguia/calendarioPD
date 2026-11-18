import 'server-only'
import { env } from '@/lib/env'

/**
 * Cliente mínimo de Zoom con Server-to-Server OAuth (app de cuenta, sin usuarios que autoricen).
 * Scopes de la app: meeting:write:meeting:admin (crear) y meeting:delete:meeting:admin (borrar).
 * Las reuniones se crean con el closer como host (`/users/{email}/meetings`), así aparecen en su Zoom.
 */

const TOKEN_URL = 'https://zoom.us/oauth/token'
const API = 'https://api.zoom.us/v2'
const TIMEOUT_MS = 8_000

export class ErrorZoom extends Error {
  constructor(
    mensaje: string,
    readonly status: number | null = null,
  ) {
    super(mensaje)
    this.name = 'ErrorZoom'
  }
}

let token: { valor: string; venceMs: number } | null = null

async function conTimeout(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  } catch (e) {
    throw new ErrorZoom(`sin respuesta de Zoom: ${(e as Error).name}`)
  }
}

async function obtenerToken(): Promise<string> {
  if (token && token.venceMs - 60_000 > Date.now()) return token.valor
  if (!env.zoomConfigurado) throw new ErrorZoom('Faltan ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET')
  const basic = Buffer.from(`${env.zoomClientId}:${env.zoomClientSecret}`).toString('base64')
  const res = await conTimeout(`${TOKEN_URL}?${new URLSearchParams({ grant_type: 'account_credentials', account_id: env.zoomAccountId })}`, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}` },
  })
  const cuerpo = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; reason?: string; error?: string }
  if (!res.ok || !cuerpo.access_token) {
    throw new ErrorZoom(`token de Zoom: ${cuerpo.reason ?? cuerpo.error ?? res.status}`, res.status)
  }
  token = { valor: cuerpo.access_token, venceMs: Date.now() + (cuerpo.expires_in ?? 3600) * 1000 }
  return token.valor
}

async function api(ruta: string, init: RequestInit, reintento = true): Promise<Response> {
  const res = await conTimeout(`${API}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${await obtenerToken()}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (res.status === 401 && reintento) {
    token = null
    return api(ruta, init, false)
  }
  return res
}

export type ReunionZoom = { id: string; join_url: string }

export type NuevaReunion = {
  host: string // email o userId del closer en Zoom
  tema: string
  inicio: Date
  duracionMin: number
  zona: string
  agenda?: string
}

/** Crea una reunión programada (type 2). El host entra sin sala de espera; el lead entra al abrir el link. */
export async function crearReunion(r: NuevaReunion): Promise<ReunionZoom> {
  const res = await api(`/users/${encodeURIComponent(r.host)}/meetings`, {
    method: 'POST',
    body: JSON.stringify({
      topic: r.tema.slice(0, 200),
      type: 2,
      // Zoom espera hora local sin zona si se manda `timezone`; con "Z" va en UTC y `timezone` solo afecta cómo se muestra.
      start_time: r.inicio.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      duration: r.duracionMin,
      timezone: r.zona,
      agenda: r.agenda?.slice(0, 2000),
      settings: {
        join_before_host: true,
        waiting_room: false,
        host_video: true,
        participant_video: true,
        mute_upon_entry: false,
        approval_type: 2,
        auto_recording: 'none',
      },
    }),
  })
  if (!res.ok) {
    const texto = await res.text().catch(() => '')
    throw new ErrorZoom(`crear reunión para ${r.host}: HTTP ${res.status} ${texto.slice(0, 200)}`, res.status)
  }
  const cuerpo = (await res.json()) as { id: number | string; join_url: string }
  return { id: String(cuerpo.id), join_url: cuerpo.join_url }
}

/** Borra la reunión (avisa a los registrados: no hay). 404 = ya no existe. */
export async function borrarReunion(meetingId: string): Promise<void> {
  const res = await api(`/meetings/${encodeURIComponent(meetingId)}?schedule_for_reminder=false`, { method: 'DELETE' })
  if (res.ok || res.status === 404) return
  const texto = await res.text().catch(() => '')
  throw new ErrorZoom(`borrar reunión ${meetingId}: HTTP ${res.status} ${texto.slice(0, 200)}`, res.status)
}
