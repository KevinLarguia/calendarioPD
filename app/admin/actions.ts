'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { abrirSesionAdmin, cerrarSesionAdmin, esAdmin, secretoAdminCorrecto } from '@/lib/admin/sesion'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type EstadoAccion = { ok: boolean; mensaje?: string }

async function exigirAdmin() {
  if (!(await esAdmin())) redirect('/admin/login')
}

export async function entrar(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const secreto = String(formData.get('secreto') ?? '')
  if (!secretoAdminCorrecto(secreto)) return { ok: false, mensaje: 'Clave incorrecta' }
  await abrirSesionAdmin()
  redirect('/admin')
}

export async function salir(): Promise<void> {
  await cerrarSesionAdmin()
  redirect('/admin/login')
}

const numero = (min: number, max: number) => z.coerce.number().int().min(min).max(max)

const configSchema = z.object({
  activo: z.coerce.boolean(),
  dias_semana: z.array(numero(1, 7)).min(1, 'Elegí al menos un día'),
  hora_primera: z.string().regex(/^\d{2}:\d{2}$/),
  hora_ultima: z.string().regex(/^\d{2}:\d{2}$/),
  paso_min: numero(5, 240),
  duracion_min: numero(5, 240),
  aviso_min_minutos: numero(0, 10080),
  dias_adelante: numero(0, 60),
  zona: z.string().min(1).max(80),
  envios_por_minuto: numero(1, 120),
  utm_source: z.string().trim().min(1).max(80),
  evento_nombre: z.string().trim().min(1).max(200),
  limite_ip_10min: numero(1, 10000),
  limite_email_10min: numero(1, 1000),
})

export async function guardarConfig(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  await exigirAdmin()
  const crudo = {
    activo: formData.get('activo') === 'on',
    dias_semana: formData.getAll('dias_semana').map(Number),
    hora_primera: formData.get('hora_primera'),
    hora_ultima: formData.get('hora_ultima'),
    paso_min: formData.get('paso_min'),
    duracion_min: formData.get('duracion_min'),
    aviso_min_minutos: formData.get('aviso_min_minutos'),
    dias_adelante: formData.get('dias_adelante'),
    zona: formData.get('zona'),
    envios_por_minuto: formData.get('envios_por_minuto'),
    utm_source: formData.get('utm_source'),
    evento_nombre: formData.get('evento_nombre'),
    limite_ip_10min: formData.get('limite_ip_10min'),
    limite_email_10min: formData.get('limite_email_10min'),
  }
  const parsed = configSchema.safeParse(crudo)
  if (!parsed.success) return { ok: false, mensaje: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') }
  if (parsed.data.hora_ultima < parsed.data.hora_primera) return { ok: false, mensaje: 'La última hora tiene que ser mayor que la primera' }

  const { error } = await supabaseAdmin()
    .from('agendador_config')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { ok: false, mensaje: error.message }
  revalidatePath('/admin')
  return { ok: true, mensaje: 'Configuración guardada' }
}

const closerSchema = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(80),
  email: z.union([z.literal(''), z.email()]).transform((v) => v || null),
  zoom_link: z.union([z.literal(''), z.url()]).transform((v) => v || null),
  aliases: z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  activo: z.coerce.boolean(),
  orden: numero(0, 999),
})

export async function guardarCloser(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  await exigirAdmin()
  const parsed = closerSchema.safeParse({
    id: formData.get('id') || undefined,
    nombre: formData.get('nombre'),
    email: formData.get('email') ?? '',
    zoom_link: formData.get('zoom_link') ?? '',
    aliases: formData.get('aliases') ?? '',
    activo: formData.get('activo') === 'on',
    orden: formData.get('orden') ?? 0,
  })
  if (!parsed.success) return { ok: false, mensaje: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') }

  const { id, ...datos } = parsed.data
  const supabase = supabaseAdmin()
  const { error } = id
    ? await supabase.from('agendador_closers').update({ ...datos, updated_at: new Date().toISOString() }).eq('id', id)
    : await supabase.from('agendador_closers').insert(datos)
  if (error) return { ok: false, mensaje: error.message }
  revalidatePath('/admin')
  return { ok: true, mensaje: id ? 'Closer actualizado' : 'Closer agregado' }
}

export async function reenviarReserva(id: string): Promise<EstadoAccion> {
  await exigirAdmin()
  const { data, error } = await supabaseAdmin()
    .from('agendador_reservas')
    .update({ estado_envio: 'pendiente', ultimo_error: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('estado_envio', ['revisar', 'error'])
    .select('id')
  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'La reserva ya no está en revisar/error' }
  revalidatePath('/admin')
  return { ok: true, mensaje: 'Encolada: se envía en el próximo minuto' }
}
