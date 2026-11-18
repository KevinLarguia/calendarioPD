-- Rollback 005 · vuelve a la firma de agendador_reservar de la 004 (sin p_utm) y quita las columnas utm_*.
-- Después de correrlo hay que volver a aplicar la función de supabase/migrations/004_agendador_webinar.sql.

drop function if exists public.agendador_reservar(timestamptz, text, text, text, text, jsonb, text, text, text, boolean, jsonb);

alter table public.agendador_reservas
  drop column if exists utm_source,
  drop column if exists utm_medium,
  drop column if exists utm_campaign,
  drop column if exists utm_content,
  drop column if exists utm_term;

delete from public.agendador_migraciones where nombre = '005_agendador_utm';

notify pgrst, 'reload schema';
