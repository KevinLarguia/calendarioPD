/**
 * Preguntas del formulario. Los textos son LITERALES: el CRM (n8n) las reconoce por texto,
 * incluido el espacio inicial de la pregunta 3. No cambiar sin coordinar con n8n.
 */
export type Pregunta =
  | { id: string; position: number; question: string; tipo: 'texto' | 'telefono' }
  | { id: string; position: number; question: string; tipo: 'opciones'; opciones: readonly string[] }

export const PREGUNTAS = [
  { id: 'instagram', position: 0, question: 'Instagram', tipo: 'texto' },
  { id: 'telefono', position: 1, question: 'Numero de telefono', tipo: 'telefono' },
  { id: 'dedicacion', position: 2, question: '¿A qué te dedicás hoy?', tipo: 'texto' },
  {
    id: 'ingresos',
    position: 3,
    question: ' ¿Cuánto estás ganando por mes hoy?',
    tipo: 'opciones',
    opciones: [
      'No tengo ingresos',
      'Menos de $1.000 USD al mes',
      'De $1.000 a $2.000 USD al mes',
      'De $2.000 a $3.000 USD al mes',
      'Más de $3.000 USD al mes',
    ],
  },
  {
    id: 'urgencia',
    position: 4,
    question: '¿Qué tan pronto querés resolver los obstáculos que hoy te impiden alcanzar tu meta de ingresos?',
    tipo: 'opciones',
    opciones: [
      'Lo quiero resolver ya mismo',
      'En las próximas 2 a 4 semanas',
      'En los próximos meses',
      'Todavía no sé cuándo resolverlo',
    ],
  },
  {
    id: 'inversion',
    position: 5,
    question:
      '¿Cuánto dinero tenés disponible para invertir en aprender a vender Productos Digitales y generar $3.000 USD al mes haciéndolo?',
    tipo: 'opciones',
    opciones: [
      'Tengo menos de $500 USD (ahora no puedo conseguir)',
      'Tengo menos de $500 USD (pero puedo conseguir)',
      'Tengo entre $500 a $1.000 USD',
      'Tengo entre $1.000 a $2.000 USD',
      'Tengo más de $2.000 USD',
    ],
  },
  {
    id: 'decision',
    position: 6,
    question: '¿Existe alguien más que deba estar presente para tomar la decisión de hacerlo?',
    tipo: 'opciones',
    opciones: [
      'No, puedo tomar la decisión solo/a',
      'Sí, tengo que decidirlo con un familiar o amigo',
      'Sí, tengo que decidirlo con mi pareja',
    ],
  },
] as const satisfies readonly Pregunta[]

export type PreguntaId = (typeof PREGUNTAS)[number]['id']

export type RespuestaCalendly = { answer: string; position: number; question: string }

/** Arma el array questions_and_answers en el orden y con los textos exactos de Calendly. */
export function armarRespuestas(valores: Record<PreguntaId, string>, telefonoInternacional: string): RespuestaCalendly[] {
  return PREGUNTAS.map((p) => ({
    answer: p.tipo === 'telefono' ? telefonoInternacional : valores[p.id].trim(),
    position: p.position,
    question: p.question,
  }))
}
