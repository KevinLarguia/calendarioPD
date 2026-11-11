-- 001 · Tablas del agendador de respaldo (prefijo agendador_). Solo objetos nuevos.
-- Idempotente: se puede volver a correr.

create extension if not exists btree_gist with schema extensions;

create table if not exists public.agendador_migraciones (
  nombre text primary key,
  aplicada_at timestamptz not null default now()
);

create table if not exists public.agendador_config (
  id int primary key default 1 check (id = 1),
  dias_semana int[] not null default '{1,2,3,4,5,6}',
  hora_primera time not null default '09:00',
  hora_ultima time not null default '20:00',
  paso_min int not null default 30 check (paso_min between 5 and 240),
  duracion_min int not null default 60 check (duracion_min between 5 and 240),
  aviso_min_minutos int not null default 120 check (aviso_min_minutos >= 0),
  dias_adelante int not null default 7 check (dias_adelante between 0 and 60),
  zona text not null default 'America/Argentina/Buenos_Aires',
  envios_por_minuto int not null default 20 check (envios_por_minuto between 1 and 120),
  utm_source text not null default 'webinar-11-11',
  evento_nombre text not null default 'Llamada de Admisión | ProductosDigitales.io',
  activo boolean not null default true,
  limite_ip_10min int not null default 30 check (limite_ip_10min >= 1),
  limite_email_10min int not null default 3 check (limite_email_10min >= 1),
  updated_at timestamptz not null default now()
);

insert into public.agendador_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.agendador_closers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  email text,
  zoom_link text,
  aliases text[] not null default '{}',
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.agendador_closers (nombre, email, aliases, orden) values
  ('Manuel Modini',    'manuelm@productosdigitales.io',  '{}',            1),
  ('Jose Nuñez',       'josen@productosdigitales.io',    '{}',            2),
  ('Ramiro Garcia',    'ramirog@productosdigitales.io',  '{}',            3),
  ('Joaquin Godoy',    'joaquing@productosdigitales.io', '{"Joaquin G"}', 4),
  ('Matheus Pfeiffer', 'matheusp@productosdigitales.io', '{"Matheus P"}', 5),
  ('Luciano Medina',   'lucianom@productosdigitales.io', '{"Luciano M"}', 6)
on conflict (nombre) do nothing;

create table if not exists public.agendador_reservas (
  id uuid primary key default gen_random_uuid(),
  invitee_uri text not null unique,
  closer text not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  timezone_lead text,
  nombre text not null,
  email text not null,
  telefono_e164 text not null,
  respuestas jsonb not null default '[]'::jsonb,
  ip text,
  user_agent text,
  estado text not null default 'activa' check (estado in ('activa', 'cancelada')),
  estado_envio text not null default 'pendiente'
    check (estado_envio in ('pendiente', 'enviando', 'enviado', 'verificado', 'revisar', 'error')),
  intentos int not null default 0,
  enviado_at timestamptz,
  verificado_at timestamptz,
  ultimo_error text,
  es_prueba boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin > inicio),
  constraint agendador_reservas_sin_choques
    exclude using gist (closer with =, tstzrange(inicio, fin) with &&) where (estado = 'activa')
);

create index if not exists agendador_reservas_estado_envio_idx on public.agendador_reservas (estado_envio, created_at);
create index if not exists agendador_reservas_email_idx on public.agendador_reservas (lower(email));
create index if not exists agendador_reservas_telefono_idx on public.agendador_reservas (telefono_e164);
create index if not exists agendador_reservas_inicio_idx on public.agendador_reservas (inicio) where estado = 'activa';

create table if not exists public.agendador_rate_limits (
  clave text not null,
  ventana timestamptz not null,
  cuenta int not null default 1,
  primary key (clave, ventana)
);

alter table public.agendador_migraciones enable row level security;
alter table public.agendador_config enable row level security;
alter table public.agendador_closers enable row level security;
alter table public.agendador_reservas enable row level security;
alter table public.agendador_rate_limits enable row level security;

revoke all on public.agendador_migraciones, public.agendador_config, public.agendador_closers,
  public.agendador_reservas, public.agendador_rate_limits from anon, authenticated;

insert into public.agendador_migraciones (nombre) values ('001_agendador_tablas') on conflict do nothing;
