import 'server-only'

function requerida(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`)
  return valor
}

export const env = {
  get supabaseUrl() {
    return process.env.SUPABASE_URL ?? requerida('NEXT_PUBLIC_SUPABASE_URL')
  },
  get supabaseServiceRole() {
    return requerida('SUPABASE_SERVICE_ROLE_KEY')
  },
  get n8nWebhookUrl() {
    return process.env.N8N_WEBHOOK_URL ?? ''
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? ''
  },
  get adminSecret() {
    return process.env.ADMIN_SECRET ?? ''
  },
  get formTokenSecret() {
    return requerida('FORM_TOKEN_SECRET')
  },
  get discordWebhookUrl() {
    return process.env.DISCORD_ALERTAS_WEBHOOK_URL ?? ''
  },
  get modo(): 'test' | 'prod' {
    return process.env.AGENDADOR_MODO === 'prod' ? 'prod' : 'test'
  },
  // Google Calendar: JSON de la service account con domain-wide delegation (el JSON completo, en una variable).
  get googleServiceAccountJson() {
    return process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ''
  },
  // Zoom Server-to-Server OAuth.
  get zoomAccountId() {
    return process.env.ZOOM_ACCOUNT_ID ?? ''
  },
  get zoomClientId() {
    return process.env.ZOOM_CLIENT_ID ?? ''
  },
  get zoomClientSecret() {
    return process.env.ZOOM_CLIENT_SECRET ?? ''
  },
  get googleConfigurado() {
    return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  },
  get zoomConfigurado() {
    return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET)
  },
}
