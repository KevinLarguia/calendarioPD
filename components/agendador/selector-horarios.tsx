'use client'

import { useEffect, useMemo, useState } from 'react'
import { Globe, RefreshCw } from 'lucide-react'
import type { Slot, SlotsRespuesta } from '@/lib/agendador/tipos'
import { agruparPorDia, formatearDiaCorto, formatearFechaLarga, formatearHora } from '@/lib/agendador/zonas'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  data: SlotsRespuesta | undefined
  cargando: boolean
  error: boolean
  zona: string
  aviso: string | null
  onElegir: (slot: Slot) => void
  onReintentar: () => void
}

export function SelectorHorarios({ data, cargando, error, zona, aviso, onElegir, onReintentar }: Props) {
  const dias = useMemo(() => agruparPorDia(data?.slots ?? [], zona), [data, zona])
  const [diaActivo, setDiaActivo] = useState<string | null>(null)

  useEffect(() => {
    if (dias.length === 0) {
      setDiaActivo(null)
      return
    }
    if (!diaActivo || !dias.some((d) => d.clave === diaActivo)) setDiaActivo(dias[0].clave)
  }, [dias, diaActivo])

  const dia = dias.find((d) => d.clave === diaActivo) ?? null

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-6">
      {aviso && (
        <p role="status" className="rounded-lg border border-gold-dark/40 bg-gold-dark/10 px-3 py-2 text-sm text-gold-light">
          {aviso}
        </p>
      )}

      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Globe className="size-3.5" aria-hidden />
        Horarios en hora de Buenos Aires (Argentina)
      </p>

      {cargando && !data && <EsqueletoHorarios />}

      {error && !data && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">No pudimos cargar los horarios.</p>
          <Button variant="secondary" size="sm" onClick={onReintentar}>
            <RefreshCw aria-hidden /> Reintentar
          </Button>
        </div>
      )}

      {data && data.activo === false && (
        <p className="py-8 text-center text-sm text-muted-foreground">El agendador está pausado en este momento.</p>
      )}

      {data && data.activo && dias.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No quedan horarios disponibles en los próximos días.</p>
      )}

      {dias.length > 0 && (
        <>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Días disponibles">
            <div className="flex gap-2">
              {dias.map((d) => {
                const f = formatearDiaCorto(d.iso, zona)
                const activo = d.clave === diaActivo
                return (
                  <button
                    key={d.clave}
                    role="tab"
                    type="button"
                    aria-selected={activo}
                    onClick={() => setDiaActivo(d.clave)}
                    className={cn(
                      'flex min-w-16 shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-center transition-colors',
                      activo
                        ? 'border-gold-light bg-gold-light text-ink'
                        : 'border-border bg-surface-raised text-foreground hover:border-gold-dark/60',
                    )}
                  >
                    <span className={cn('text-[11px] uppercase', activo ? 'text-ink/70' : 'text-muted-foreground')}>{f.diaSemana}</span>
                    <span className="text-lg leading-tight font-semibold tabular-nums">{f.diaNumero}</span>
                    <span className={cn('text-[11px]', activo ? 'text-ink/70' : 'text-muted-foreground')}>{f.mes}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {dia && (
            <div className="flex flex-col gap-3" role="tabpanel">
              <p className="text-sm font-medium">{formatearFechaLarga(dia.iso, zona)}</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {dia.slots.map((s) => (
                  <li key={s.inicio}>
                    <button
                      type="button"
                      onClick={() => onElegir(s)}
                      className="flex w-full items-center justify-center rounded-lg border border-border bg-surface-raised py-3 text-sm font-medium tabular-nums transition-colors hover:border-gold-light hover:text-gold-light focus-visible:border-gold-light"
                    >
                      {formatearHora(s.inicio, zona)}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Duración: {data?.duracion_min ?? 30} minutos.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EsqueletoHorarios() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 min-w-16 animate-pulse rounded-xl bg-surface-raised" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-raised" />
        ))}
      </div>
    </div>
  )
}
