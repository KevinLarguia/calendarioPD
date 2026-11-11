import { parsePhoneNumberFromString, getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js'

export type TelefonoNormalizado = { e164: string; internacional: string; pais: CountryCode }

/** Valida y normaliza el teléfono. Devuelve null si no es un número posible y válido. */
export function normalizarTelefono(valor: string, pais: string): TelefonoNormalizado | null {
  const codigo = pais.toUpperCase() as CountryCode
  if (!getCountries().includes(codigo)) return null
  const parsed = parsePhoneNumberFromString(valor, codigo)
  if (!parsed || !parsed.isValid()) return null
  return {
    e164: parsed.number,
    internacional: parsed.formatInternational(),
    pais: parsed.country ?? codigo,
  }
}

const NOMBRES_PAIS = new Intl.DisplayNames(['es'], { type: 'region' })

export type OpcionPais = { codigo: CountryCode; nombre: string; prefijo: string }

/** Lista de países ordenada por nombre en español, con los de habla hispana al principio. */
export function opcionesDePais(): OpcionPais[] {
  const prioridad: CountryCode[] = ['AR', 'MX', 'CO', 'ES', 'CL', 'PE', 'UY', 'EC', 'VE', 'BO', 'PY', 'US', 'GT', 'DO', 'CR', 'PA', 'HN', 'SV', 'NI', 'CU', 'PR', 'BR']
  const todos = getCountries().map((codigo) => ({
    codigo,
    nombre: NOMBRES_PAIS.of(codigo) ?? codigo,
    prefijo: `+${getCountryCallingCode(codigo)}`,
  }))
  const primero = prioridad.map((c) => todos.find((t) => t.codigo === c)).filter((t): t is OpcionPais => Boolean(t))
  const resto = todos.filter((t) => !prioridad.includes(t.codigo)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return [...primero, ...resto]
}
