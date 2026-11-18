-- 005 · UTM por reserva: lo que trae la URL (?utm_source=…) se guarda en la reserva y viaja a n8n.
-- Antes el payload mandaba siempre agendador_config.utm_source; ahora ese valor es solo el respaldo
-- para quien llega sin utm en la URL.

alter table public.agendador_reservas
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text;

-- La firma cambia (parámetro nuevo p_utm): hay que soltar la anterior para no dejar dos sobrecargas,
-- que PostgREST no sabe resolver.
drop function if exists public.agendador_reservar(timestamptz, text, text, text, text, jsonb, text, text, text, boolean);

create or replace function public.agendador_reservar(
  p_inicio timestamp with time zone,
  p_nombre text,
  p_email text,
  p_telefono_e164 text,
  p_timezone text,
  p_respuestas jsonb,
  p_ip text,
  p_user_agent text,
  p_host text,
  p_es_prueba boolean default false,
  p_utm jsonb default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
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

revoke all on function public.agendador_reservar(timestamptz, text, text, text, text, jsonb, text, text, text, boolean, jsonb) from public, anon, authenticated;

insert into public.agendador_migraciones (nombre) values ('005_agendador_utm') on conflict do nothing;

-- PostgREST cachea las firmas: que vea la nueva sin esperar.
notify pgrst, 'reload schema';
