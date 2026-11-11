import type { EstadoEnvio, Reserva } from '@/lib/agendador/tipos'
import { ReenviarBoton } from '@/components/admin/reenviar-boton'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const fmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const VARIANTE: Record<EstadoEnvio, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendiente: 'outline',
  enviando: 'secondary',
  enviado: 'secondary',
  verificado: 'default',
  revisar: 'destructive',
  error: 'destructive',
}

export function TablaReservas({ reservas, filtro }: { reservas: Reserva[]; filtro: EstadoEnvio | null }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Reservas {filtro ? `· ${filtro}` : ''}</h2>
        <span className="text-xs text-muted-foreground">Últimas {reservas.length} · horarios en ART</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Llamada</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Closer</TableHead>
              <TableHead>Envío</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Sin reservas en este estado.
                </TableCell>
              </TableRow>
            )}
            {reservas.map((r) => (
              <TableRow key={r.id} className={r.estado === 'cancelada' ? 'opacity-50' : undefined}>
                <TableCell className="whitespace-nowrap tabular-nums">{fmt.format(new Date(r.inicio))}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{r.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.email} · {r.telefono_e164}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.closer}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={VARIANTE[r.estado_envio]}>{r.estado_envio}</Badge>
                    {r.es_prueba && <Badge variant="outline">prueba</Badge>}
                    {r.intentos > 0 && <span className="text-xs text-muted-foreground">×{r.intentos}</span>}
                  </div>
                </TableCell>
                <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={r.ultimo_error ?? ''}>
                  {r.ultimo_error ?? ''}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{fmt.format(new Date(r.created_at))}</TableCell>
                <TableCell className="text-right">
                  {(r.estado_envio === 'revisar' || r.estado_envio === 'error') && <ReenviarBoton reserva={r} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
