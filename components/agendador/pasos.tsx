import { cn } from '@/lib/utils'

const PASOS = ['Horario', 'Tus datos', 'Confirmación']

export function Pasos({ actual }: { actual: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Progreso">
      {PASOS.map((nombre, i) => {
        const n = i + 1
        const hecho = n < actual
        const activo = n === actual
        return (
          <li key={nombre} className="flex items-center gap-2">
            <span
              aria-current={activo ? 'step' : undefined}
              className={cn(
                'flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-medium tabular-nums',
                activo && 'bg-gold-light text-ink',
                hecho && 'bg-green/20 text-green',
                !activo && !hecho && 'bg-surface-raised text-muted-foreground',
              )}
            >
              {n}
            </span>
            <span className={cn('hidden sm:inline', activo ? 'text-foreground' : 'text-muted-foreground')}>{nombre}</span>
            {n < PASOS.length && <span aria-hidden className="h-px w-5 bg-border sm:w-8" />}
          </li>
        )
      })}
    </ol>
  )
}
