-- 003 · Job pg_cron "agendador_cola": cada minuto hace POST a /api/cola/procesar vía pg_net.
-- El secreto y la URL viven en Vault, nunca en este archivo.
--   agendador_cron_secret: se genera acá si no existe (copiarlo a la env CRON_SECRET de Vercel con
--     select decrypted_secret from vault.decrypted_secrets where name = 'agendador_cron_secret').
--   agendador_cola_url: URL completa del endpoint. Mientras esté vacía el job no llama a nada.
--     Para fijarla: select public.agendador_cron_url('https://<dominio>/api/cola/procesar');

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'agendador_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'agendador_cron_secret', 'Header x-cron-secret del agendador');
  end if;
  if not exists (select 1 from vault.secrets where name = 'agendador_cola_url') then
    perform vault.create_secret('', 'agendador_cola_url', 'URL de POST /api/cola/procesar del agendador');
  end if;
end $$;

create or replace function public.agendador_cron_url(p_url text)
returns void
language plpgsql volatile security definer
set search_path = public, vault, pg_temp
as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'agendador_cola_url';
  if v_id is null then
    perform vault.create_secret(coalesce(p_url, ''), 'agendador_cola_url', 'URL de POST /api/cola/procesar del agendador');
  else
    perform vault.update_secret(v_id, coalesce(p_url, ''));
  end if;
end;
$$;
revoke all on function public.agendador_cron_url(text) from public, anon, authenticated;

-- Dispara la cola: lo llama pg_cron. Lee URL y secreto de Vault y no hace nada si la URL está vacía.
create or replace function public.agendador_cron_tick()
returns bigint
language plpgsql volatile security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_url text;
  v_secret text;
  v_req bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'agendador_cola_url';
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
revoke all on function public.agendador_cron_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'agendador_cola') then
    perform cron.unschedule('agendador_cola');
  end if;
  perform cron.schedule('agendador_cola', '* * * * *', 'select public.agendador_cron_tick()');
end $$;

insert into public.agendador_migraciones (nombre) values ('003_agendador_cron') on conflict do nothing;
