import { Suspense } from 'react'

// Las páginas de admin leen cookies en el servidor: el límite de Suspense permite servir el shell al instante.
export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="min-h-dvh" aria-busy />}>{children}</Suspense>
}
