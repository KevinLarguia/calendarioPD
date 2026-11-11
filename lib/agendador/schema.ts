import { z } from 'zod'
import { PREGUNTAS } from '@/lib/agendador/preguntas'

const texto = (max: number) => z.string().trim().min(1, 'Completá este campo').max(max, `Máximo ${max} caracteres`)

const opcionesDe = (id: string) => {
  const p = PREGUNTAS.find((q) => q.id === id)
  if (!p || p.tipo !== 'opciones') throw new Error(`Pregunta ${id} sin opciones`)
  return z.enum(p.opciones as unknown as [string, ...string[]], { message: 'Elegí una opción' })
}

export const respuestasSchema = z.object({
  instagram: texto(80),
  dedicacion: texto(300),
  ingresos: opcionesDe('ingresos'),
  urgencia: opcionesDe('urgencia'),
  inversion: opcionesDe('inversion'),
  decision: opcionesDe('decision'),
})

export const reservaSchema = z.object({
  inicio: z.iso.datetime({ offset: true, message: 'Horario inválido' }),
  nombre: texto(120),
  email: z.email({ message: 'Ingresá un email válido' }).max(200).transform((v) => v.trim().toLowerCase()),
  telefono: z.string().trim().min(5, 'Ingresá tu teléfono').max(40),
  pais: z.string().length(2).toUpperCase(),
  timezone: z.string().min(1).max(80),
  respuestas: respuestasSchema,
  token: z.string().min(10),
  // Honeypot: tiene que llegar vacío.
  sitio_web: z.string().max(0, 'Spam').optional().default(''),
})

export type ReservaInput = z.input<typeof reservaSchema>
export type ReservaValidada = z.output<typeof reservaSchema>
