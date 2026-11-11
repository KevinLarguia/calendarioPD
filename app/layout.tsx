import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'Agendá tu llamada de admisión | ProductosDigitales.io',
  description: 'Elegí el día y la hora de tu llamada de admisión con el equipo de Productos Digitales.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#0d1015',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${inter.variable} bg-background`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
