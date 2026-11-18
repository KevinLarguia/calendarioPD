-- Rollback 005 · deja agendador_ocupacion como en 002 y quita lo agregado por 005.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'agendador_gcal') then
    perform cron.unschedule('agendador_gcal');
  end if;
end $$;
drop function if exists public.agendador_gcal_tick();
drop function if exists public.agendador_gcal_cron_url(text);
delete from vault.secrets where name = 'agendador_gcal_url';

create or replace function public.agendador_ocupacion(p_desde timestamptz, p_hasta timestamptz)
returns table (closer text, inicio timestamptz, fin timestamptz)
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  with cfg as (select make_interval(mins => duracion_min) as dur from public.agendador_config where id = 1)
  select r.closer, r.inicio, r.fin
  from public.agendador_reservas r
  where r.estado = 'activa' and r.inicio < p_hasta and r.fin > p_desde
  union all
  select m.nombre,
         (af.fecha_llamada at time zone 'UTC'),
         (af.fecha_llamada at time zone 'UTC') + cfg.dur
  from cfg, public.agendas_final af
  join public.agendador_mapa_closers() m on m.variante = public.agendador_norm(af.closer)
  where af.organization_id = 2
    and af.activo
    and coalesce(af.estado_llamada, '') <> 'Cancelada'
    and af.fecha_llamada >= ((p_desde - cfg.dur) at time zone 'UTC')
    and af.fecha_llamada <  (p_hasta at time zone 'UTC')
$$;
revoke all on function public.agendador_ocupacion(timestamptz, timestamptz) from public, anon, authenticated;

drop function if exists public.agendador_reemplazar_bloqueos(text, timestamptz, timestamptz, jsonb);
drop table if exists public.agendador_gcal_sync;
drop table if exists public.agendador_bloqueos_gcal;
drop index if exists public.agendador_reservas_gcal_pend_idx;

alter table public.agendador_reservas
  drop column if exists zoom_meeting_id, drop column if exists zoom_join_url, drop column if exists zoom_error,
  drop column if exists gcal_event_id, drop column if exists gcal_synced_at, drop column if exists gcal_error,
  drop column if exists gcal_intentos;
alter table public.agendador_closers drop column if exists gcal_calendar_id, drop column if exists zoom_user;

delete from public.agendador_migraciones where nombre = '005_agendador_integraciones';
