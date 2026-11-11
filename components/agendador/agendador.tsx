'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import type { ResultadoReserva, Slot, SlotsRespuesta } from '@/lib/agendador/tipos'
import type { DatosInput } from '@/lib/agendador/schema'
import { ZONA_DEFAULT } from '@/lib/agendador/zonas'
import { SelectorHorarios } from '@/components/agendador/selector-horarios'
import { Confirmacion } from '@/components/agendador/confirmacion'
import { Pasos } from '@/components/agendador/pasos'

const FormularioDatos = dynamic(
  () => import('@/components/agendador/formulario-datos').then((m) => m.FormularioDatos),
  { ssr: false, loading: () => <p className="py-6 text-center text-sm text-muted-foreground">Cargando formulario…</p> },
)

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<SlotsRespuesta>)

type Paso =
  | { n: 1; erroresServidor: Record<string, string> | null }
  | { n: 2; datos: DatosInput }
  | { n: 3; resultado: ResultadoReserva; datos: DatosInput }

async function pedirToken(): Promise<string> {
  const r = await fetch('/api/token', { cache: 'no-store' })
  const d = (await r.json()) as { token: string }
  return d.token
}

export function Agendador() {
  const params = useSearchParams()
  // Los horarios se muestran siempre en la zona del negocio (Buenos Aires); el lead no la puede cambiar.
  const zona = ZONA_DEFAULT
  const [paso, setPaso] = useState<Paso>({ n: 1, erroresServidor: null })
  const [datosGuardados, setDatosGuardados] = useState<DatosInput | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviandoInicio, setEnviandoInicio] = useState<string | null>(null)
  // El token se pide al entrar: tiene que tener al menos unos segundos de vida al reservar.
  const token = useRef<string | null>(null)

  useEffect(() => {
    let activo = true
    pedirToken()
      .then((t) => {
        if (activo) token.current = t
      })
      .catch(() => {
        if (activo) setAviso('No pudimos preparar el formulario. Recargá la página.')
      })
    return () => {
      activo = false
    }
  }, [])

  const { data, error, isLoading, mutate } = useSWR('/api/slots', fetcher, {
    refreshInterval: paso.n === 2 ? 30_000 : 0,
    revalidateOnFocus: paso.n === 2,
  })

  const irAHorarios = useCallback(
    (datos: DatosInput, mensaje?: string) => {
      setAviso(mensaje ?? null)
      setPaso({ n: 2, datos })
      void mutate()
    },
    [mutate],
  )

  const reservar = useCallback(
    async (slot: Slot, datos: DatosInput) => {
      if (enviandoInicio) return
      setAviso(null)
      setEnviandoInicio(slot.inicio)
      try {
        if (!token.current) token.current = await pedirToken()
        const res = await fetch('/api/reservar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...datos, inicio: slot.inicio, token: token.current }),
        })
        const r = (await res.json()) as ResultadoReserva

        if (r.resultado === 'invalido') {
          const campos = r.campos ?? {}
          if (campos.token) {
            token.current = await pedirToken()
            setAviso('Esperá un segundo y volvé a elegir el horario.')
            return
          }
          if (campos.inicio) {
            setAviso('Ese horario ya no está disponible. Elegí otro, por favor.')
            void mutate()
            return
          }
          const deDatos = Object.fromEntries(Object.entries(campos).filter(([k]) => k !== 'general' && k !== 'sitio_web'))
          if (Object.keys(deDatos).length > 0) {
            setPaso({ n: 1, erroresServidor: deDatos })
            return
          }
          setAviso(campos.general ?? 'Revisá los datos e intentá de nuevo.')
          return
        }
        if (r.resultado === 'rate_limit') {
          setAviso(
            r.motivo === 'email'
              ? 'Ya recibimos varios intentos con este email. Esperá unos minutos.'
              : 'Recibimos demasiados intentos desde tu conexión. Esperá unos minutos y volvé a probar.',
          )
          return
        }
        if (r.resultado === 'sin_cupo') {
          setAviso('Ese horario se acaba de ocupar. Elegí otro, por favor.')
          void mutate()
          return
        }
        if (r.resultado === 'inactivo') {
          setAviso('El agendador está pausado en este momento. Probá de nuevo en unos minutos.')
          return
        }
        setPaso({ n: 3, resultado: r, datos })
      } catch {
        setAviso('No pudimos enviar tu reserva. Revisá tu conexión e intentá de nuevo.')
      } finally {
        setEnviandoInicio(null)
      }
    },
    [enviandoInicio, mutate],
  )

  return (
    <section className="flex flex-col gap-5" aria-live="polite">
      <Pasos actual={paso.n} />

      {paso.n === 1 && (
        <FormularioDatos
          zona={zona}
          inicial={datosGuardados}
          prefill={{
            nombre: params.get('nombre') ?? '',
            email: params.get('email') ?? '',
            telefono: params.get('telefono') ?? '',
          }}
          erroresServidor={paso.erroresServidor}
          onContinuar={(datos) => {
            setDatosGuardados(datos)
            irAHorarios(datos)
          }}
        />
      )}

      {paso.n === 2 && (
        <SelectorHorarios
          data={data}
          cargando={isLoading}
          error={Boolean(error)}
          zona={zona}
          aviso={aviso}
          resumen={{ nombre: paso.datos.nombre, email: paso.datos.email }}
          enviandoInicio={enviandoInicio}
          onElegir={(slot) => void reservar(slot, paso.datos)}
          onCambiarDatos={() => {
            setAviso(null)
            setPaso({ n: 1, erroresServidor: null })
          }}
          onReintentar={() => void mutate()}
        />
      )}

      {paso.n === 3 && <Confirmacion resultado={paso.resultado} zona={zona} onVolver={() => irAHorarios(paso.datos)} />}
    </section>
  )
}
