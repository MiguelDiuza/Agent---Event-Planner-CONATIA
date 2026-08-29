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

## Pruebas

Todas ejecutan el código y las queries que están dentro de los `.json` de los
workflows — se leen de ahí, no se copian, para que no puedan quedar
desincronizadas del nodo.

**Sin base y sin red.** Corren solas, en un segundo:

```bash
node scripts/revisar-workflows.js  # los 5 workflows nodo por nodo: conexiones, referencias, credenciales
node scripts/probar-agenda.js      # horario de atención y horas libres, con el reloj congelado
node scripts/probar-telefono.js    # el número de contacto y la fecha del evento
```

**Contra la base real.** Necesitan `SUPABASE_PROJECT_REF` y
`SUPABASE_ACCESS_TOKEN` del `.env`, y limpian sus propios datos al terminar:

```bash
node scripts/banco-pruebas.js      # 10 conversaciones completas, mensaje por mensaje
node scripts/probar-ramas.js       # las ramas del turno 3 que los chats no tocan
node scripts/probar-fragmentos.js  # los mensajes que llegan por partes
node scripts/probar-aforos.js      # cuántos salones salen para cada aforo, y con qué precio
```

Lo único simulado es el transporte: en vez de hacer POST a YCloud, imprimen.

`probar-aforos.js` acepta `--mutar`: saca la definición viva de
`fn_medios_sedes_cotizacion`, le rompe una línea, la instala **con otro nombre**
—la de producción no se toca— y exige que las comprobaciones se pongan en rojo.
Una prueba que no puede fallar no sirve, y esa es la forma de saberlo.

**Contra el n8n que está corriendo.** Las únicas que prueban a n8n mismo —
`Esperar Continuación`, la memoria, el reparto de fragmentos despierto— y lo
único que ve el texto que el cliente lee. Llaman a Gemini de verdad:

```bash
node scripts/probar-en-vivo.js       # humo: una ráfaga de cuatro mensajes contra el VPS
node scripts/probar-conversacion.js  # 10 conversaciones: que no se repita, no olvide ni suene a máquina
```

`probar-conversacion.js` imprime al final cuántos **turnos se perdieron**:
Gemini devuelve 0 tokens, la herramienta no corre y el cliente se queda sin
respuesta. En WhatsApp lo tapa el "Dame un segundito" de `Dividir Mensajes`. Es
un dato del modelo, no un fallo del banco, y por eso va aparte de los fallos.

### Dejar todo en cero

Antes de una tanda de pruebas por WhatsApp, para que el agente arranque sin
memoria de las anteriores:

```bash
node scripts/vaciar-calendario.js           # muestra qué hay en el calendario
node scripts/vaciar-calendario.js --borrar  # lo vacía
```

Las tablas se vacían con un `delete` de `mensajes_fragmentos`, `envios_medios`,
`citas`, `agenda_reservas`, `n8n_chat_histories` y `leads`, en ese orden. El
catálogo (`sedes`, `precios_sedes`, `tipos_evento`, `medios`) no se toca nunca.

## Estructura de datos

| Tabla | Contenido |
|---|---|
| `sedes` | 15 salones, con su `google_calendar_id` |
| `precios_sedes` | 195 combinaciones de sede × capacidad (50–200 invitados) |
| `tipos_evento` | 7 tipos (15 años, matrimonio, grado, cumpleaños, empresa, primera comunión, baby shower) con inclusiones y obsequios |
| `servicios_adicionales_upselling` | Fotografía Focus Art, pirotecnia y extras |
| `leads` | Clientes que escriben por WhatsApp y su estado en el embudo |
| `agenda_reservas` | Fechas separadas por sede, con su `google_event_id` |
| `citas` | Citas con el asesor: llamadas, visitas, pruebas de traje |
| `mensajes_fragmentos` | Mensajes de WhatsApp a la espera de que les llegue el resto |
| `envios_medios` | Qué pieza se le mandó a quién — y con qué aforo, porque el precio va dentro del caption |

## Credenciales pendientes de configurar en n8n

Estas se configuran en la UI de n8n (Credentials), no en este repo:

- **WhatsApp Business Cloud API** (Meta) — canal de entrada y salida
- **Google Gemini** — modelo del AI Agent
- **Google Calendar OAuth2** — disponibilidad y bloqueo de fechas por sede
- **Gmail OAuth2** — envío de cotizaciones
- **Postgres** — apuntando a la conexión de Supabase de arriba
