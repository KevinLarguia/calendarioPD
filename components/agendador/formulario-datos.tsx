'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import { PREGUNTAS, type PreguntaId } from '@/lib/agendador/preguntas'
import { datosSchema, type DatosInput } from '@/lib/agendador/schema'
import { opcionesDePais } from '@/lib/agendador/telefono'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Props = {
  zona: string
  inicial: DatosInput | null
  prefill: { nombre: string; email: string; telefono: string }
  erroresServidor: Record<string, string> | null
  onContinuar: (datos: DatosInput) => void
}

type Errores = Partial<Record<string, string>>

const PAIS_POR_ZONA: Record<string, CountryCode> = {
  'America/Argentina': 'AR',
  'America/Mexico_City': 'MX',
  'America/Bogota': 'CO',
  'Europe/Madrid': 'ES',
  'America/Santiago': 'CL',
  'America/Lima': 'PE',
  'America/Montevideo': 'UY',
  'America/Guayaquil': 'EC',
  'America/Caracas': 'VE',
  'America/La_Paz': 'BO',
  'America/Asuncion': 'PY',
  'America/Sao_Paulo': 'BR',
}

function paisInicial(zona: string, telefono: string): CountryCode {
  const parsed = telefono ? parsePhoneNumberFromString(telefono) : undefined
  if (parsed?.country) return parsed.country
  const clave = Object.keys(PAIS_POR_ZONA).find((k) => zona.startsWith(k))
  return clave ? PAIS_POR_ZONA[clave] : 'AR'
}

export function FormularioDatos({ zona, inicial, prefill, erroresServidor, onContinuar }: Props) {
  const paises = useMemo(() => opcionesDePais(), [])
  const valores = {
    nombre: inicial?.nombre ?? prefill.nombre,
    email: inicial?.email ?? prefill.email,
    telefono: inicial?.telefono ?? prefill.telefono,
    respuestas: inicial?.respuestas ?? null,
  }
  const [pais, setPais] = useState<CountryCode>(() => (inicial?.pais as CountryCode | undefined) ?? paisInicial(zona, valores.telefono))
  const [errores, setErrores] = useState<Errores>(() => erroresServidor ?? {})
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (erroresServidor && Object.keys(erroresServidor).length > 0) {
      enfocarPrimerError(erroresServidor)
      return
    }
    formRef.current?.querySelector<HTMLElement>('input, select')?.focus()
  }, [erroresServidor])

  function continuar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const texto = (k: string) => String(fd.get(k) ?? '')
    const respuestas = Object.fromEntries(
      PREGUNTAS.filter((p) => p.tipo !== 'telefono').map((p) => [p.id, texto(`r_${p.id}`)]),
    ) as Record<Exclude<PreguntaId, 'telefono'>, string>

    const datos: DatosInput = {
      nombre: texto('nombre'),
      email: texto('email'),
      telefono: texto('telefono'),
      pais,
      timezone: zona,
      respuestas,
      sitio_web: texto('sitio_web'),
    }

    const local = datosSchema.safeParse(datos)
    if (!local.success) {
      const e2: Errores = {}
      for (const issue of local.error.issues) e2[issue.path.join('.')] = issue.message
      setErrores(e2)
      enfocarPrimerError(e2)
      return
    }
    setErrores({})
    onContinuar(datos)
  }

  function enfocarPrimerError(e2: Errores) {
    const clave = Object.keys(e2)[0]
    if (!clave) return
    const nombre = clave.startsWith('respuestas.') ? `r_${clave.slice('respuestas.'.length)}` : clave
    formRef.current?.querySelector<HTMLElement>(`[name="${nombre}"]`)?.focus()
  }

  const errorDe = (campo: string) => errores[campo]

  return (
    <form ref={formRef} onSubmit={continuar} noValidate className="relative flex flex-col gap-5 rounded-2xl border bg-card p-4 sm:p-6">
      <Campo id="nombre" etiqueta="Nombre y apellido" error={errorDe('nombre')}>
        <Input id="nombre" name="nombre" defaultValue={valores.nombre} autoComplete="name" maxLength={120} aria-invalid={Boolean(errorDe('nombre'))} />
      </Campo>

      <Campo id="email" etiqueta="Email" error={errorDe('email')}>
        <Input id="email" name="email" type="email" inputMode="email" defaultValue={valores.email} autoComplete="email" maxLength={200} aria-invalid={Boolean(errorDe('email'))} />
      </Campo>

      {PREGUNTAS.map((p) => {
        if (p.tipo === 'telefono') {
          return (
            <Campo key={p.id} id="telefono" etiqueta={p.question} error={errorDe('telefono')}>
              <div className="flex gap-2">
                <select
                  aria-label="País"
                  value={pais}
                  onChange={(e) => setPais(e.target.value as CountryCode)}
                  className="h-10 w-28 shrink-0 rounded-lg border border-input bg-surface-raised px-2 text-sm text-foreground outline-none focus-visible:border-gold-dark"
                >
                  {paises.map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.codigo} {o.prefijo}
                    </option>
                  ))}
                </select>
                <Input
                  id="telefono"
                  name="telefono"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  defaultValue={valores.telefono}
                  placeholder="Tu número con código de área"
                  aria-invalid={Boolean(errorDe('telefono'))}
                />
              </div>
            </Campo>
          )
        }
        const nombre = `r_${p.id}`
        const error = errorDe(`respuestas.${p.id}`)
        const valorPrevio = valores.respuestas?.[p.id] ?? ''
        if (p.tipo === 'texto') {
          return (
            <Campo key={p.id} id={nombre} etiqueta={p.question} error={error}>
              <Input
                id={nombre}
                name={nombre}
                defaultValue={valorPrevio}
                maxLength={p.id === 'instagram' ? 80 : 300}
                placeholder={p.id === 'instagram' ? '@tuusuario' : undefined}
                aria-invalid={Boolean(error)}
              />
            </Campo>
          )
        }
        return (
          <fieldset key={p.id} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm leading-snug font-medium text-pretty">{p.question.trim()}</legend>
            <div className="flex flex-col gap-2" role="radiogroup" aria-invalid={Boolean(error)}>
              {p.opciones.map((op) => (
                <label
                  key={op}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm has-checked:border-gold-light has-checked:bg-gold-light/10"
                >
                  <input
                    type="radio"
                    name={nombre}
                    value={op}
                    defaultChecked={valorPrevio === op}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--gold-light)]"
                  />
                  <span className="leading-snug">{op}</span>
                </label>
              ))}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </fieldset>
        )
      })}

      {/* Honeypot: oculto para personas, los bots lo completan. */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label htmlFor="sitio_web">Sitio web</label>
        <input id="sitio_web" name="sitio_web" type="text" tabIndex={-1} autoComplete="off" defaultValue={inicial?.sitio_web ?? ''} />
      </div>

      <Button type="submit" size="lg" className="w-full">
        Elegir horario <ArrowRight aria-hidden />
      </Button>
      <p className="text-center text-xs text-pretty text-muted-foreground">En el siguiente paso elegís el día y la hora de la llamada.</p>
    </form>
  )
}

function Campo({ id, etiqueta, error, children }: { id: string; etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={cn('text-sm leading-snug font-medium', error && 'text-destructive')}>
        {etiqueta.trim()}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
