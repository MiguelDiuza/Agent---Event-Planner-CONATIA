# Estado del proyecto y prompt de continuación

Documento de traspaso entre sesiones. Actualizado: 2026-08-19.
Rama de trabajo: **`gestorVideos`** (18 commits por delante de `main`, sin mergear).

---

## PROMPT PARA PEGAR EN LA NUEVA SESIÓN

> Continúo el desarrollo del agente de ventas de WhatsApp "Brian Otero"
> (Christian Sierra Event Planner) en
> `c:\Users\mandi\Documents\GitHub\Agent---Event-Planner-CONATIA`,
> rama `gestorVideos`.
>
> Lee primero `docs/ESTADO-Y-CONTINUACION.md` completo: tiene el estado real
> verificado, las credenciales, los errores ya diagnosticados que NO hay que
> volver a investigar, y la lista ordenada de lo que falta.
>
> Retomamos en la **Tarea A: construir el sub-workflow `agendar_cita`**.

---

## 1. Qué es el proyecto

Agente conversacional de WhatsApp que perfila clientes, cotiza eventos (15
años, matrimonios, grados…), hace upselling y cierra reservas de fecha.
n8n orquesta, Gemini razona, Supabase guarda todo.

Documentos de diseño (leer si hace falta contexto profundo):
- `docs/superpowers/specs/2026-08-12-n8n-event-planner-agent-design.md` — diseño del agente
- `docs/superpowers/specs/2026-08-14-envio-medios-whatsapp-design.md` — diseño del envío de fotos/videos
- `docs/superpowers/plans/2026-08-14-envio-medios-whatsapp.md` — plan de implementación de medios (tareas 1-4 hechas, 5-9 pendientes)
- `.superpowers/sdd/2026-08-14-envio-medios-whatsapp/progress.md` — bitácora con todas las decisiones tomadas y su porqué

---

## 2. Accesos y credenciales

### Supabase Cloud (producción, ya conectado)
- Project ref: `jehhlnfygiaavmxgaxpz`
- URL: `https://jehhlnfygiaavmxgaxpz.supabase.co`
- Token de acceso CLI: `ver .secrets.local.md (gitignored)`
  (expira ~30 días desde 2026-08-18; si falla, el usuario genera otro en
  supabase.com/dashboard/account/tokens)
- Uso: `export SUPABASE_ACCESS_TOKEN=... && supabase db query --linked "SQL"`
- El repo ya está enlazado (`supabase link` hecho).

### n8n local
- URL: `http://localhost:5678` — se levanta con `n8n start`
- Versión: **2.21.7**
- API key guardada en la BD de n8n; para extraerla:
  ```python
  import sqlite3
  con = sqlite3.connect("file:C:/Users/mandi/.n8n/database.sqlite?mode=ro", uri=True)
  cur = con.cursor()
  cur.execute("select apiKey from user_api_keys where label='claudeLocal'")
  print(cur.fetchone()[0])
  ```
  Se usa como header `X-N8N-API-KEY`.
- Workflow principal: id **`JpODij1ebqkRSAc1`**
  ("Christian Sierra — Brian Otero (Agente Ventas WhatsApp)")
- Credencial Postgres a Supabase: id **`ErY9RiTjTsXVB0JC`**
  ("Supabase - Christian Sierra") — ya conectada a los 5 nodos que la usan.

### Google OAuth (creado, PERO SIN CONECTAR)
- Client ID: `11556097498-nj6nr5ialn882o8ih6l3vdckvukjb3kp.apps.googleusercontent.com`
- Client Secret: `ver .secrets.local.md (gitignored)`
- Redirect URI configurado: `http://localhost:5678/rest/oauth2-credential/callback`
- **Falta que el usuario cree las credenciales en la UI de n8n y haga
  "Connect my account".** La API de n8n rechaza crearlas (bug de validación
  de esquema en esta versión; ya se intentaron 3 variantes, no insistir).
- Las credenciales `Google Calendar account` / `account 2` que aparecen en la
  lista son de OTROS proyectos del usuario — no usarlas.

### WhatsApp Business Cloud
- **No existe todavía.** Decisión del usuario: se deja para el final.
- Por eso los nodos `WhatsApp In`, `Enviar WhatsApp` y `Aviso Fallo Agente`
  están **temporalmente deshabilitados** (`disabled: true`) para que el
  workflow pueda activarse. Reactivarlos al conectar Meta.

---

## 3. Estado real, verificado

### ✅ Base de datos Supabase — completa y probada
11 migraciones aplicadas en cloud, 68 aserciones pgTAP en verde
(`supabase test db` contra el stack local).

| Tabla / objeto | Estado |
|---|---|
| `sedes`, `precios_sedes` | 15 sedes; matriz de precios completa (6 sedes 50-200, 7 hasta 150, 2 desde 100 — los huecos son capacidad física real, no errores) |
| `tipos_evento` | 7 filas |
| `servicios_adicionales_upselling` | 10 filas |
| `leads`, `agenda_reservas` | creadas |
| `medios`, `envios_medios` | creadas, **con RLS habilitado** |
| `vista_catalogo_medios` | agrupa por (categoría, referencia, tipo) |
| `fn_medios_para_enviar`, `fn_medios_diagnostico`, `fn_registrar_envio`, `fn_catalogo_digest` | funcionando |
| Bucket Storage `medios` | público, **15 piezas cargadas y catalogadas** |

Contenido cargado: 12 videos/fotos de sede + 1 promo + 2 testimonios.
Los institucionales se distinguen por la columna `etiqueta`
(`'promocion'` / `'testimonio'`).

### ✅ Workflow n8n — probado de extremo a extremo por chat
- 16 nodos. Workflow **activo**.
- Canal de prueba local: **Chat Trigger público**, webhook
  `3f9c1d27-5b84-4e16-9a70-2d5c8e1b4f33`.
  Probar con:
  ```bash
  curl -s -X POST "http://localhost:5678/webhook/3f9c1d27-5b84-4e16-9a70-2d5c8e1b4f33/chat" \
    -H "Content-Type: application/json" \
    -d '{"action":"sendMessage","sessionId":"prueba-001","chatInput":"Hola"}'
  ```
- Verificado en ejecución real: el agente saluda con el guion, mantiene
  memoria entre turnos, y **llamó 2 herramientas contra Supabase** devolviendo
  precios reales (Sede Sur 66 $6.900.000, Granada Gold $7.500.000, etc.).
- Las 3 herramientas de consulta, la memoria y el LLM están correctamente
  conectados al agente.

### ❌ Lo que falta

| # | Falta | Bloqueado por |
|---|---|---|
| A | Sub-workflow `agendar_cita` | Credencial Calendar |
| B | Sub-workflow `enviar_medios` (tool #8) | Credencial WhatsApp (para enviar) |
| C | `verificar_disponibilidad_calendario` (tool #4) | Credencial Calendar |
| D | `bloquear_fecha_calendario` (tool #5) | Credencial Calendar + WhatsApp (aprobación) |
| E | `enviar_cotizacion_email` (tool #6) | Credencial Gmail |
| F | `escalar_a_humano` (tool #7) | Parcial: la parte Postgres se puede hacer ya; el aviso al equipo necesita WhatsApp |
| G | Credenciales WhatsApp Business Cloud | Usuario (decidió dejarlo para el final) |
| H | `sedes.google_calendar_id` está vacío en las 15 sedes | Usuario debe crear los calendarios por sede |
| I | Migrar n8n al VPS de Hostinger | Después de todo lo anterior |

---

## 4. Errores ya diagnosticados — NO volver a investigarlos

Esto costó tiempo. Están resueltos o entendidos; no repetir el diagnóstico.

1. **`typeVersion` 2.7 no existe en este n8n.** El paquete instalado llega
   hasta **2.6** para `postgres`/`postgresTool`. Con 2.7 la UI muestra
   "Install this node to use it" y **n8n borra silenciosamente los
   `parameters` del nodo**. Al crear nodos Postgres nuevos, usar `2.6`.
   Versiones máximas verificadas en esta instalación:
   `postgres` 2.6 · `if` 2.3 · `code` 2 · `set` 3.4 · `whatsApp` 1.1 ·
   `agent` 3.1 · `chatTrigger` 1.4 · `memoryPostgresChat` 1.4 ·
   `googleCalendar` 1.3 · `gmail` 2.2 · `toolWorkflow` 2.2 ·
   `executeWorkflowTrigger` 1.1

2. **No existe variante "Tool" del nodo Google Calendar.** Las herramientas de
   calendario tienen que ser sub-workflows (`toolWorkflow`), como ya decía el
   diseño original.

3. **Expresiones que dependen del canal.** `Extraer Mensaje` solo corre en la
   ruta de WhatsApp y `Normalizar Chat` solo en la de chat. Cualquier nodo
   compartido debe usar `$('Upsert Lead')` (corre en ambas) o el patrón
   `{{ $('X').isExecuted ? ... : ... }}`. Ya aplicado en el nodo de memoria y
   en el prompt del agente.

4. **`supabase db reset` destruye el Storage.** Los metadatos viven en
   `storage.objects` de la misma base: un reset deja las 15 URLs del catálogo
   en 404 aunque los archivos sigan en el bucket. Usar `supabase migration up`.

5. **La API de n8n rechaza crear credenciales OAuth2 de Google** (error de
   validación de esquema `allOf`). Hay que crearlas en la UI.

6. **Al hacer PUT del workflow por API**, quitar `settings.binaryMode` — el
   esquema lo rechaza (`must NOT have additional properties`).

7. **Caracteres corruptos al exportar el workflow.** El JSON que devuelve la
   API trae un surrogate suelto; para exportar al repo hay que leer con
   `errors="surrogatepass"` y limpiar con
   `s.encode('utf-8','replace').decode('utf-8')`.

8. **La credencial "Neon Postgres (Motion Dreams)" fue borrada** por accidente
   durante esta sesión. Dejó 19 nodos rotos en 3 workflows de Motion Dreams
   (2 activos). **El usuario dijo explícitamente que lo ignoremos** — no es
   parte de este proyecto.

---

## 5. Decisiones de diseño ya tomadas (no re-preguntar)

- **Almacenamiento de medios:** Supabase Storage con bucket público, se envía
  la URL a Meta. Descartado Google Drive (obliga a bajar/subir el binario en
  cada envío).
- **Quién decide enviar medios:** el agente, vía herramienta única
  `enviar_medios(categoria, referencia, tipo_medio)`.
- **Dónde vive el "cuándo enviar":** en la columna `medios.cuando_usar`,
  inyectada al system message vía `fn_catalogo_digest()`. Agregar un video es
  un `insert`, nunca editar el prompt.
- **Citas (`agendar_cita`):** un solo calendario de empresa (una sola persona
  atiende, no puede haber citas en paralelo). Duración **30 min** para todos
  los tipos, con **30 min de colchón** entre citas. Tipos: `visita_sede`,
  `prueba_traje`, `llamada`, `asesoria`. **Sin aprobación humana** (bajo
  riesgo). El evento debe llevar en título/descripción: tipo, nombre del
  cliente, teléfono, y el detalle propio del tipo (qué sede y para cuántos,
  qué traje, el número a llamar, etc.).
- **`bloquear_fecha_calendario` SÍ requiere aprobación humana** por WhatsApp
  (`sendAndWait`) — separar una fecha ocupa una sede real.
- **Nunca interpolar `$fromAI()` dentro de SQL.** Siempre `$1,$2` +
  `options.queryReplacement`. El teléfono nunca viene de `$fromAI()`.
- **Límites WhatsApp:** imagen ≤ 5.242.880 bytes, video ≤ 16.777.216 bytes,
  H.264+AAC. La constraint de la BD ya los valida.
- **Los `.txt` de `docs/` no los lee el agente** — fueron la fuente para
  escribir el seed. Si cambia un precio, se actualiza la BD, no el `.txt`.

---

## 6. Convenciones del repo

- Comentarios SQL y documentación **en español**, explicando el *porqué*.
- Mensajes de commit **en inglés**, sujeto en imperativo, cuerpo explicando el
  porqué, y trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Nunca editar una migración ya aplicada; agregar una nueva con
  `create or replace`.
- Probar en el Supabase **local** (`supabase migration up` + `supabase test db`)
  antes de `supabase db push` a cloud.

---

## 7. Siguiente tarea (A): sub-workflow `agendar_cita`

**Precondición:** el usuario debe crear en la UI de n8n la credencial
*Google Calendar OAuth2 API* con el Client ID/Secret de la sección 2 y hacer
"Connect my account". También hace falta que diga el **Calendar ID** del
calendario de empresa (Google Calendar → configuración del calendario →
"Integrar calendario" → ID del calendario).

**Estructura a construir** (workflow nuevo, luego conectarlo como
`toolWorkflow` al agente):

1. `Execute Workflow Trigger` (v1.1) con entradas: `tipo_cita`, `fecha`,
   `hora`, `detalle`, `telefono`, `nombre`.
2. Nodo `Code` que calcule la ventana de conflicto: la cita ocupa
   `[hora, hora+30min]`, y con el colchón de 30 min hay choque si existe
   cualquier evento entre `hora-30min` y `hora+60min`. Zona horaria
   `America/Bogota`.
3. `Google Calendar` → *Get Many Events* en esa ventana, con
   `alwaysOutputData: true` (si no, con cero eventos n8n salta los nodos
   siguientes y la rama de "libre" nunca corre — mismo patrón ya documentado
   para `enviar_medios`).
4. `IF` ¿hay choque? → rama ocupada devuelve al agente que proponga otro
   horario; rama libre continúa.
5. `Google Calendar` → *Create Event*, 30 min, con título
   `[tipo_cita] Nombre` y descripción con teléfono + detalle.
6. `Set` que devuelve al agente el resumen de lo agendado.

Descripción para el LLM (la que lee para decidir cuándo llamarla):
> Agenda una cita con el asesor. Úsala cuando el cliente quiera visitar un
> salón, tomarse medidas para un traje, recibir una llamada o una asesoría.
> `tipo_cita` es exactamente uno de: visita_sede, prueba_traje, llamada,
> asesoria. `fecha` en formato YYYY-MM-DD y `hora` en HH:MM (24h). En
> `detalle` incluye lo que hace falta según el tipo: qué sede y para cuántos
> invitados, qué traje, o el número a llamar.

Después de A, seguir el orden: **B** (`enviar_medios`, el plan detallado está
en `docs/superpowers/plans/2026-08-14-envio-medios-whatsapp.md` tareas 6-9),
luego **C/D** (calendario por sede), **E**, **F**.
