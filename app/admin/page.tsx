import Link from 'next/link'
import { redirect } from 'next/navigation'
import { esAdmin } from '@/lib/admin/sesion'
import { cargarDatosAdmin, ESTADOS_ENVIO } from '@/lib/admin/datos'
import type { EstadoEnvio } from '@/lib/agendador/tipos'
import { env } from '@/lib/env'
import { salir } from '@/app/admin/actions'
import { Marca } from '@/components/agendador/marca'
import { Contadores } from '@/components/admin/contadores'
import { TablaReservas } from '@/components/admin/tabla-reservas'
import { ConfigForm } from '@/components/admin/config-form'
import { ClosersForm } from '@/components/admin/closers-form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Admin | Agendador', robots: { index: false, follow: false } }

export default async function PaginaAdmin({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  if (!(await esAdmin())) redirect('/admin/login')
  const { estado } = await searchParams
  const filtro = ESTADOS_ENVIO.includes(estado as EstadoEnvio) ? (estado as EstadoEnvio) : null
  const datos = await cargarDatosAdmin(filtro)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Marca />
          <Badge variant={env.modo === 'prod' ? 'default' : 'secondary'}>modo {env.modo}</Badge>
          {!datos.config.activo && <Badge variant="destructive">agendador pausado</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/" target="_blank">
              Ver agendador
            </Link>
          </Button>
          <form action={salir}>
            <Button type="submit" variant="secondary" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </header>

      <Contadores contadores={datos.contadores} pruebas={datos.pruebas} filtro={filtro} />

      <TablaReservas reservas={datos.reservas} filtro={filtro} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ConfigForm config={datos.config} />
        <ClosersForm closers={datos.closers} />
      </div>
    </main>
  )
}
