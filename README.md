# Agendador de respaldo (Calendly → n8n → CRM)

Reemplazo de emergencia del formulario de Calendly para las Llamadas de Admisión. El lead elige horario y completa el mismo formulario; el sistema asigna closer sin superponer con las agendas reales del CRM y le manda a n8n un webhook idéntico al `invitee.created` de Calendly, así el flujo actual (CRM + WhatsApp) no cambia.

## Cómo funciona

1. `GET /api/slots` → RPC `agendador_slots()`: horarios de los próximos días con al menos un closer libre. Ocupación = reservas propias activas + `agendas_final` (org 2, activas, no canceladas) mapeando nombres de closer con `closer_kpi_targets` y los alias de `agendador_closers`.
2. El lead elige horario → se carga el formulario (lazy) y pide `GET /api/token` (HMAC con hora de emisión).
3. `POST /api/reservar` valida (zod, teléfono con `libphonenumber-js`, honeypot, token ≥ 4 s) y llama a la RPC `agendador_reservar`: rate limit (IP / email, ventanas de 10 min), duplicados por email o teléfono (`pd_tel10`) contra reservas propias y `agendas_final`, elección del closer con menos llamadas ese día, `INSERT` protegido por `EXCLUDE USING gist` (ante choque prueba el siguiente closer; si ninguno entra → `sin_cupo`).
4. Cola: pg_cron (`agendador_cola`, cada minuto) → `POST /api/cola/procesar` con `x-cron-secret`. Toma hasta `envios_por_minuto` reservas pendientes (`FOR UPDATE SKIP LOCKED`), manda **un solo** POST a `N8N_WEBHOOK_URL`, y 3 minutos después verifica que el `invitee_uri` apareció en `agendas_final.calendly_invitee_uri`.
   - 2xx → `enviado` → `verificado` si aparece en el CRM, `revisar` si no.
   - Sin conexión (DNS / rechazo) → reintenta hasta 3 veces → `error`.
   - Timeout, corte a mitad o HTTP no 2xx → `revisar` (nunca se reenvía solo).
   - `enviando` > 5 min → `revisar`.
   - `revisar` y `error` avisan a Discord (email y teléfono enmascarados).
5. `/admin`: reservas por estado, reenvío manual con confirmación, configuración y closers.

En `AGENDADOR_MODO=test` la cola no llama a n8n: marca `verificado` con `es_prueba=true`, y `/api/reservar` acepta el header `x-prueba-ip` (para k6).

## Variables de entorno (Vercel)

| Variable | Uso |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ya vienen de la integración de Supabase (proyecto del CRM) |
| `N8N_WEBHOOK_URL` | URL del webhook de n8n que hoy recibe Calendly |
| `CRON_SECRET` | el mismo valor que el secreto `agendador_cron_secret` de Vault (ver abajo) |
| `ADMIN_SECRET` | clave de `/admin/login` |
| `FORM_TOKEN_SECRET` | firma del token anti-bots del formulario (cualquier string largo al azar) |
| `DISCORD_ALERTAS_WEBHOOK_URL` | webhook del canal de alertas |
| `AGENDADOR_MODO` | `test` (default) o `prod` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON de la service account con domain-wide delegation (completo, o en base64). Sin esto no hay sync de Google Calendar |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | app Server-to-Server OAuth de Zoom. Sin esto se sigue usando el `zoom_link` fijo del closer |

## Base de datos (Supabase del CRM)

Solo objetos con prefijo `agendador_`; nada existente se modifica. Migraciones en `supabase/migrations`, rollbacks en `supabase/rollbacks`, registro en `agendador_migraciones`.

```bash
node --env-file=.env.development.local scripts/db/aplicar.mjs supabase/migrations/001_agendador_tablas.sql
node --env-file=.env.development.local scripts/db/consulta.mjs "select * from agendador_slots() limit 5"
```

Las tres migraciones ya están aplicadas (001 tablas, 002 funciones, 003 pg_cron).

### Activar el cron (una sola vez, en el SQL Editor de Supabase)

```sql
-- 1) Copiar este valor a la env CRON_SECRET de Vercel
select decrypted_secret from vault.decrypted_secrets where name = 'agendador_cron_secret';
-- 2) Apuntar el job al deploy (mientras esté vacío, el job no llama a nada)
select public.agendador_cron_url('https://<dominio-del-deploy>/api/cola/procesar');
-- Ver últimas corridas
select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'agendador_cola') order by start_time desc limit 10;
select * from net._http_response order by created desc limit 10;
```

## Scripts

- `scripts/n8n/payload-muestra.ts` — imprime el payload que recibe n8n y compara claves con la plantilla real: `pnpm exec tsx scripts/n8n/payload-muestra.ts`
- `scripts/n8n/probar-cola.ts` + `scripts/n8n/mock-n8n.mjs` — recorre los 6 caminos de la cola (ok, no verificado, HTTP 500, conexión rechazada ×3, timeout, enviando colgado) con reservas de prueba que borra al final.
- `scripts/db/limpiar-pruebas.mjs [--ejecutar]` — borra reservas con `es_prueba=true`.
- `loadtest/agendas.js` — k6. **Siempre con `AGENDADOR_MODO=test`**:

```bash
k6 run -e BASE_URL=https://<deploy> -e ESCENARIO=pico500 loadtest/agendas.js   # 500 en 90 s
k6 run -e BASE_URL=https://<deploy> -e ESCENARIO=pico300 loadtest/agendas.js   # 300 en 5 min
k6 run -e BASE_URL=https://<deploy> -e ESCENARIO=hora1000 loadtest/agendas.js  # 1.000 en 60 min
```

Después de cada corrida: `loadtest/control-superposiciones.sql` debe devolver 0 filas y `scripts/db/limpiar-pruebas.mjs --ejecutar` borra las reservas.

## Pasar a producción

1. Envs en Vercel con `AGENDADOR_MODO=prod` y `N8N_WEBHOOK_URL` real.
2. `select public.agendador_cron_url('https://<dominio>/api/cola/procesar')`.
3. Una reserva real propia desde el celular → en ≤ 4 min debe estar `verificado` en `/admin` y la agenda en el CRM con WhatsApp enviado.
4. Para volver a Calendly: `activo = false` en `/admin` (el agendador deja de dar horarios) o `cron.unschedule('agendador_cola')`.

## Zoom y Google Calendar (migración 005)

Solo corren con `AGENDADOR_MODO=prod` (en `test` no se llama a ninguna API externa).

- **Zoom**: antes de mandar la reserva a n8n, la cola crea una reunión de Zoom con el closer como host (`/users/{email}/meetings`) y guarda `zoom_meeting_id` / `zoom_join_url`. El payload a n8n lleva ese link en `scheduled_event.location` (misma forma de siempre). Si Zoom falla, se envía con el `zoom_link` fijo del closer y se avisa a Discord: nunca frena el envío.
- **Google Calendar, lectura**: `POST /api/gcal/sincronizar` (pg_cron, cada minuto) lee el calendario de cada closer activo y copia a `agendador_bloqueos_gcal` lo que está ocupado. `agendador_ocupacion()` suma esos bloques, así que cualquier evento que el pre call cree en el calendario de un closer (opaco/“Ocupado”, no rechazado) saca ese horario del agendador. No cuentan: eventos “Libre”, rechazados, cancelados, ubicación de trabajo ni los eventos creados por el propio agendador. Los de todo el día bloquean el día completo en la zona del negocio.
- **Google Calendar, escritura**: la misma corrida crea un evento por reserva en el calendario del closer (título, datos del lead, respuestas del formulario y link de Zoom). El id del evento es el uuid de la reserva, así que reintentar no duplica. Si la reserva pasa a `cancelada`, se borran el evento y la reunión de Zoom.
- Si el sync de un closer falla, se conservan sus últimos bloques, se muestra el error en `/admin` y se avisa a Discord (máx. 1 vez cada 30 min por closer). Los eventos nuevos pueden tardar hasta ~1 min en reflejarse como bloqueo.

### Configuración (una sola vez)

1. **Google Cloud**: crear una service account, habilitar *Google Calendar API*, generar una clave JSON y cargarla en `GOOGLE_SERVICE_ACCOUNT_JSON`.
2. **Workspace Admin** → Seguridad → Control de acceso a datos → *Delegación en todo el dominio*: autorizar el *Client ID* de la service account con el scope `https://www.googleapis.com/auth/calendar.events`.
3. **Zoom Marketplace** → *Server-to-Server OAuth app*, con los scopes `meeting:write:meeting:admin` y `meeting:delete:meeting:admin`. Los closers tienen que ser usuarios con licencia de la cuenta (el email del closer en `/admin` = su email de Zoom).
4. En `/admin` → Closers: cada closer activo necesita email (se usa para Google y Zoom). *Calendario de Google* y *Usuario de Zoom* solo se completan si son distintos del email.
5. Aplicar la migración y apuntar el job al deploy (una vez):

```bash
node --env-file=.env.development.local scripts/db/aplicar.mjs supabase/migrations/005_agendador_integraciones.sql
```
```sql
select public.agendador_gcal_cron_url('https://<dominio-del-deploy>/api/gcal/sincronizar');
select * from agendador_gcal_sync;   -- tras 1-2 minutos: un registro por closer, con ultimo_error vacío
```

Prueba sin credenciales: `pnpm exec tsx scripts/integraciones/probar-mocks.ts`. Rollback: `supabase/rollbacks/005_agendador_integraciones.sql`.

## Enlaces `/backup/...`

`cancel_url`, `reschedule_url` e `invitee uri` del payload apuntan a `/backup/*` en este deploy: una página estática que le pide al lead escribir por WhatsApp. No cancelan ni reagendan.
