import { redirect } from 'next/navigation'
import { esAdmin } from '@/lib/admin/sesion'
import { Marca } from '@/components/agendador/marca'
import { FormularioLogin } from '@/components/admin/formulario-login'

export const metadata = { title: 'Admin | Agendador', robots: { index: false, follow: false } }

export default async function LoginAdmin() {
  if (await esAdmin()) redirect('/admin')
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Marca />
      <FormularioLogin />
    </main>
  )
}
