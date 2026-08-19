# Estado del proyecto y prompt de continuación

Documento de traspaso entre sesiones. Actualizado: 2026-08-18.
Rama de trabajo: **`gestorVideos`** (20 commits por delante de `main`, sin mergear).

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
> Las tareas A y B ya están construidas y **bloqueadas solo por credenciales
> que debe crear el usuario** (Google Calendar y WhatsApp Business Cloud).
> Ver la sección 7 para desbloquearlas. Si no hay credenciales todavía,
> lo único que avanza sin ellas es la **Tarea F** (parte Postgres de
> `escalar_a_humano`).

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

### ✅ Sub-workflow `agendar_cita` — construido, sin probar
- Workflow id **`Fh441U9EMcNs98PR`**
  ("Christian Sierra — Herramienta: agendar_cita"), 9 nodos, inactivo.
  Exportado a `n8n/workflow-agendar-cita.json`, documentado como herramienta
  **#9** en `n8n/herramientas.md`.
- Conectado al agente como nodo `agendar_cita` (`toolWorkflow` 2.2), pero
  **`disabled: true`** para que el agente no la ofrezca mientras no se pueda
  ejecutar.
- Valida la entrada del LLM (tipo, nombre, formato de fecha/hora, horario ya
  pasado) y devuelve el rechazo redactado como instrucción para que el agente
  corrija y reintente.
- **No se ha ejecutado ni una vez.** Le faltan dos cosas, ambas del usuario:
  1. La credencial *Google Calendar OAuth2 API* en los nodos `Buscar Choques`
     y `Crear Cita`.
  2. Reemplazar `PENDIENTE__ID_CALENDARIO_EMPRESA` por el Calendar ID real
     del calendario de empresa, en esos mismos dos nodos.
  Hecho eso, hay que habilitar el nodo `agendar_cita` y probar los tres
  caminos: entrada inválida, horario libre y horario ocupado.

### ✅ Sub-workflow `enviar_medios` — construido, sin probar
- Workflow id **`Q1jkIpsljCX1Tiuv`**
  ("Christian Sierra — Herramienta: enviar_medios"), 13 nodos, inactivo.
  Exportado a `n8n/workflow-enviar-medios.json`, documentado como herramienta
  **#8** en `n8n/herramientas.md`.
- Conectado al agente como nodo `enviar_medios` (`toolWorkflow` 2.2),
  **`disabled: true`**.
- Los campos de media del nodo WhatsApp (Task 6 del plan) se verificaron
  leyendo el paquete instalado en
  `~/AppData/Roaming/npm/node_modules/n8n/node_modules/n8n-nodes-base/dist/nodes/WhatsApp/`,
  no la UI. Quedaron registrados en `herramientas.md`.
- **Corrección respecto al plan:** los nodos de WhatsApp van con
  `onError: continueRegularOutput`, así que un envío fallido también sale por
  la salida normal. Se agregó un IF `¿Envío exitoso?` antes de
  `Registrar Envío`; sin él un archivo rechazado por Meta quedaría registrado
  como enviado y el filtro anti-repetición lo suprimiría para siempre.
- **Falta:** la credencial *WhatsApp Business Cloud* y, con ella, el campo
  `phoneNumberId` de `Enviar Video` y `Enviar Foto` (es un desplegable que
  solo carga con la credencial conectada). Por eso `n8n_validate_workflow`
  reporta 2 errores en ese sub-workflow: son ese pendiente, no un defecto.

### ✅ Nodo `Catálogo de Medios` — en producción y verificado
- Insertado en la ruta viva, entre `¿Bot activo?` (rama verdadera) y
  `Brian Otero`. `select fn_catalogo_digest() as digest`.
- **Probado en ejecución real** (ejecución 1902): devuelve 14 líneas de
  catálogo en 203 ms y el agente sigue respondiendo con normalidad.
- Todavía no lo lee nadie: la sección `MATERIAL VISUAL DISPONIBLE` está en
  `n8n/system-prompt-brian-otero.md` pero **no** en el nodo del agente.
  Se copia cuando exista la credencial de WhatsApp — ver el aviso al inicio
  de ese archivo.

> ⚠️ **El prompt del repo y el del nodo son distintos a propósito.** El nodo
> corre una variante reducida, sin mención a las herramientas que aún no están
> conectadas. Un prompt que nombra herramientas inexistentes hace que el modelo
> prometa cosas que no puede cumplir. El archivo del repo lo explica y dice qué
> mover y cuándo.

### ❌ Lo que falta

| # | Falta | Bloqueado por |
|---|---|---|
| A | ~~Sub-workflow `agendar_cita`~~ **construido**; falta credencial Calendar + Calendar ID de empresa, y probarlo | Usuario |
| B | ~~Sub-workflow `enviar_medios`~~ **construido**; falta credencial WhatsApp + `phoneNumberId`, y probarlo | Usuario (Tarea G) |
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

8. **El editor de n8n abierto pisa lo que se escribe por API.** Al agregar
   `agendar_cita` al workflow principal, el `PUT` respondió `success` y con
   `nodeCount: 17`, pero al releerlo el nodo no estaba y **varias posiciones
   habían cambiado** — señal de que la pestaña del editor guardó su copia en
   memoria encima. Dos consecuencias prácticas:
   - **Cerrar o refrescar la pestaña del workflow antes de escribir por API.**
   - **Nunca creer el `success` del `PUT`:** releer siempre con
     `n8n_get_workflow` y confirmar que el nodo está y que sus `parameters`
     sobrevivieron. Es el mismo reflejo que exige el bug de `typeVersion`
     del punto 1, por dos causas distintas.

9. **La credencial "Neon Postgres (Motion Dreams)" fue borrada** por accidente
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

## 7. Cómo desbloquear A y B (lo hace el usuario)

Las dos herramientas están construidas y exportadas. Lo único que falta son
accesos que no se pueden crear por API.

### A — `agendar_cita`: Google Calendar

1. En la UI de n8n, crear la credencial *Google Calendar OAuth2 API* con el
   Client ID/Secret de la sección 2 y hacer **"Connect my account"**.
   (No usar `Google Calendar account` / `account 2`: son de otros proyectos.)
2. Decir cuál es el **Calendar ID** del calendario de empresa
   (Google Calendar → configuración del calendario → "Integrar calendario" →
   ID del calendario).
3. Con eso: asignar la credencial a `Buscar Choques` y `Crear Cita` del
   workflow `Fh441U9EMcNs98PR`, reemplazar en ambos el
   `PENDIENTE__ID_CALENDARIO_EMPRESA`, habilitar el nodo `agendar_cita` y
   probar los tres caminos: entrada inválida, horario libre, horario ocupado.

### B — `enviar_medios`: WhatsApp Business Cloud

1. Crear la credencial *WhatsApp Business Cloud* (Tarea G).
2. Elegir el **Sender Phone Number** (`phoneNumberId`) en `Enviar Video` y
   `Enviar Foto` del workflow `Q1jkIpsljCX1Tiuv`, y también en
   `Enviar WhatsApp` y `Aviso Fallo Agente` del principal.
3. Reactivar los nodos de WhatsApp del workflow principal, hoy `disabled`.
4. **Copiar la sección `MATERIAL VISUAL DISPONIBLE`** de
   `n8n/system-prompt-brian-otero.md` al *System Message* del nodo
   `Brian Otero`, junto con su restricción. Sin ese paso el agente nunca
   llamará la herramienta, porque no sabe que existe el material.
5. Habilitar el nodo `enviar_medios` y correr la **Task 9** del plan de medios
   (pruebas end-to-end y de escalabilidad).

> 📌 El catálogo cargado hoy son sedes e institucional. **No hay material de
> `categoria = servicio`**, así que la prueba de Pirotecnia de la Task 9 no se
> puede correr hasta que se cargue ese contenido.

---

## 8. Qué sigue

Con credenciales, el orden es: terminar **A** y **B** (arriba), luego **C/D**
(calendario por sede, que además necesita la Tarea H: crear los 15 calendarios
y registrar sus `google_calendar_id`), luego **E** (Gmail) y **F**.

**Sin credenciales, lo único que avanza es la Tarea F**, y solo a medias: el
`update leads set requiere_humano = true` es un nodo Postgres que se puede
construir y probar ya con la credencial de Supabase que sí existe. El aviso al
equipo necesita WhatsApp.

Después de todo eso queda la **Tarea I**: migrar n8n al VPS de Hostinger.
