-- Rollback 002
drop function if exists public.agendador_tomar_lote(int);
drop function if exists public.agendador_reservar(timestamptz, text, text, text, text, jsonb, text, text, text, boolean);
drop function if exists public.agendador_slots(timestamptz, timestamptz);
drop function if exists public.agendador_ocupacion(timestamptz, timestamptz);
drop function if exists public.agendador_mapa_closers();
drop function if exists public.agendador_norm(text);
delete from public.agendador_migraciones where nombre = '002_agendador_funciones';
