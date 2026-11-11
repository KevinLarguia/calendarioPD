import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

const TITULO = 'Agendá tu llamada de admisión | ProductosDigitales.io'
const DESCRIPCION =
  'Elegí el día y la hora de tu llamada de admisión con el equipo de Productos Digitales.'
const OG_IMAGE = {
  url: '/og-productosdigitales.png',
  width: 640,
  height: 640,
  alt: 'Productos Digitales',
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://calendariopd.vercel.app'),
  title: TITULO,
  description: DESCRIPCION,
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: 'ProductosDigitales.io',
    title: TITULO,
    description: DESCRIPCION,
    locale: 'es_AR',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary',
    title: TITULO,
    description: DESCRIPCION,
    images: [OG_IMAGE.url],
  },
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
