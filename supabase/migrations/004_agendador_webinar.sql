-- 004 · Día de webinar: aviso mínimo distinto para los turnos de esa fecha.
-- Los turnos cuya fecha (en la zona del negocio) coincide con webinar_fecha exigen webinar_aviso_min
-- minutos de anticipación (p. ej. 30, para agendar durante el vivo); el resto sigue con aviso_min_minutos.

alter table public.agendador_config
  add column if not exists webinar_fecha date,
  add column if not exists webinar_aviso_min int not null default 30 check (webinar_aviso_min between 0 and 1440);

create or replace function public.agendador_aviso_para(p_inicio timestamptz, c public.agendador_config)
returns interval
language sql stable
set search_path to public, pg_temp
as $$
  select make_interval(mins => case
    when c.webinar_fecha is not null and (p_inicio at time zone c.zona)::date = c.webinar_fecha then c.webinar_aviso_min
    else c.aviso_min_minutos
  end);
$$;

CREATE OR REPLACE FUNCTION public.agendador_slots(p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone)
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
  group by cand.inicio
  order by cand.inicio;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agendador_reservar(p_inicio timestamp with time zone, p_nombre text, p_email text, p_telefono_e164 text, p_timezone text, p_respuestas jsonb, p_ip text, p_user_agent text, p_host text, p_es_prueba boolean DEFAULT false)
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
  v_dia_ini := (v_local::date)::timestamp at time zone c.zona;
  v_dia_fin := v_dia_ini + interval '1 day';
  v_id := gen_random_uuid();
  v_uri := 'https://' || p_host || '/backup/invitees/' || v_id::text;

  for v_closer in
    with ocup as materialized (
      select * from public.agendador_ocupacion(v_dia_ini - v_dur, v_dia_fin + v_dur)
    )
    select cl.nombre,
           (select count(*) from ocup o where o.closer = cl.nombre and o.inicio >= v_dia_ini and o.inicio < v_dia_fin) as carga
    from public.agendador_closers cl
    where cl.activo
      and not exists (
        select 1 from ocup o where o.closer = cl.nombre and o.inicio < v_fin and o.fin > p_inicio
      )
    order by carga asc, random()
  loop
    begin
      insert into public.agendador_reservas
        (id, invitee_uri, closer, inicio, fin, timezone_lead, nombre, email, telefono_e164, respuestas, ip, user_agent, es_prueba)
      values
        (v_id, v_uri, v_closer.nombre, p_inicio, v_fin, p_timezone, trim(p_nombre), v_email, p_telefono_e164,
         coalesce(p_respuestas, '[]'::jsonb), p_ip, left(p_user_agent, 500), coalesce(p_es_prueba, false));
      return jsonb_build_object('resultado', 'ok', 'id', v_id, 'inicio', p_inicio, 'fin', v_fin, 'closer', v_closer.nombre);
    exception when exclusion_violation then
      -- Otro lead ganó este closer en este horario: probamos el siguiente.
      null;
    end;
  end loop;

  return jsonb_build_object('resultado', 'sin_cupo', 'inicio', p_inicio);
end;
$function$
;

insert into public.agendador_migraciones (nombre) values ('004_agendador_webinar') on conflict do nothing;
