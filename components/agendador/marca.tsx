import Image from 'next/image'

// El PNG trae isotipo dorado + nombre en blanco (3491×730), pensado para fondo oscuro.
export function Marca() {
  return (
    <Image
      src="/logo-productosdigitales.png"
      alt="ProductosDigitales.io"
      width={172}
      height={36}
      priority
      className="h-9 w-auto self-start"
    />
  )
}
