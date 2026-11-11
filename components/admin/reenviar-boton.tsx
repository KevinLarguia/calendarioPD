'use client'

import { useState, useTransition } from 'react'
import { reenviarReserva } from '@/app/admin/actions'
import type { Reserva } from '@/lib/agendador/tipos'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function ReenviarBoton({ reserva }: { reserva: Reserva }) {
  const [abierto, setAbierto] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  function confirmar() {
    iniciar(async () => {
      const r = await reenviarReserva(reserva.id)
      setMensaje(r.mensaje ?? null)
      if (r.ok) setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Reenviar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Reenviar esta agenda a n8n?</DialogTitle>
          <DialogDescription className="text-pretty">
            Si la primera vez n8n sí la recibió, el lead va a recibir <strong>dos veces</strong> la secuencia de WhatsApp
            y la agenda puede quedar duplicada en el CRM. Antes de reenviar, revisá que {reserva.nombre} no figure en
            agendas_final.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Motivo registrado: {reserva.ultimo_error ?? 'sin detalle'} · intentos: {reserva.intentos}
        </p>
        {mensaje && (
          <p role="alert" className="text-sm text-destructive">
            {mensaje}
          </p>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => setAbierto(false)} disabled={pendiente}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={pendiente}>
            {pendiente ? 'Encolando…' : 'Sí, reenviar una vez'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
