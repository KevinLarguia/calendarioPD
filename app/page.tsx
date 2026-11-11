import { Suspense } from 'react'
import { Agendador } from '@/components/agendador/agendador'
import { Marca } from '@/components/agendador/marca'

export default function Pagina() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
      <header className="flex flex-col gap-4">
        <Marca />
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-[0.18em] text-gold-light uppercase">Llamada de Admisión</p>
          <h1 className="text-2xl leading-tight font-semibold text-balance sm:text-3xl">
            Agendá tu llamada
          </h1>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
            Completá tus datos y después elegí el día y la hora. Dura 30 minutos y es por videollamada. Te vamos a confirmar por WhatsApp.
          </p>
        </div>
      </header>
      <Suspense fallback={null}>
        <Agendador />
      </Suspense>
    </main>
  )
}
