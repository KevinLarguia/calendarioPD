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
}
