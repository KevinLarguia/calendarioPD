'use client'

import { useEffect, useState } from 'react'
import { CalendarCheck, CalendarClock } from 'lucide-react'
import type { ResultadoReserva } from '@/lib/agendador/tipos'
import { etiquetaZona, formatearFechaLarga, formatearHora } from '@/lib/agendador/zonas'
import { Button } from '@/components/ui/button'

export const URL_GRACIAS = 'https://www.productosdigitales.io/gracias-por-agendar'
const SEGUNDOS_REDIRECT = 3

export function Confirmacion({ resultado, zona, onVolver }: { resultado: ResultadoReserva; zona: string; onVolver: () => void }) {
  if (resultado.resultado === 'ok') return <Agendada inicio={resultado.inicio} zona={zona} />
  if (resultado.resultado === 'ya_agendado') return <YaAgendada inicio={resultado.inicio} zona={zona} />
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-6 text-center">
      <p className="text-sm text-muted-foreground">No pudimos completar la reserva.</p>
      <Button variant="secondary" onClick={onVolver}>
        Volver a los horarios
      </Button>
    </div>
  )
}

function Agendada({ inicio, zona }: { inicio: string; zona: string }) {
  const [restantes, setRestantes] = useState(SEGUNDOS_REDIRECT)

  useEffect(() => {
    const t = setInterval(() => setRestantes((r) => Math.max(0, r - 1)), 1000)
    const r = setTimeout(() => window.location.assign(URL_GRACIAS), SEGUNDOS_REDIRECT * 1000)
    return () => {
      clearInterval(t)
      clearTimeout(r)
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border bg-card p-6 text-center sm:p-8">
      <span className="flex size-14 items-center justify-center rounded-full bg-green/15 text-green">
        <CalendarCheck className="size-7" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-balance">Tu llamada quedó agendada</h2>
        <p className="text-sm text-muted-foreground">Te vamos a escribir por WhatsApp para confirmarla.</p>
      </div>
      <FechaDestacada inicio={inicio} zona={zona} />
      <Button asChild size="lg" className="w-full sm:w-auto">
        <a href={URL_GRACIAS}>Continuar</a>
      </Button>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Te llevamos a la siguiente página en {restantes} s…
      </p>
    </div>
  )
}

function YaAgendada({ inicio, zona }: { inicio: string; zona: string }) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border bg-card p-6 text-center sm:p-8">
      <span className="flex size-14 items-center justify-center rounded-full bg-gold-dark/20 text-gold-light">
        <CalendarClock className="size-7" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-balance">Ya tenés una llamada agendada</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Encontramos una llamada a tu nombre. No hace falta que agendes otra: te esperamos en este horario.
        </p>
      </div>
      <FechaDestacada inicio={inicio} zona={zona} />
      <p className="text-xs text-pretty text-muted-foreground">Si necesitás cambiar el horario, respondé el WhatsApp de confirmación.</p>
    </div>
  )
}

function FechaDestacada({ inicio, zona }: { inicio: string; zona: string }) {
  return (
    <div className="flex w-full flex-col gap-0.5 rounded-xl bg-surface-raised px-4 py-3">
      <p className="text-base font-semibold">{formatearFechaLarga(inicio, zona)}</p>
      <p className="text-2xl font-semibold tabular-nums text-gold-light">{formatearHora(inicio, zona)} hs</p>
      <p className="text-xs text-muted-foreground">{etiquetaZona(zona, inicio)}</p>
    </div>
  )
}
