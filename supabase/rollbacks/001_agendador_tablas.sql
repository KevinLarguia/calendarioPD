-- Rollback 001 · borra solo objetos agendador_. No toca btree_gist (puede usarlo otro objeto).
drop table if exists public.agendador_rate_limits;
drop table if exists public.agendador_reservas;
drop table if exists public.agendador_closers;
drop table if exists public.agendador_config;
drop table if exists public.agendador_migraciones;
