'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { etiquetaZona, zonasDisponibles } from '@/lib/agendador/zonas'

const noSuscribir = () => () => {}

export function SelectorZona({ id, valor, onCambio }: { id: string; valor: string; onCambio: (z: string) => void }) {
  // Las etiquetas con offset dependen de la ICU del navegador: se listan solo en el cliente para no romper la hidratación.
  const hidratado = useSyncExternalStore(noSuscribir, () => true, () => false)

  const zonas = useMemo(() => {
    if (!hidratado) return [valor]
    const lista = zonasDisponibles()
    return lista.includes(valor) ? lista : [valor, ...lista]
  }, [valor, hidratado])

  return (
    <select
      id={id}
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      className="h-10 w-full rounded-lg border border-input bg-surface-raised px-3 text-sm text-foreground outline-none focus-visible:border-gold-dark"
    >
      {zonas.map((z) => (
        <option key={z} value={z}>
          {hidratado ? etiquetaZona(z) : z.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  )
}
