-- Rollback 003 · quita el job y las funciones. Los secretos de Vault se borran explícitamente.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'agendador_cola') then
    perform cron.unschedule('agendador_cola');
  end if;
end $$;
drop function if exists public.agendador_cron_tick();
drop function if exists public.agendador_cron_url(text);
delete from vault.secrets where name in ('agendador_cron_secret', 'agendador_cola_url');
delete from public.agendador_migraciones where nombre = '003_agendador_cron';
