import Link from 'next/link'
import { Marca } from '@/components/agendador/marca'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Cambiar tu llamada | ProductosDigitales.io', robots: { index: false, follow: false } }

/**
 * Destino de los enlaces cancel_url / reschedule_url / invitee uri que mandamos a n8n.
 * No cancelan ni reagendan nada: le piden al lead que escriba por WhatsApp.
 */
export default async function PaginaRespaldo({ params }: { params: Promise<{ ruta: string[] }> }) {
  const { ruta } = await params
  const tipo = ruta[0]
  const titulo =
    tipo === 'cancellations'
      ? 'Para cancelar tu llamada'
      : tipo === 'reschedulings'
        ? 'Para cambiar el horario de tu llamada'
        : 'Tu llamada de admisión'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
      <Marca />
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
        <h1 className="text-xl font-semibold text-balance">{titulo}</h1>
        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
          Respondé el mensaje de WhatsApp que te enviamos al agendar y el equipo lo gestiona por vos. Si todavía no lo
          recibiste, podés agendar un nuevo horario.
        </p>
        <Button asChild variant="secondary" className="w-full sm:w-auto">
          <Link href="/">Ver horarios</Link>
        </Button>
      </div>
    </main>
  )
}
