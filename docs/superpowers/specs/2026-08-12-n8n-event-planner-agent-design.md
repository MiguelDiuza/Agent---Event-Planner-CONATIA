# Agente de ventas AI (n8n) — Christian Sierra Event Planner

## Contexto

Christian Sierra Event Planner opera ~15 sedes/salones para eventos (15 años,
matrimonios, grados, cumpleaños, eventos empresariales, primera comunión, baby
shower), con tarifas por sede y capacidad de invitados, más servicios
adicionales de upselling (fotografía con Focus Art, show de pirotecnia).

El objetivo es un agente conversacional por WhatsApp que perfila al cliente,
cotiza, hace upselling y cierra la reserva de fecha ("sistema de separado"),
usando n8n como orquestador, Gemini como LLM, y Supabase (Postgres) como base
de datos y fuente de verdad del catálogo.

## Alcance v1

- Canal: WhatsApp Business (Meta Cloud API, oficial).
- LLM: Gemini vía API, en el nodo AI Agent de n8n.
- Persona del agente: "Brian Otero", asesor comercial — persona, tono y guion
  de ventas ya definidos por el negocio (ver sección System Prompt).
- Base de datos: Supabase (Postgres). Se desarrolla localmente
  (`supabase start`) y se migra a un proyecto Supabase cloud más adelante —
  el esquema es Postgres estándar, no requiere cambios para el salto.
- n8n: instancia local existente (npm global, datos en `~/.n8n`) mientras se
  desarrolla; se migra a n8n Cloud cuando el flujo esté validado.
- Fuera de alcance v1: envío de PDF de cotización (queda para una iteración
  futura — no debe bloquear el diseño de datos actual).

## Modelo de datos (Supabase / Postgres)

### `sedes`
Tabla nueva (no estaba en el documento original del negocio), necesaria
porque la disponibilidad de fecha se revisa **por sede** — son ~15 salones
físicamente independientes, dos pueden tener eventos el mismo día.

| columna | tipo | notas |
|---|---|---|
| id_sede | uuid PK | |
| nombre_sede | text | único |
| google_calendar_id | text | nullable hasta que se configure el calendario real |
| incluye_pista_cristal | boolean | |

### `precios_sedes`
Matriz sede × capacidad → precio, tal como la especificó el negocio, con
`sede_id` como FK en vez de repetir el nombre de la sede como texto en cada
fila (evita inconsistencias entre el nombre en `precios_sedes` y el
`google_calendar_id` en `sedes`).

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| sede_id | uuid FK → sedes | |
| capacidad_invitados | int | 50 a 200, de a 10 |
| precio_total | numeric | COP |

### `tipos_evento`
Tal como la especificó el negocio.

| columna | tipo |
|---|---|
| id_evento | uuid PK |
| nombre_paquete | text |
| inclusiones_base | text |
| obsequios | text |
| excepciones | text |

### `servicios_adicionales_upselling`
Tal como la especificó el negocio.

| columna | tipo |
|---|---|
| id | uuid PK |
| servicio | text |
| precio | numeric |
| detalles | text |
| promociones | text |

### `agenda_reservas`
Tal como la especificó el negocio, más `sede_id` (por el calendario por sede)
y `nombre_cliente` (lo necesita `bloquear_fecha_calendario`).

| columna | tipo |
|---|---|
| id_reserva | uuid PK |
| sede_id | uuid FK → sedes |
| lead_id | uuid FK → leads, nullable |
| fecha_solicitada | date |
| nombre_cliente | text |
| estado | text: `disponible` / `bloqueado_temporal` / `separado` |
| google_event_id | text |

### `leads`
Tabla nueva, aprobada por el negocio para tener visibilidad de quién ha
escrito y en qué paso del embudo va, sin construir un log completo de
mensajes (eso lo maneja la memoria de conversación de n8n).

| columna | tipo |
|---|---|
| id | uuid PK |
| telefono | text, único — clave de sesión de WhatsApp |
| nombre | text |
| email | text, nullable |
| tipo_evento_interes | uuid FK → tipos_evento, nullable |
| sede_interes | uuid FK → sedes, nullable |
| fecha_evento_deseada | date, nullable |
| num_invitados | int, nullable |
| estado | text: `nuevo` / `perfilado` / `cotizado` / `separado` / `perdido` |
| requiere_humano | boolean, default false |
| created_at / updated_at | timestamptz |

## Herramientas del AI Agent (6)

Las 4 que definió el negocio + 2 adicionales aprobadas explícitamente:

1. `consultar_precios_sedes(invitados)` — SELECT en `precios_sedes` JOIN
   `sedes` WHERE `capacidad_invitados = {{invitados}}`. Si el número de
   invitados no es exacto, el prompt instruye al LLM a redondear hacia arriba
   antes de llamar la tool (regla de negocio, no lógica en SQL).
2. `consultar_inclusiones_evento(tipo_evento)` — SELECT en `tipos_evento`.
3. `verificar_disponibilidad_calendario(fecha, sede)` — Google Calendar
   free/busy sobre el `google_calendar_id` de la sede.
4. `bloquear_fecha_calendario(fecha, sede, nombre_cliente)` — crea evento
   "SEPARADO - [Nombre Cliente]" en el calendario de la sede + upsert en
   `agenda_reservas` (estado `separado`) + actualiza `leads.estado`.
5. `enviar_cotizacion_email(email, contenido)` *(agregada)* — Gmail, para
   enviar cotización o confirmación por escrito. El guion de ventas no tiene
   un paso explícito para pedir el correo; se agrega un paso opcional al
   prompt para solicitarlo antes de cotizar/confirmar por escrito.
6. `escalar_a_humano(motivo)` *(agregada)* — marca `leads.requiere_humano =
   true` y envía WhatsApp al equipo interno con el resumen del caso. Una vez
   marcado, el flujo dejará de responder automáticamente a ese lead (ver
   Flujo n8n).

## System Prompt (Brian Otero)

Se usa tal cual lo definió el negocio: rol, personalidad/tono, embudo de
ventas paso a paso (saludo → apertura → perfilamiento → uso de herramientas →
cierre con sistema de separado → seguimiento), técnicas de anclaje de valor y
upselling (Focus Art con regalo de drone si se paga 100% con 60 días de
anticipación; Pirotecnia Show), y restricciones (nunca inventar precios,
redondear invitados al escalón superior, nunca confirmar fecha sin usar la
herramienta de calendario). Se agrega únicamente el paso opcional de
solicitar correo antes de `enviar_cotizacion_email`.

## Flujo n8n

```
WhatsApp Cloud API Trigger
  → extraer teléfono + mensaje
  → upsert lead en Supabase (por teléfono)
  → IF leads.requiere_humano = true
      → fin (sin respuesta automática)
    ELSE
      → AI Agent (Gemini, system prompt Brian Otero,
         memoria de conversación en Postgres por teléfono,
         6 tools conectadas)
      → nodo de envío WhatsApp Cloud API con la respuesta
```

No se requiere un "webhook de salida" separado — el envío de WhatsApp es el
último nodo del mismo flujo disparado por el webhook de entrada.

## Despliegue

- Desarrollo: n8n corre local (instalación npm existente, datos en
  `~/.n8n`), Supabase corre local vía `supabase start` (stack Docker ya
  disponible en la máquina).
- El workflow de n8n y el esquema SQL quedan versionados en este repo
  (`supabase/migrations/`, JSON del workflow cuando se construya).
- Migración a producción: `supabase link` + `supabase db push` al proyecto
  cloud (sin cambios de esquema); el workflow de n8n se sube a n8n Cloud
  manualmente o vía MCP, una vez el usuario instale el skill/MCP de n8n que
  tiene planeado y comparta las credenciales.
- La construcción del workflow JSON en n8n se hace en una fase posterior,
  después de que el usuario instale sus skills de n8n y entregue los tokens
  correspondientes.

## Fuentes de datos semilla

Extraídas de `docs/paquetes.txt` (inclusiones por tipo de evento),
`docs/paquetes todo incluido.txt` (matriz de precios por sede/capacidad),
`docs/pirotecnia.txt` y `docs/Paquete Focus Art & Christian Sierra.pdf`
(servicios de upselling).
