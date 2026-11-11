'use client'

import { useActionState } from 'react'
import { entrar, type EstadoAccion } from '@/app/admin/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(entrar, { ok: true })
  return (
    <form action={accion} className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
      <h1 className="text-lg font-semibold">Panel del agendador</h1>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="secreto">Clave de administración</Label>
        <Input id="secreto" name="secreto" type="password" autoComplete="current-password" required />
      </div>
      {estado.mensaje && !estado.ok && (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensaje}
        </p>
      )}
      <Button type="submit" disabled={pendiente}>
        {pendiente ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}
