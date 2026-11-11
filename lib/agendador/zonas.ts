import type { Slot } from '@/lib/agendador/tipos'

export const ZONA_DEFAULT = 'America/Argentina/Buenos_Aires'

export function zonaDelNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ZONA_DEFAULT
  } catch {
    return ZONA_DEFAULT
  }
}

export function zonasDisponibles(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [ZONA_DEFAULT, 'America/Mexico_City', 'America/Bogota', 'Europe/Madrid', 'America/Santiago', 'America/Lima']
  }
}

export function zonaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona })
    return true
  } catch {
    return false
  }
}

/** Clave de día local (YYYY-MM-DD) en la zona dada. */
export function claveDia(iso: string, zona: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(iso),
  )
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  return `${v('year')}-${v('month')}-${v('day')}`
}

export function formatearHora(iso: string, zona: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

export function formatearDiaCorto(iso: string, zona: string): { diaSemana: string; diaNumero: string; mes: string } {
  const f = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { timeZone: zona, ...opts }).format(new Date(iso))
  return {
    diaSemana: f({ weekday: 'short' }).replace('.', ''),
    diaNumero: f({ day: 'numeric' }),
    mes: f({ month: 'short' }).replace('.', ''),
  }
}

export function formatearFechaLarga(iso: string, zona: string): string {
  const texto = new Intl.DateTimeFormat('es-AR', { timeZone: zona, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function etiquetaZona(zona: string, iso: string = new Date().toISOString()): string {
  try {
    const partes = new Intl.DateTimeFormat('es-AR', { timeZone: zona, timeZoneName: 'shortOffset' }).formatToParts(new Date(iso))
    const offset = partes.find((p) => p.type === 'timeZoneName')?.value ?? ''
    return `${zona.replace(/_/g, ' ')} (${offset})`
  } catch {
    return zona
  }
}

export type DiaConSlots = { clave: string; iso: string; slots: Slot[] }

export function agruparPorDia(slots: Slot[], zona: string): DiaConSlots[] {
  const mapa = new Map<string, DiaConSlots>()
  for (const s of slots) {
    const clave = claveDia(s.inicio, zona)
    const dia = mapa.get(clave)
    if (dia) dia.slots.push(s)
    else mapa.set(clave, { clave, iso: s.inicio, slots: [s] })
  }
  return [...mapa.values()].sort((a, b) => a.clave.localeCompare(b.clave))
}
