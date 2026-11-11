-- Control después del k6: ningún closer puede tener dos reservas activas que se superpongan.
-- Debe devolver 0 filas.
select a.closer, a.inicio as inicio_a, b.inicio as inicio_b, a.id, b.id
from public.agendador_reservas a
join public.agendador_reservas b
  on a.closer = b.closer and a.id < b.id
 and a.estado = 'activa' and b.estado = 'activa'
 and tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin);

-- Y tampoco contra agendas_final (org 2, no canceladas): también 0 filas.
select r.closer, r.inicio, af.id as agenda_final_id, af.fecha_llamada
from public.agendador_reservas r
join public.agendador_mapa_closers() m on m.nombre = r.closer
join public.agendas_final af
  on public.agendador_norm(af.closer) = m.variante
 and af.organization_id = 2 and af.activo and coalesce(af.estado_llamada, '') <> 'Cancelada'
 and tstzrange(af.fecha_llamada at time zone 'UTC', (af.fecha_llamada at time zone 'UTC') + make_interval(mins => c.duracion_min)) && tstzrange(r.inicio, r.fin)
cross join public.agendador_config c
where c.id = 1 and r.estado = 'activa';
-- Si aparece una fila cuyo agendas_final.synced_at es POSTERIOR a reservas.created_at, no es un bug del agendador:
-- es una reserva real de Calendly que entró después, sobre un hueco que el respaldo ya había ocupado.
