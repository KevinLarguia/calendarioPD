-- 006 · Respetar los horarios ocupados del Google Calendar de cada closer.
-- El CRM sincroniza cada 5 minutos public.closer_bloqueos (organization_id = 2, google_email, inicio, fin).
-- Con agendador_config.usar_bloqueos_gcal = true, un slot que se superpone con un bloqueo del closer
-- (match por email, sin mayúsculas) deja de ofrecerse y no se puede reservar con ese closer.
-- Los bloqueos solo quitan disponibilidad: NO cuentan como carga en el reparto de leads.
-- Apagado por defecto. Si closer_bloqueos no existe, todo funciona exactamente como antes.

alter table public.agendador_config
  add column if not exists usar_bloqueos_gcal boolean not null default false;

-- Bloqueos por closer del respaldo en una ventana. Vacía si el flag está apagado o la tabla no existe.
-- SQL dinámico para que la función compile y corra aunque closer_bloqueos no exista.
create or replace function public.agendador_bloqueos(p_desde timestamptz, p_hasta timestamptz)
returns table(closer text, inicio timestamptz, fin timestamptz)
language plpgsql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if to_regclass('public.closer_bloqueos') is null then return; end if;
  if not coalesce((select c.usar_bloqueos_gcal from public.agendador_config c where c.id = 1), false) then
    return;
  end if;
  return query execute $q$
    select cl.nombre, b.inicio, b.fin
    from public.closer_bloqueos b
    join public.agendador_closers cl
      on lower(trim(cl.email)) = lower(trim(b.google_email))
    where b.organization_id = 2
      and b.inicio < $2
      and b.fin > $1
  $q$ using p_desde, p_hasta;
end;
$function$;

-- Closers del respaldo cuyo sync de Google lleva >= 3 errores seguidos. Se siguen usando sus últimos
-- bloqueos conocidos (conservador); esta función solo sirve para avisar. Toma un turno por hora en
-- agendador_rate_limits: devuelve filas como mucho una vez por hora, el resto de las veces vacía.
create or replace function public.agendador_aviso_bloqueos()
returns table(google_email text, closer text, errores int, ultimo_ok timestamptz)
language plpgsql
volatile security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_ventana timestamptz := date_bin('1 hour', now(), '2000-01-01'::timestamptz);
  v_tomado int;
begin
  if to_regclass('public.closer_sync_estado') is null then return; end if;
  if not coalesce((select c.usar_bloqueos_gcal from public.agendador_config c where c.id = 1), false) then
    return;
  end if;

  create temp table if not exists _agendador_aviso_bloqueos
    (google_email text, closer text, errores int, ultimo_ok timestamptz) on commit drop;
  truncate _agendador_aviso_bloqueos;
  execute $q$
    insert into _agendador_aviso_bloqueos
    select e.google_email, cl.nombre, e.errores_consecutivos, e.ultimo_sync_ok_at
    from public.closer_sync_estado e
    join public.agendador_closers cl
      on lower(trim(cl.email)) = lower(trim(e.google_email))
    where cl.activo and coalesce(e.errores_consecutivos, 0) >= 3
  $q$;
  if not exists (select 1 from _agendador_aviso_bloqueos) then return; end if;

  insert into public.agendador_rate_limits (clave, ventana)
  values ('aviso:bloqueos_gcal', v_ventana)
  on conflict (clave, ventana) do nothing;
  get diagnostics v_tomado = row_count;
  if v_tomado = 0 then return; end if;

  return query select a.google_email, a.closer, a.errores, a.ultimo_ok from _agendador_aviso_bloqueos a order by a.closer;
end;
$function$;

create or replace function public.agendador_slots(p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(inicio timestamp with time zone, fin timestamp with time zone, libres integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  c public.agendador_config%rowtype;
  v_dur interval;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_hoy date;
begin
  select * into c from public.agendador_config where id = 1;
  if not found or not c.activo then return; end if;

  v_dur := make_interval(mins => c.duracion_min);
  v_hoy := (now() at time zone c.zona)::date;
  v_desde := greatest(coalesce(p_desde, now()), now() + make_interval(mins => least(c.aviso_min_minutos, c.webinar_aviso_min)));
  v_hasta := least(coalesce(p_hasta, 'infinity'::timestamptz), ((v_hoy + c.dias_adelante + 1)::timestamp at time zone c.zona));
  if v_desde >= v_hasta then return; end if;

  return query
  with dias as (
    select d::date as dia
    from generate_series((v_desde at time zone c.zona)::date, (v_hasta at time zone c.zona)::date, interval '1 day') d
    where extract(isodow from d)::int = any (c.dias_semana)
  ),
  candidatos as (
    select (t at time zone c.zona) as inicio
    from dias
    cross join lateral generate_series(
      (dias.dia + c.hora_primera)::timestamp,
      (dias.dia + c.hora_ultima)::timestamp,
      make_interval(mins => c.paso_min)
    ) t
  ),
  ocup as materialized (
    select * from public.agendador_ocupacion(v_desde, v_hasta + v_dur)
  ),
  bloq as materialized (
    select * from public.agendador_bloqueos(v_desde, v_hasta + v_dur)
  ),
  closers as (
    select cl.nombre from public.agendador_closers cl where cl.activo
  )
  select cand.inicio, cand.inicio + v_dur, count(*)::int
  from candidatos cand
  cross join closers cl
  where cand.inicio >= v_desde and cand.inicio < v_hasta
    and cand.inicio >= now() + public.agendador_aviso_para(cand.inicio, c)
    and not exists (
      select 1 from ocup o
      where o.closer = cl.nombre and o.inicio < cand.inicio + v_dur and o.fin > cand.inicio
    )
    and not exists (
      select 1 from bloq b
      where b.closer = cl.nombre and b.inicio < cand.inicio + v_dur and b.fin > cand.inicio
    )
  group by cand.inicio
  order by cand.inicio;
end;
$function$;

create or replace function public.agendador_reservar(p_inicio timestamp with time zone, p_nombre text, p_email text, p_telefono_e164 text, p_timezone text, p_respuestas jsonb, p_ip text, p_user_agent text, p_host text, p_es_prueba boolean DEFAULT false, p_utm jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  c public.agendador_config%rowtype;
  v_dur interval;
  v_fin timestamptz;
  v_local timestamp;
  v_ventana timestamptz;
  v_cuenta int;
  v_email text := lower(trim(p_email));
  v_tel10 text := public.pd_tel10(p_telefono_e164);
  v_dup record;
  v_closer record;
  v_id uuid;
  v_uri text;
  v_hoy date;
  v_dia_ini timestamptz;
  v_dia_fin timestamptz;
begin
  select * into c from public.agendador_config where id = 1;
  if not found or not c.activo then
    return jsonb_build_object('resultado', 'inactivo');
  end if;

  v_dur := make_interval(mins => c.duracion_min);
  v_fin := p_inicio + v_dur;
  v_local := p_inicio at time zone c.zona;
  v_hoy := (now() at time zone c.zona)::date;

  -- El inicio tiene que ser un slot válido de la grilla.
  if p_inicio < now() + public.agendador_aviso_para(p_inicio, c)
     or v_local::date > v_hoy + c.dias_adelante
     or not (extract(isodow from v_local)::int = any (c.dias_semana))
     or v_local::time < c.hora_primera
     or v_local::time > c.hora_ultima
     or mod(extract(epoch from (v_local::time - c.hora_primera))::int, c.paso_min * 60) <> 0
  then
    return jsonb_build_object('resultado', 'invalido', 'motivo', 'horario_fuera_de_grilla');
  end if;

  -- Rate limit por IP y por email en ventanas fijas de 10 minutos.
  v_ventana := date_bin('10 minutes', now(), '2000-01-01'::timestamptz);
  if p_ip is not null then
    insert into public.agendador_rate_limits (clave, ventana) values ('ip:' || p_ip, v_ventana)
    on conflict (clave, ventana) do update set cuenta = public.agendador_rate_limits.cuenta + 1
    returning cuenta into v_cuenta;
    if v_cuenta > c.limite_ip_10min then
      return jsonb_build_object('resultado', 'rate_limit', 'motivo', 'ip');
    end if;
  end if;
  insert into public.agendador_rate_limits (clave, ventana) values ('email:' || v_email, v_ventana)
  on conflict (clave, ventana) do update set cuenta = public.agendador_rate_limits.cuenta + 1
  returning cuenta into v_cuenta;
  if v_cuenta > c.limite_email_10min then
    return jsonb_build_object('resultado', 'rate_limit', 'motivo', 'email');
  end if;

  -- Duplicados: reserva activa futura acá o agenda futura no cancelada en el CRM.
  select r.inicio, r.closer into v_dup
  from public.agendador_reservas r
  where r.estado = 'activa' and r.fin > now()
    and (lower(r.email) = v_email or r.telefono_e164 = p_telefono_e164
         or (v_tel10 is not null and public.pd_tel10(r.telefono_e164) = v_tel10))
  order by r.inicio
  limit 1;
  if found then
    return jsonb_build_object('resultado', 'ya_agendado', 'inicio', v_dup.inicio, 'closer', v_dup.closer, 'fuente', 'respaldo');
  end if;

  select (af.fecha_llamada at time zone 'UTC') as inicio, af.closer into v_dup
  from public.agendas_final af
  where af.organization_id = 2 and af.activo
    and coalesce(af.estado_llamada, '') <> 'Cancelada'
    and af.fecha_llamada >= ((now() - v_dur) at time zone 'UTC')
    and (lower(af.email) = v_email or (v_tel10 is not null and public.pd_tel10(af.telefono) = v_tel10))
  order by af.fecha_llamada
  limit 1;
  if found then
    return jsonb_build_object('resultado', 'ya_agendado', 'inicio', v_dup.inicio, 'closer', v_dup.closer, 'fuente', 'calendly');
  end if;

  -- Closers libres ordenados por carga del día (ambas fuentes), desempate aleatorio.
  -- Los bloqueos de Google solo sacan closers de la lista: no suman carga.
  v_dia_ini := (v_local::date)::timestamp at time zone c.zona;
  v_dia_fin := v_dia_ini + interval '1 day';
  v_id := gen_random_uuid();
  v_uri := 'https://' || p_host || '/backup/invitees/' || v_id::text;

  for v_closer in
    with ocup as materialized (
      select * from public.agendador_ocupacion(v_dia_ini - v_dur, v_dia_fin + v_dur)
    ),
    bloq as materialized (
      select * from public.agendador_bloqueos(p_inicio, v_fin)
    )
    select cl.nombre,
           (select count(*) from ocup o where o.closer = cl.nombre and o.inicio >= v_dia_ini and o.inicio < v_dia_fin) as carga
    from public.agendador_closers cl
    where cl.activo
      and not exists (
        select 1 from ocup o where o.closer = cl.nombre and o.inicio < v_fin and o.fin > p_inicio
      )
      and not exists (
        select 1 from bloq b where b.closer = cl.nombre
      )
    order by carga asc, random()
  loop
    -- Segundo chequeo justo antes de insertar (statement nuevo = ve lo que el sync confirmó recién):
    -- si el hueco se bloqueó mientras recorríamos la lista, este closer ya no va.
    if exists (select 1 from public.agendador_bloqueos(p_inicio, v_fin) b where b.closer = v_closer.nombre) then
      continue;
    end if;
    begin
      insert into public.agendador_reservas
        (id, invitee_uri, closer, inicio, fin, timezone_lead, nombre, email, telefono_e164, respuestas, ip, user_agent, es_prueba,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term)
      values
        (v_id, v_uri, v_closer.nombre, p_inicio, v_fin, p_timezone, trim(p_nombre), v_email, p_telefono_e164,
         coalesce(p_respuestas, '[]'::jsonb), p_ip, left(p_user_agent, 500), coalesce(p_es_prueba, false),
         nullif(left(trim(p_utm->>'utm_source'), 200), ''),
         nullif(left(trim(p_utm->>'utm_medium'), 200), ''),
         nullif(left(trim(p_utm->>'utm_campaign'), 200), ''),
         nullif(left(trim(p_utm->>'utm_content'), 200), ''),
         nullif(left(trim(p_utm->>'utm_term'), 200), ''));
      return jsonb_build_object('resultado', 'ok', 'id', v_id, 'inicio', p_inicio, 'fin', v_fin, 'closer', v_closer.nombre);
    exception when exclusion_violation then
      -- Otro lead ganó este closer en este horario: probamos el siguiente.
      null;
    end;
  end loop;

  return jsonb_build_object('resultado', 'sin_cupo', 'inicio', p_inicio);
end;
$function$;

revoke all on function public.agendador_bloqueos(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agendador_aviso_bloqueos() from public, anon, authenticated;
revoke all on function public.agendador_slots(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.agendador_reservar(timestamptz, text, text, text, text, jsonb, text, text, text, boolean, jsonb) from public, anon, authenticated;

insert into public.agendador_migraciones (nombre) values ('006_agendador_bloqueos_gcal') on conflict do nothing;

notify pgrst, 'reload schema';
