'use client'

import { useActionState } from 'react'
import { guardarCloser, type EstadoAccion } from '@/app/admin/actions'
import type { Closer } from '@/lib/agendador/tipos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function ClosersForm({ closers }: { closers: Closer[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <h2 className="text-base font-semibold">Closers</h2>
      <p className="text-xs text-pretty text-muted-foreground">
        El nombre tiene que ser exactamente el que manda Calendly (así lo ve n8n). Los alias sirven para reconocer
        variantes históricas en agendas_final (separados por coma).
      </p>
      <div className="flex flex-col gap-3">
        {closers.map((c) => (
          <FilaCloser key={c.id} closer={c} />
        ))}
        <FilaCloser closer={null} />
      </div>
    </section>
  )
}

function FilaCloser({ closer }: { closer: Closer | null }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(guardarCloser, { ok: true })
  return (
    <form action={accion} className={cn('flex flex-col gap-2 rounded-xl border p-3', !closer && 'border-dashed')}>
      {closer && <input type="hidden" name="id" value={closer.id} />}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_4rem_4rem]">
        <Input name="nombre" placeholder="Nombre exacto" defaultValue={closer?.nombre ?? ''} required aria-label="Nombre" />
        <Input name="email" type="email" placeholder="Email" defaultValue={closer?.email ?? ''} aria-label="Email" />
        <Input name="orden" type="number" defaultValue={closer?.orden ?? 0} aria-label="Orden" />
        <label className="flex items-center justify-center gap-1.5 rounded-lg border text-xs">
          <input type="checkbox" name="activo" defaultChecked={closer?.activo ?? true} className="size-4 accent-[var(--gold-light)]" />
          activo
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="zoom_link" type="url" placeholder="Zoom link (opcional)" defaultValue={closer?.zoom_link ?? ''} aria-label="Zoom link" />
        <Input name="aliases" placeholder="Alias, separados por coma" defaultValue={closer?.aliases.join(', ') ?? ''} aria-label="Alias" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-xs', estado.ok ? 'text-green' : 'text-destructive')} role="status">
          {estado.mensaje ?? ''}
        </span>
        <Button type="submit" size="sm" variant={closer ? 'secondary' : 'default'} disabled={pendiente}>
          {pendiente ? 'Guardando…' : closer ? 'Guardar' : 'Agregar closer'}
        </Button>
      </div>
    </form>
  )
}
