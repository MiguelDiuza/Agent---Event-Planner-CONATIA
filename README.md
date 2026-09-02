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
node scripts/probar-excel.js       # las filas que los nodos escriben en el Excel del equipo
```

**Contra la base real.** Necesitan `SUPABASE_PROJECT_REF` y
`SUPABASE_ACCESS_TOKEN` del `.env`, y limpian sus propios datos al terminar:

```bash
node scripts/banco-pruebas.js      # 10 conversaciones completas, mensaje por mensaje
node scripts/probar-ramas.js       # las ramas del turno 3 que los chats no tocan
node scripts/probar-fragmentos.js  # los mensajes que llegan por partes
node scripts/probar-aforos.js      # cuántos salones salen para cada aforo, y con qué precio
node scripts/probar-caso-asesor.js # el traspaso al asesor después de la cita
node scripts/probar-sincronizacion.js # la vuelta del Excel a la agenda, workflow entero sin n8n ni Google
```

`probar-caso-asesor.js` y `probar-sincronizacion.js` aceptan `--local` para
correr contra el Supabase local por el contenedor de Docker, en vez de contra
producción.

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
catálogo (`sedes`, `precios_sedes`, `tipos_evento`, `medios`,
`servicios_adicionales_upselling`) no se toca nunca.

Con `leads` se van también, por CASCADE, `reservas` y `cotizaciones_aforos` —la
ficha del cliente y los aforos que ya se le cotizaron—. No hace falta borrarlas
a mano, pero sí **mirarlas al comprobar que el reseteo quedó en cero**: son las
dos que hacen que el agente "recuerde" el evento y la cantidad de personas, así
que si sobrevivieran, el chat no arrancaría de verdad desde el saludo.

## El Excel del equipo

El calendario y el Excel del equipo eran dos verdades distintas. Los dos flujos
que escriben en Google Calendar escriben ahora también una fila en la hoja:
`separar_fecha_evento` en la pestaña **Reservas**, `agendar_cita` en **Citas**.

Cada fila lleva una columna `origen`. El nodo la escribe fija en `Bot`, porque
solo corre cuando fue Angie quien agendó; las filas que carga o escribe una
persona quedan en `Confirmación humana`. Es la misma distinción que
`agenda_reservas.origen` guarda en Postgres.

El nodo va **después** del insert en Postgres y **antes** del `Set` que le
contesta al agente, con `onError: continueRegularOutput`. Si Google Sheets
falla, la venta no se cae: la fecha ya quedó en Postgres y en Calendar, que son
la fuente de verdad, y la hoja es el reflejo. Un reflejo que falla no vale una
reserva perdida.

```bash
node --env-file=.env scripts/preparar-excel.js           # mira cómo está la hoja
node --env-file=.env scripts/preparar-excel.js --crear   # crea las pestañas y los encabezados
node --env-file=.env scripts/preparar-excel.js --probar  # escribe una fila real, la relee y la borra
```

`--probar` **relee** la fila que acaba de escribir en vez de fiarse de lo que
mandó. Los nodos escriben con `valueInputOption=USER_ENTERED`, que interpreta
la celda igual que si la tecleara una persona: lo que empieza por `+`, `-`, `=`
o `@` entra como fórmula. El teléfono de contacto sale normalizado a E.164
(`+573001234567`), así que sin escapar se guardaría como el número
`573001234567` — sin el `+57` y sin poder marcarse. Por eso las columnas de
texto van con un apóstrofo delante, que Sheets se come; `probar-excel.js`
comprueba que a ninguna se le olvide.

Los encabezados viven en `PESTANAS`, dentro de `preparar-excel.js`, y son la
única fuente de verdad del orden de las columnas: `probar-excel.js` los importa
de ahí y compara celda por celda contra la fila que arma cada nodo, para que
nadie pueda mover una columna sin mover el nodo.

**La cuenta de servicio de las hojas no es la de Calendar**, y eso tiene una
razón que conviene entender antes de tocar nada: la Google Sheets API se
habilita en el proyecto dueño de la **credencial que hace la llamada**, no donde
vive la hoja. Son dos cosas distintas.

El proyecto del cliente (`omega-dahlia-500617-g6`) la tiene apagada y no hay
forma de encenderla desde aquí: la cuenta de servicio no tiene
`serviceusage.services.enable` —ni permiso para consultar siquiera el estado del
servicio, comprobado contra la API— y a la consola de ese Google no se entra
porque pide verificación en dos pasos y la cuenta es del cliente.

La salida es que la llamada la haga una cuenta de servicio de **nuestro**
proyecto. La hoja se queda donde está; solo hay que compartirla como Editor con
el correo de esa cuenta. La de Calendar no se toca: sigue en el proyecto del
cliente y sigue sin poder tocar hojas de cálculo.

```bash
node --env-file=.env scripts/credencial-sheets.js .gcp-sa-sheets.json --crear --repuntar
```

La llave va en `.gcp-sa-sheets.json` (el `.gitignore` ya cubre
`.gcp-sa-*.json`). El guion da de alta la credencial en n8n, restringida al
scope `.../auth/spreadsheets` y al dominio `sheets.googleapis.com`, y apunta los
dos nodos a ella.

La cuenta que escribe hoy es
`chris-164@rising-precinct-507407-c3.iam.gserviceaccount.com`, en un proyecto
**sin organización** creado con una cuenta de Gmail personal. No fue un capricho:
la organización de Workspace bloquea la descarga de llaves JSON
(`constraints/iam.disableServiceAccountKeyCreation`), así que el proyecto tuvo
que quedar fuera de ella. Conviene tenerlo presente el día que haya que rotar
esa llave: el acceso cuelga de esa cuenta personal, no de la empresa.

Los dos nodos están **encendidos y corriendo en el VPS** desde el 2026-09-02.

### La vuelta: del Excel a la agenda

Lo de arriba es de una sola dirección: la base escribe en la hoja. Falta el
otro sentido, y no es una comodidad — es un agujero. **El agente consulta la
disponibilidad en `agenda_reservas`, no en Calendar.** La línea exacta, dentro
de `fn_verificar_disponibilidad_evento`:

```sql
select bool_or(r.estado in ('separado','bloqueado_temporal'))
from agenda_reservas r
where r.sede_id = v_sede_id and r.fecha_solicitada = p_fecha;
```

Así que una fecha que una persona del equipo vende y anota a mano en el Sheets,
para el agente sigue **libre**: se la puede confirmar a otro cliente, y eso no
se descubre hasta que el asesor llama.

`workflow-sincronizar-hoja.json` cierra esa vuelta. Cada **15 minutos** lee la
pestaña `Reservas`, mete en `agenda_reservas` lo que falte con
`origen='humano'` y `estado='separado'`, y crea el evento de Calendar de cada
fecha nueva. Nueve nodos, pero toda la decisión vive en una sola función de
Postgres —`fn_sincronizar_agenda_desde_hoja`, migración `20260902000001`—, que
es lo que permite probarla sin n8n y sin Google.

Las cuatro decisiones que había que tomar, y cómo quedaron:

| | |
|---|---|
| **Choques con el bot** | Gana la base. Una fila del Excel no pisa una fecha que apartó Angie: esa tiene `lead_id` y `google_event_id`, y sobrescribirla dejaría un evento huérfano en Calendar y un cliente con una fecha que ya no es suya. Se reporta y lo resuelve una persona. |
| **Filas mal escritas** | Ninguna tumba la corrida. Cada fila se resuelve sola y la que no se entiende sale rechazada **con el motivo escrito en la hoja**, en la columna `sincronizado`. Nadie mira los logs de n8n: si el rechazo no está ahí, no está en ninguna parte. |
| **Borrados** | Borrar la fila **no** libera la fecha — un borrado accidental pondría a la venta un sábado ya vendido. Se libera escribiendo `sí` en la columna `cancelada`, y solo si la apartó una persona. Liberar tampoco es borrar: la fila se queda en `disponible`, con el rastro de quién la tenía. |
| **Frecuencia** | Cada 15 minutos. Una lectura de la hoja y una consulta; acota a un cuarto de hora la ventana en la que el agente podría vender una fecha recién apuntada a mano. |

Por eso la pestaña `Reservas` pasó de ocho columnas a diez: `cancelada`, que
escribe una persona, y `sincronizado`, que escribe el workflow. Una fila que se
queda **sin nota** es la señal de que la sincronización no la está viendo.

Las notas se calculan solo a partir del estado de ahora, sin fechas ni horas
dentro, y solo se manda a Google lo que cambia: en régimen la pasada de cada
cuarto de hora no escribe ni una celda.

```bash
node --env-file=.env scripts/probar-sincronizacion.js --local  # el workflow entero, sin n8n ni Google
node --env-file=.env scripts/volcar-agenda-a-calendar.js       # fechas ocupadas sin evento en Calendar
```

`volcar-agenda-a-calendar.js` es el arranque, no un guion de todos los días: de
aquí en adelante el propio workflow crea el evento de cada fecha nueva. Se usó
el 2026-09-02 para meter en Calendar las 113 fechas que el equipo ya tenía
vendidas y que solo vivían en la base. Es idempotente por dos vías —se salta lo
que ya tiene `google_event_id` y además lee el calendario y se salta lo que ya
está allá—, porque sin la segunda un evento creado cuyo `update` de vuelta se
perdió acabaría duplicado en cada corrida.

## Después de la cita, el caso es del asesor

Cuando un cliente ya tuvo su llamada o su visita y vuelve a escribir, lo que
pregunta casi siempre es sobre algo que ajustó **en** esa reunión: un descuento
de palabra, una fecha que movieron, un abono. Angie no estuvo ahí y no tiene
cómo saberlo, así que si contesta, contesta mal — y con la misma seguridad con
la que contesta todo lo demás, que es lo que lo vuelve caro.

El flujo entonces: le dice al cliente que el asesor retoma su caso, le avisa al
asesor por WhatsApp y se calla en ese chat (`requiere_humano`, el mismo
interruptor que usa `Pausar Bot` cuando el dueño contesta a mano).

La detección es **determinista** y no pasa por el modelo: `fn_caso_asesor` mira
si hay una cita con `fin` en el pasado que todavía no se le haya avisado a
nadie. Salta con **cualquier** mensaje posterior a la cita, no solo con los que
preguntan algo: distinguir una pregunta de un "gracias" exige criterio y el
modelo se equivoca, y después de una reunión el caso ya es del asesor de todos
modos. Un "gracias" que le llega al asesor no cuesta nada; una pregunta que el
bot contesta mal cuesta la venta.

**El aviso va como plantilla de WhatsApp, no como texto libre.** WhatsApp solo
deja mandar texto libre a quien te haya escrito en las últimas 24 horas. Al
cliente sí se le puede contestar de corrido —acaba de escribir—, pero el asesor
casi nunca le habrá escrito al número del bot, así que ese aviso saldría
rechazado. Por eso existe `aviso_caso_asesor`:

```bash
node --env-file=.env scripts/plantilla-asesor.js          # cómo va la aprobación
node --env-file=.env scripts/plantilla-asesor.js --crear  # la manda a revisión de Meta
```

Si el aviso **no** sale (plantilla sin aprobar, YCloud caído, el número mal), la
cita queda **sin** marcar como avisada y el lead va igual a la cola de
`requiere_humano`: al cliente ya se le dijo que lo contactan, así que el bot no
puede seguir como si nada, pero la tabla tampoco puede decir que el asesor sabe
algo que no sabe.

**Pendiente:** el nodo `Caso del Asesor` está **deshabilitado**, y es el
interruptor de toda la rama —apagado, `hay_caso` no existe, el `IF` se va por el
`false` y el flujo sigue exactamente como antes—. Se enciende cuando estén las
dos cosas que faltan: el **número real del asesor** en `Avisar al Asesor` (hoy
hay un marcador, `+570000000000`) y la plantilla en `APPROVED`.

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
| `reservas` | La ficha del cliente: un evento por fila. Es lo que el agente lee en cada turno |
| `cotizaciones_aforos` | Qué aforos ya se le cotizaron a cada cliente, por tipo de evento |

## Credenciales pendientes de configurar en n8n

Estas se configuran en la UI de n8n (Credentials), no en este repo:

- **WhatsApp Business Cloud API** (Meta) — canal de entrada y salida
- **Google Gemini** — modelo del AI Agent
- **Google Calendar OAuth2** — disponibilidad y bloqueo de fechas por sede
- **Gmail OAuth2** — envío de cotizaciones
- **Postgres** — apuntando a la conexión de Supabase de arriba
