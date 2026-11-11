'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import type { ResultadoReserva, Slot, SlotsRespuesta } from '@/lib/agendador/tipos'
import { ZONA_DEFAULT, zonaDelNavegador, zonaValida } from '@/lib/agendador/zonas'
import { SelectorHorarios } from '@/components/agendador/selector-horarios'
import { Confirmacion } from '@/components/agendador/confirmacion'
import { Pasos } from '@/components/agendador/pasos'

const FormularioReserva = dynamic(
  () => import('@/components/agendador/formulario-reserva').then((m) => m.FormularioReserva),
  { ssr: false, loading: () => <p className="py-6 text-center text-sm text-muted-foreground">Cargando formulario…</p> },
)

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<SlotsRespuesta>)

type Paso = { n: 1 } | { n: 2; slot: Slot } | { n: 3; resultado: ResultadoReserva; slot: Slot | null }

export function Agendador() {
  const params = useSearchParams()
  // Arranca en la zona del negocio para que servidor y cliente rendericen igual; el efecto la ajusta al navegador.
  const [zona, setZona] = useState(ZONA_DEFAULT)
  const [paso, setPaso] = useState<Paso>({ n: 1 })
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    const z = params.get('tz')
    setZona(z && zonaValida(z) ? z : zonaDelNavegador())
  }, [params])

  const { data, error, isLoading, mutate } = useSWR('/api/slots', fetcher, {
    refreshInterval: paso.n === 1 ? 30_000 : 0,
    revalidateOnFocus: paso.n === 1,
  })

  const volverAHorarios = useCallback(
    (mensaje?: string) => {
      setAviso(mensaje ?? null)
      setPaso({ n: 1 })
      void mutate()
    },
    [mutate],
  )

  const alReservar = useCallback(
    (resultado: ResultadoReserva, slot: Slot) => {
      if (resultado.resultado === 'sin_cupo') {
        volverAHorarios('Ese horario se acaba de ocupar. Elegí otro, por favor.')
        return
      }
      if (resultado.resultado === 'inactivo') {
        volverAHorarios('El agendador está pausado en este momento. Probá de nuevo en unos minutos.')
        return
      }
      setPaso({ n: 3, resultado, slot })
    },
    [volverAHorarios],
  )

  return (
    <section className="flex flex-col gap-5" aria-live="polite">
      <Pasos actual={paso.n} />

      {paso.n === 1 && (
        <SelectorHorarios
          data={data}
          cargando={isLoading}
          error={Boolean(error)}
          zona={zona}
          onZona={setZona}
          aviso={aviso}
          onElegir={(slot) => {
            setAviso(null)
            setPaso({ n: 2, slot })
          }}
          onReintentar={() => void mutate()}
        />
      )}

      {paso.n === 2 && (
        <FormularioReserva
          slot={paso.slot}
          zona={zona}
          prefill={{
            nombre: params.get('nombre') ?? '',
            email: params.get('email') ?? '',
            telefono: params.get('telefono') ?? '',
          }}
          onVolver={() => setPaso({ n: 1 })}
          onResultado={(r) => alReservar(r, paso.slot)}
        />
      )}

      {paso.n === 3 && <Confirmacion resultado={paso.resultado} zona={zona} onVolver={() => volverAHorarios()} />}
    </section>
  )
}
