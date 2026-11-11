export type Slot = { inicio: string; fin: string; libres: number }

export type SlotsRespuesta = {
  slots: Slot[]
  zona: string
  duracion_min: number
  activo: boolean
  generado_at: string
}

export type ResultadoReserva =
  | { resultado: 'ok'; id: string; inicio: string; fin: string; closer: string }
  | { resultado: 'ya_agendado'; inicio: string; closer: string | null; fuente: 'respaldo' | 'calendly' }
  | { resultado: 'sin_cupo'; inicio: string }
  | { resultado: 'rate_limit'; motivo: 'ip' | 'email' }
  | { resultado: 'invalido'; motivo: string; campos?: Record<string, string> }
  | { resultado: 'inactivo' }

export type EstadoEnvio = 'pendiente' | 'enviando' | 'enviado' | 'verificado' | 'revisar' | 'error'

export type Reserva = {
  id: string
  invitee_uri: string
  closer: string
  inicio: string
  fin: string
  timezone_lead: string | null
  nombre: string
  email: string
  telefono_e164: string
  respuestas: { answer: string; position: number; question: string }[]
  ip: string | null
  user_agent: string | null
  estado: 'activa' | 'cancelada'
  estado_envio: EstadoEnvio
  intentos: number
  enviado_at: string | null
  verificado_at: string | null
  ultimo_error: string | null
  es_prueba: boolean
  created_at: string
  updated_at: string
}

export type Config = {
  id: 1
  dias_semana: number[]
  hora_primera: string
  hora_ultima: string
  paso_min: number
  duracion_min: number
  aviso_min_minutos: number
  // Fecha (en la zona del negocio) cuyos turnos usan webinar_aviso_min en vez de aviso_min_minutos.
  webinar_fecha: string | null
  webinar_aviso_min: number
  dias_adelante: number
  zona: string
  envios_por_minuto: number
  utm_source: string
  evento_nombre: string
  activo: boolean
  limite_ip_10min: number
  limite_email_10min: number
  updated_at: string
}

export type Closer = {
  id: string
  nombre: string
  email: string | null
  zoom_link: string | null
  aliases: string[]
  activo: boolean
  orden: number
}
