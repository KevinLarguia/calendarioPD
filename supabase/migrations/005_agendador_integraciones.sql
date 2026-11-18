-- 005 · Integración Zoom + Google Calendar. Solo objetos agendador_ nuevos o columnas nuevas (aditivo).
--   · Zoom: una reunión por reserva (zoom_meeting_id / zoom_join_url en agendador_reservas).
--   · Google Calendar: el pre call bloquea horarios en el calendario de cada closer; un job copia esos bloques a
--     agendador_bloqueos_gcal y agendador_ocupacion() los suma a la ocupación. Cada reserva crea un evento en el
--     calendario del closer (gcal_event_id).
-- Idempotente: se puede volver a correr.

alter table public.agendador_closers
  add column if not exists gcal_calendar_id text,   -- null = usa el email del closer
  add column if not exists zoom_user text;          -- null = usa el email del closer

alter table public.agendador_reservas
  add column if not exists zoom_meeting_id text,
  add column if not exists zoom_join_url text,
  add column if not exists zoom_error text,
  add column if not exists gcal_event_id text,
  add column if not exists gcal_synced_at timestamptz,
  add column if not exists gcal_error text,
  add column if not exists gcal_intentos int not null default 0;

-- Reservas activas que todavía necesitan evento de calendario (consulta del job).
create index if not exists agendador_reservas_gcal_pend_idx
  on public.agendador_reservas (inicio)
  where estado = 'activa' and gcal_event_id is null;

-- Bloques ocupados leídos de Google Calendar (copia que se reemplaza en cada sync).
create table if not exists public.agendador_bloqueos_gcal (
  id bigint generated always as identity primary key,
  closer text not null,            -- nombre canónico de agendador_closers
  inicio timestamptz not null,
  fin timestamptz not null,
  gcal_event_id text,
  titulo text,
  synced_at timestamptz not null default now(),
  check (fin > inicio)
);
create index if not exists agendador_bloqueos_gcal_idx on public.agendador_bloqueos_gcal (closer, inicio, fin);

-- Estado del último sync por closer (para el admin y las alertas).
create table if not exists public.agendador_gcal_sync (
  closer text primary key,
  ultimo_ok_at timestamptz,
  ultimo_intento_at timestamptz,
  ultimo_error text,
  alertado_at timestamptz,
  bloques int not null default 0
);

alter table public.agendador_bloqueos_gcal enable row level security;
alter table public.agendador_gcal_sync enable row level security;
revoke all on public.agendador_bloqueos_gcal, public.agendador_gcal_sync from anon, authenticated;

-- Reemplaza de forma atómica los bloques de un closer en una ventana.
-- p_bloques: [{"inicio": "...", "fin": "...", "gcal_event_id": "...", "titulo": "..."}]
create or replace function public.agendador_reemplazar_bloqueos(
  p_closer text, p_desde timestamptz, p_hasta timestamptz, p_bloques jsonb
)
returns int
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  delete from public.agendador_bloqueos_gcal
  where (closer = p_closer and inicio < p_hasta and fin > p_desde)
     or fin < now() - interval '2 days';

  insert into public.agendador_bloqueos_gcal (closer, inicio, fin, gcal_event_id, titulo)
  select p_closer, (b->>'inicio')::timestamptz, (b->>'fin')::timestamptz, b->>'gcal_event_id', left(b->>'titulo', 200)
  from jsonb_array_elements(coalesce(p_bloques, '[]'::jsonb)) b
  where (b->>'fin')::timestamptz > (b->>'inicio')::timestamptz;
  get diagnostics v_n = row_count;

  insert into public.agendador_gcal_sync (closer, ultimo_ok_at, ultimo_intento_at, ultimo_error, alertado_at, bloques)
  values (p_closer, now(), now(), null, null, v_n)
  on conflict (closer) do update
    set ultimo_ok_at = now(), ultimo_intento_at = now(), ultimo_error = null, alertado_at = null, bloques = v_n;
  return v_n;
end;
$$;
revoke all on function public.agendador_reemplazar_bloqueos(text, timestamptz, timestamptz, jsonb) from public, anon, authenticated;

-- Ocupación combinada: reservas propias + agendas_final org 2 + bloques de Google Calendar.
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
  union all
  select b.closer, b.inicio, b.fin
  from public.agendador_bloqueos_gcal b
  where b.inicio < p_hasta and b.fin > p_desde
$$;
revoke all on function public.agendador_ocupacion(timestamptz, timestamptz) from public, anon, authenticated;

-- Job pg_cron "agendador_gcal": cada minuto POST a /api/gcal/sincronizar (mismo x-cron-secret que la cola).
-- La URL vive en Vault (agendador_gcal_url); mientras esté vacía el job no llama a nada.
--   select public.agendador_gcal_cron_url('https://<dominio>/api/gcal/sincronizar');
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'agendador_gcal_url') then
    perform vault.create_secret('', 'agendador_gcal_url', 'URL de POST /api/gcal/sincronizar del agendador');
  end if;
end $$;

create or replace function public.agendador_gcal_cron_url(p_url text)
returns void
language plpgsql volatile security definer
set search_path = public, vault, pg_temp
as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'agendador_gcal_url';
  if v_id is null then
    perform vault.create_secret(coalesce(p_url, ''), 'agendador_gcal_url', 'URL de POST /api/gcal/sincronizar del agendador');
  else
    perform vault.update_secret(v_id, coalesce(p_url, ''));
  end if;
end;
$$;
revoke all on function public.agendador_gcal_cron_url(text) from public, anon, authenticated;

create or replace function public.agendador_gcal_tick()
returns bigint
language plpgsql volatile security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_url text;
  v_secret text;
  v_req bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'agendador_gcal_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'agendador_cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  select net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 58000
  ) into v_req;
  return v_req;
end;
$$;
revoke all on function public.agendador_gcal_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'agendador_gcal') then
    perform cron.unschedule('agendador_gcal');
  end if;
  perform cron.schedule('agendador_gcal', '* * * * *', 'select public.agendador_gcal_tick()');
end $$;

insert into public.agendador_migraciones (nombre) values ('005_agendador_integraciones') on conflict do nothing;
