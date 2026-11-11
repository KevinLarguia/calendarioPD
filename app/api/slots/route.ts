import { connection } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Slot, SlotsRespuesta } from '@/lib/agendador/tipos'

export async function GET() {
  await connection()
  const supabase = supabaseAdmin()
  const [slotsRes, configRes] = await Promise.all([
    supabase.rpc('agendador_slots'),
    supabase.from('agendador_config').select('zona, duracion_min, activo').eq('id', 1).single(),
  ])

  if (slotsRes.error || configRes.error) {
    console.error('[slots]', slotsRes.error?.message ?? configRes.error?.message)
    return Response.json({ error: 'No pudimos cargar los horarios' }, { status: 500, headers: { 'cache-control': 'no-store' } })
  }

  const cuerpo: SlotsRespuesta = {
    slots: (slotsRes.data ?? []) as Slot[],
    zona: configRes.data.zona,
    duracion_min: configRes.data.duracion_min,
    activo: configRes.data.activo,
    generado_at: new Date().toISOString(),
  }

  return Response.json(cuerpo, {
    headers: {
      'cache-control': 'public, s-maxage=15, stale-while-revalidate=30',
      'cdn-cache-control': 'public, s-maxage=15, stale-while-revalidate=30',
    },
  })
}
