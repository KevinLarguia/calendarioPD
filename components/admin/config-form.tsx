'use client'

import { useActionState } from 'react'
import { guardarConfig, type EstadoAccion } from '@/app/admin/actions'
import type { Config } from '@/lib/agendador/tipos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const DIAS = [
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mié'],
  [4, 'Jue'],
  [5, 'Vie'],
  [6, 'Sáb'],
  [7, 'Dom'],
] as const

export function ConfigForm({ config }: { config: Config }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(guardarConfig, { ok: true })
  const hora = (v: string) => v.slice(0, 5)

  return (
    <form action={accion} className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Configuración</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activo" defaultChecked={config.activo} className="size-4 accent-[var(--gold-light)]" />
          Agendador activo
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Días</legend>
        <div className="flex flex-wrap gap-2">
          {DIAS.map(([n, etiqueta]) => (
            <label key={n} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm has-checked:border-gold-light">
              <input type="checkbox" name="dias_semana" value={n} defaultChecked={config.dias_semana.includes(n)} className="size-4 accent-[var(--gold-light)]" />
              {etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CampoNum id="hora_primera" etiqueta="Primera hora" tipo="time" valor={hora(config.hora_primera)} />
        <CampoNum id="hora_ultima" etiqueta="Último inicio" tipo="time" valor={hora(config.hora_ultima)} />
        <CampoNum id="paso_min" etiqueta="Paso (min)" valor={config.paso_min} />
        <CampoNum id="duracion_min" etiqueta="Duración (min)" valor={config.duracion_min} />
        <CampoNum id="aviso_min_minutos" etiqueta="Aviso mínimo (min)" valor={config.aviso_min_minutos} />
        <CampoNum id="dias_adelante" etiqueta="Días adelante" valor={config.dias_adelante} />
        <CampoNum id="envios_por_minuto" etiqueta="Envíos por minuto" valor={config.envios_por_minuto} />
        <CampoNum id="limite_ip_10min" etiqueta="Límite por IP / 10 min" valor={config.limite_ip_10min} />
        <CampoNum id="limite_email_10min" etiqueta="Límite por email / 10 min" valor={config.limite_email_10min} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoNum id="zona" etiqueta="Zona (IANA)" tipo="text" valor={config.zona} />
        <CampoNum id="utm_source" etiqueta="utm_source" tipo="text" valor={config.utm_source} />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="evento_nombre">Nombre del evento</Label>
          <Input id="evento_nombre" name="evento_nombre" defaultValue={config.evento_nombre} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className={cn('text-sm', estado.ok ? 'text-green' : 'text-destructive')} role="status">
          {estado.mensaje ?? ''}
        </p>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

function CampoNum({ id, etiqueta, valor, tipo = 'number' }: { id: string; etiqueta: string; valor: string | number; tipo?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {etiqueta}
      </Label>
      <Input id={id} name={id} type={tipo} defaultValue={valor} />
    </div>
  )
}
