# Agente de Ventas AI — Christian Sierra Event Planner

Agente conversacional de WhatsApp ("Angie Otero") que perfila clientes,
cotiza eventos, hace upselling y reserva fechas en Google Calendar.
Orquestado con n8n, razonamiento con Gemini, datos en Supabase.

Diseño completo: [docs/superpowers/specs/2026-08-12-n8n-event-planner-agent-design.md](docs/superpowers/specs/2026-08-12-n8n-event-planner-agent-design.md)

## Entorno de desarrollo local

### Base de datos (Supabase)

```bash
supabase start    # levanta el stack local
supabase stop     # lo apaga
supabase db reset # recrea la BD y reaplica migraciones + seed
```

| Servicio | URL |
|---|---|
| Studio (UI web) | http://127.0.0.1:54323 |
| API REST | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Las migraciones viven en `supabase/migrations/` y se aplican en orden:
esquema primero, datos semilla del catálogo después.

### n8n

```bash
n8n start   # http://localhost:5678
```

Usa la instalación global de npm y los datos en `~/.n8n`.

## Estructura de datos

| Tabla | Contenido |
|---|---|
| `sedes` | 15 salones, con su `google_calendar_id` |
| `precios_sedes` | 195 combinaciones de sede × capacidad (50–200 invitados) |
| `tipos_evento` | 7 tipos (15 años, matrimonio, grado, cumpleaños, empresa, primera comunión, baby shower) con inclusiones y obsequios |
| `servicios_adicionales_upselling` | Fotografía Focus Art, pirotecnia y extras |
| `leads` | Clientes que escriben por WhatsApp y su estado en el embudo |
| `agenda_reservas` | Fechas separadas por sede, con su `google_event_id` |

## Credenciales pendientes de configurar en n8n

Estas se configuran en la UI de n8n (Credentials), no en este repo:

- **WhatsApp Business Cloud API** (Meta) — canal de entrada y salida
- **Google Gemini** — modelo del AI Agent
- **Google Calendar OAuth2** — disponibilidad y bloqueo de fechas por sede
- **Gmail OAuth2** — envío de cotizaciones
- **Postgres** — apuntando a la conexión de Supabase de arriba
