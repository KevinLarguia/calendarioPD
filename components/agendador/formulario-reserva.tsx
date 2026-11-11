'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import type { ResultadoReserva, Slot } from '@/lib/agendador/tipos'
import { PREGUNTAS, type PreguntaId } from '@/lib/agendador/preguntas'
import { reservaSchema } from '@/lib/agendador/schema'
import { opcionesDePais } from '@/lib/agendador/telefono'
import { etiquetaZona, formatearFechaLarga, formatearHora } from '@/lib/agendador/zonas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Props = {
  slot: Slot
  zona: string
  prefill: { nombre: string; email: string; telefono: string }
  onVolver: () => void
  onResultado: (r: ResultadoReserva) => void
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

export function FormularioReserva({ slot, zona, prefill, onVolver, onResultado }: Props) {
  const paises = useMemo(() => opcionesDePais(), [])
  const [pais, setPais] = useState<CountryCode>(() => paisInicial(zona, prefill.telefono))
  const [token, setToken] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    let activo = true
    fetch('/api/token', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { token: string }) => activo && setToken(d.token))
      .catch(() => activo && setErrorGeneral('No pudimos preparar el formulario. Recargá la página.'))
    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input, select')?.focus()
  }, [])

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enviando) return
    setErrorGeneral(null)

    const fd = new FormData(e.currentTarget)
    const texto = (k: string) => String(fd.get(k) ?? '')
    const respuestas = Object.fromEntries(
      PREGUNTAS.filter((p) => p.tipo !== 'telefono').map((p) => [p.id, texto(`r_${p.id}`)]),
    ) as Record<Exclude<PreguntaId, 'telefono'>, string>

    const cuerpo = {
      inicio: slot.inicio,
      nombre: texto('nombre'),
      email: texto('email'),
      telefono: texto('telefono'),
      pais,
      timezone: zona,
      respuestas,
      token: token ?? '',
      sitio_web: texto('sitio_web'),
    }

    const local = reservaSchema.safeParse(cuerpo)
    if (!local.success) {
      const e2: Errores = {}
      for (const issue of local.error.issues) e2[issue.path.join('.')] = issue.message
      if (!token) e2.token = 'Esperá un segundo y volvé a intentar.'
      setErrores(e2)
      enfocarPrimerError(e2)
      return
    }

    setEnviando(true)
    try {
      const res = await fetch('/api/reservar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const data = (await res.json()) as ResultadoReserva
      if (data.resultado === 'invalido') {
        const e2 = data.campos ?? { general: 'Revisá los datos e intentá de nuevo.' }
        setErrores(e2)
        setErrorGeneral(e2.token ?? e2.general ?? null)
        enfocarPrimerError(e2)
        if (e2.token) {
          const nuevo = await fetch('/api/token', { cache: 'no-store' }).then((r) => r.json())
          setToken(nuevo.token)
        }
        return
      }
      if (data.resultado === 'rate_limit') {
        setErrorGeneral(
          data.motivo === 'email'
            ? 'Ya recibimos varios intentos con este email. Esperá unos minutos.'
            : 'Recibimos demasiados intentos desde tu conexión. Esperá unos minutos y volvé a probar.',
        )
        return
      }
      onResultado(data)
    } catch {
      setErrorGeneral('No pudimos enviar tu reserva. Revisá tu conexión e intentá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  function enfocarPrimerError(e2: Errores) {
    const clave = Object.keys(e2)[0]
    if (!clave) return
    const nombre = clave.startsWith('respuestas.') ? `r_${clave.slice('respuestas.'.length)}` : clave
    formRef.current?.querySelector<HTMLElement>(`[name="${nombre}"]`)?.focus()
  }

  const errorDe = (campo: string) => errores[campo]

  return (
    <form ref={formRef} onSubmit={enviar} noValidate className="relative flex flex-col gap-5 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">Horario elegido</p>
          <p className="text-sm font-semibold">
            {formatearFechaLarga(slot.inicio, zona)} · {formatearHora(slot.inicio, zona)} hs
          </p>
          <p className="text-xs text-muted-foreground">{etiquetaZona(zona, slot.inicio)}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onVolver} className="shrink-0">
          <ArrowLeft aria-hidden /> Cambiar
        </Button>
      </div>

      <div className="h-px bg-border" />

      <Campo id="nombre" etiqueta="Nombre y apellido" error={errorDe('nombre')}>
        <Input id="nombre" name="nombre" defaultValue={prefill.nombre} autoComplete="name" maxLength={120} aria-invalid={Boolean(errorDe('nombre'))} />
      </Campo>

      <Campo id="email" etiqueta="Email" error={errorDe('email')}>
        <Input id="email" name="email" type="email" inputMode="email" defaultValue={prefill.email} autoComplete="email" maxLength={200} aria-invalid={Boolean(errorDe('email'))} />
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
                  defaultValue={prefill.telefono}
                  placeholder="Tu número con código de área"
                  aria-invalid={Boolean(errorDe('telefono'))}
                />
              </div>
            </Campo>
          )
        }
        const nombre = `r_${p.id}`
        const error = errorDe(`respuestas.${p.id}`)
        if (p.tipo === 'texto') {
          return (
            <Campo key={p.id} id={nombre} etiqueta={p.question} error={error}>
              <Input id={nombre} name={nombre} maxLength={p.id === 'instagram' ? 80 : 300} placeholder={p.id === 'instagram' ? '@tuusuario' : undefined} aria-invalid={Boolean(error)} />
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
                  <input type="radio" name={nombre} value={op} className="mt-0.5 size-4 shrink-0 accent-[var(--gold-light)]" />
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
        <input id="sitio_web" name="sitio_web" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {errorGeneral && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorGeneral}
        </p>
      )}

      <Button type="submit" size="lg" disabled={enviando} className="w-full">
        {enviando ? (
          <>
            <Loader2 className="animate-spin" aria-hidden /> Agendando…
          </>
        ) : (
          'Confirmar llamada'
        )}
      </Button>
      <p className="text-center text-xs text-pretty text-muted-foreground">Al confirmar vas a recibir un WhatsApp con los datos de la llamada.</p>
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
