import Link from 'next/link'
import type { EstadoEnvio } from '@/lib/agendador/tipos'
import { ESTADOS_ENVIO } from '@/lib/admin/datos'
import { cn } from '@/lib/utils'

const COLOR: Record<EstadoEnvio, string> = {
  pendiente: 'text-muted-foreground',
  enviando: 'text-gold-light',
  enviado: 'text-gold-light',
  verificado: 'text-green',
  revisar: 'text-destructive',
  error: 'text-destructive',
}

export function Contadores({
  contadores,
  pruebas,
  filtro,
}: {
  contadores: Record<EstadoEnvio, number>
  pruebas: number
  filtro: EstadoEnvio | null
}) {
  const total = Object.values(contadores).reduce((a, b) => a + b, 0)
  return (
    <section aria-label="Contadores por estado" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Link
          href="/admin"
          className={cn('flex flex-col rounded-xl border bg-card px-3 py-2.5', !filtro && 'border-gold-dark')}
        >
          <span className="text-xs text-muted-foreground">Todas</span>
          <span className="text-xl font-semibold tabular-nums">{total}</span>
        </Link>
        {ESTADOS_ENVIO.map((e) => (
          <Link
            key={e}
            href={`/admin?estado=${e}`}
            className={cn('flex flex-col rounded-xl border bg-card px-3 py-2.5', filtro === e && 'border-gold-dark')}
          >
            <span className="text-xs text-muted-foreground capitalize">{e}</span>
            <span className={cn('text-xl font-semibold tabular-nums', COLOR[e])}>{contadores[e]}</span>
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {pruebas} reservas marcadas como prueba (es_prueba). Se borran con <code>scripts/db/limpiar-pruebas.mjs</code>.
      </p>
    </section>
  )
}
