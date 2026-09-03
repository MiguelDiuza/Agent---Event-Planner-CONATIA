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
node scripts/auditar-fechas-excel.js  # ¿alguna fecha vendida en el libro que el agente vea libre?
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
node --env-file=.env scripts/probar-reserva-completa.js  # el embudo entero, hasta apartar la fecha
```

`probar-reserva-completa.js` es la única que sigue una venta de punta a punta:
dos clientes distintos —uno que escribe entero, otro corto y con errores— desde
el "hola" hasta que la fecha queda apartada, y después comprueba el rastro en
**los cuatro sitios**: `agenda_reservas`, el evento de Google Calendar (que
exista, que sea de día completo y transparente), la fila del Excel con su
`origen` y su id de evento, y la ficha del cliente. El aserto que importa es que
después `fn_verificar_disponibilidad_evento` diga **OCUPADA**: lo demás son
reflejos. Limpia lo que creó —Calendar primero, que es lo que deja huérfanos si
se hace al revés— y **relee cada tabla** para probar que no quedó rastro.

Sus fechas son sábados libres de 2027, y no más lejos a propósito: el prompt
trata una fecha a **más de tres años** como un año tecleado mal y pregunta en
vez de apartar. La primera versión usaba 2029, caía justo en esa regla y las dos
reservas se quedaban sin cerrar — el agente hacía lo correcto y la prueba lo
contaba como fallo.

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

### Y los calendarios por salón, que es donde el equipo vende (2026-09-03)

Lo de arriba solo mira la pestaña `Reservas`, que es una tabla hecha para la
máquina. **El equipo no vende ahí**: vende en el calendario de cada salón —
`CIUDAD JARDIN`, `MUNDO FOTO`, `AV 3 NTE`, `GRANADA GOLD 2026`…— y en los dos
maestros (`2026`, `2027`). De ahí salió, **una sola vez y a mano**, la carga del
2026-09-01. Desde entonces cada venta nueva anotada en esos calendarios era
invisible para el agente: la fecha seguía libre y podía confirmársela y
apartársela a otro cliente. Ese es el agujero que trajo esta rama.

Los cinco nodos nuevos de `workflow-sincronizar-hoja.json` leen esas trece
pestañas cada quince minutos y las meten por la **misma**
`fn_sincronizar_agenda_desde_hoja`, con las mismas cuatro decisiones de la tabla
de arriba. Ni se le pide al equipo que cambie de costumbre, ni se duplica la
lógica que decide.

**El año de esas celdas no es de fiar y el día de la semana sí.** El libro nació
como `2025.xlsx` y se reutilizó para 2026: media hoja conserva el año viejo, y
la columna que dice la verdad es la del día. `2025-12-04 VIERNES` es el 4 de
diciembre de **2026**, que es el que cae en viernes. Se resuelve buscando, en
una ventana de cinco años, el único que cae en ese día — y si cayeran dos, se
rechaza en vez de elegir. En los maestros no se busca nada: la pestaña `2027` es
de 2027, y una fila suya con el día mal puesto se pregunta, no se mueve de año.
Eso último no es teoría: `2027!B53 "SABADO 8"` acababa en **2029**, apartando un
sábado que nadie ha vendido.

**Borrar tampoco libera aquí.** Ninguna fila de esas pestañas puede soltar una
fecha: si alguien borra un nombre de su calendario, la fecha sigue apartada.
Para soltarla hay que decirlo en `Reservas`, con la columna `cancelada`, que es
donde queda el rastro de quién la tenía.

**La pestaña `Revisar`.** En los calendarios del equipo no se puede escribir la
respuesta al lado de cada fila —son su documento, copia fiel del libro que
llevan—, así que lo que no se pudo meter en la agenda se recoge en una lista
aparte: qué pestaña, qué fila, qué celda y por qué. Nadie mira los logs de n8n;
si el rechazo no está ahí, no está en ninguna parte. Las fechas pasadas **no**
salen —son cientos y enterrarían lo que importa— y la lista se reescribe solo
cuando cambia, así que en régimen esa pasada tampoco toca una celda.

**Los nombres del equipo, en un solo sitio.** El equipo escribe `AVDA 3 NORTE`,
`AV 3 NTE`, `LAS PILAS`, `3RA NORTE`, `H. TALISMAN` — y ninguno de los cinco
resolvía a ninguna sede: comprobado contra la base antes de tocar nada. El día
que empezaran a usar la hoja, cada una de esas filas habría salido rechazada.
Ahora viven en la tabla `sedes_alias` (migración `20260902000004`), y quien los
traduce es `fn_resolver_sede`, **la misma función** que usan la sincronización y
la auditoría.

Esa tabla también sabe decir «este salón no es nuestro»: un alias con
`sede_id` en null es un nombre que se ignora a propósito, con el motivo escrito
al lado. Ver el apartado de Granada, abajo.

```bash
node --env-file=.env scripts/auditar-fechas-excel.js   # ¿alguna fecha vendida que el agente vea libre?
```

**Y una tercera verificación, justo antes de apartar.** Cada quince minutos deja
una ventana: entre que una persona vende un sábado y que la agenda se entera
pueden pasar quince minutos, y en ese rato el agente ve esa fecha libre.
Apartar una fecha es raro —unas cuantas al día— y es lo irreversible, así que
ahí sí se puede pagar una lectura de la hoja: `separar_fecha_evento` **llama a
la sincronización y la espera** antes de insertar. No duplica nada, llama al
mismo workflow; en el otro extremo hay un `executeWorkflowTrigger` al lado del
de cada quince minutos.

Si esa llamada falla —Google caído, la hoja renombrada— la venta **no** se cae:
sigue con lo que la agenda ya sabía, que es lo que habría pasado sin esto. Un
candado que se rompe no puede cerrar la puerta con el cliente fuera.

Quedan entonces tres cierres, de fuera adentro:

| | |
|---|---|
| **Cada 15 minutos** | La agenda se pone al día con el libro entero, sin que nadie haga nada. |
| **Al apartar** | Se vuelve a leer la hoja y se espera, para que la ventana de quince minutos no exista en el único momento que importa. |
| **En el insert** | `on conflict (sede_id, fecha_solicitada) do nothing`. Es una restricción de la base, no una comprobación: aunque las dos anteriores fallaran, dos ventas no pueden ocupar la misma fecha en el mismo salón. El nodo lo detecta y el agente le dice al cliente que esa fecha ya no está. |

La auditoría **no repite la lógica: la corre**. Los rangos salen del nodo `Leer
Calendarios`, las filas las resuelve el código del nodo `Leer Calendarios en
Filas` leído del `.json`, y el salón lo resuelve `fn_resolver_sede`. Lo único
que no ejecuta es la sincronización, porque escribe: auditar no puede arreglar
nada por su cuenta, o nunca sabrías si el arreglo estaba puesto. Además avisa de
dos cosas que ninguna prueba veía: una pestaña de calendario que el workflow no
está pidiendo, y una que pidió y no llegó —un salón entero sin sincronizar, en
silencio—.

### El libro viejo, dentro del nuevo

El archivo nuevo empezó siendo un recorte: de todo lo que el equipo tenía en
`2025.xlsx` (WPS), a la base solo llegó `sede + fecha + cliente`, y solo de hoy
en adelante. El 2026-09-02 se copió el resto, para que el archivo nuevo no sea
un recorte del viejo sino que lo contenga:

```bash
python scripts/leer-excel-viejo.py ~/Downloads/2025.xlsx /tmp/hojas   # .xlsx -> un .json por pestaña
node --env-file=.env scripts/replicar-hojas-excel-viejo.js /tmp/hojas            # en seco
node --env-file=.env scripts/replicar-hojas-excel-viejo.js /tmp/hojas --escribir
```

Son **21 pestañas**: la tabla de precios `VALORES`, los dos maestros (`2026`,
`2027`), un calendario por sede, y tres ocultas que son plantillas vacías
(`CASA` = Alférez Sur, `ORQUIDEORAMA`, `7 DE AGOSTO`). Se copian **como están**,
con su orden y con las ocultas ocultas. Los calendarios por sede llevan lo que
la base no tiene ni necesita: teléfono, valor, los cuatro abonos y el saldo.

Se escribe en crudo (`RAW`), no interpretado, y al terminar se relee y se
compara **celda por celda** contra el origen. Contar filas no basta: un `PUT`
que se come una celda del medio devuelve 200 y el mismo número de filas, y el
desfase no se vería hasta que alguien buscara un teléfono y encontrara un abono.

**Estas pestañas son para las personas, no para el agente.** El agente lee
`agenda_reservas`, y a la base solo llega lo que está en `Reservas`. Copiar una
venta en `CIUDAD JARDIN` **no aparta la fecha**. Por eso `Reservas` y `Citas`
están protegidas en el guion: si un `.json` viniera con uno de esos nombres, se
niega antes de tocar nada.

**El año de las fechas del libro viejo no es de fiar.** El archivo se llama
`2025.xlsx` y se reutilizó para 2026: muchas celdas conservan el año viejo, y lo
que dice la verdad es la columna del día de la semana. `2025-09-05 SABADO` es el
5 de septiembre de **2026**, que es el que cae en sábado. Así se cargaron las
113, y así hay que leer cualquier fecha de esas hojas.

De ahí salieron tres que la carga del 2026-09-01 se dejó — tomó el año literal,
las vio pasadas y las descartó: `Sede Granada Premium 2027-08-07` (MARTHA
CAMPOS), `Sede Granada Premium 2027-08-14` (YESENIA MORENO) y `Casa 4
2026-12-27` (DIEGO MONTOYA). Esta última venía en la hoja de Granada con
"CASA 4" escrito en la columna del día; **la sede se resolvió por el precio**:
17.100.000 para 120 personas es la tarifa de Casa 4 en la propia hoja `VALORES`
(Granada Premium para 120 son 11.300.000).

De esas tres **solo sobrevive la de Casa 4**: las dos de Granada Premium se
fueron ese mismo día con la sede entera, ver abajo.

### Granada Premium no existe (2026-09-02)

Preguntado a propósito, el cliente respondió: «el salón premium debes ignorarlo
completamente, para nosotros es como si no existiera porque es de una
administración diferente». El que trabajan es el Gold.

Se borró de raíz — migración `20260902000003`, sus 32 fechas de
`agenda_reservas`, sus 32 eventos de Calendar y sus 32 filas de la pestaña
`Reservas`. Dejarla sin precios y sin video **no la escondía del todo**: si un
cliente la nombraba, `fn_verificar_disponibilidad_evento` la resolvía y le
contestaba si estaba libre, como si fuera de la casa. Y ponerle
`es_propia = false` habría sido peor: pasaría a ser sede aliada, y esas el
agente sí las ofrece.

Borrarla arregló además una molestia vieja: mientras existían las dos,
**"Granada" a secas era ambiguo** y el agente respondía "sé más específico"
en vez de contestar. Con una sola Granada en el catálogo, se resuelve solo.

Lo que se copió del libro viejo **no se tocó**: las hojas `GRANADA 2026`,
`GRANADA 2027` y `GRANADA` siguen ahí como archivo, porque son copia fiel del
documento del equipo. Lo que se quitó es la sede del catálogo del agente.

**Ratificado el 2026-09-03, y con una consecuencia que faltaba.** El cliente lo
volvió a decir con estas palabras: «Granada se ignora por completo. Solo se
tiene en cuenta Granada Gold. Ninguna otra.» Vino a cuento de una captura: el
agente le dijo a un cliente que el **viernes 4 de diciembre** estaba libre en
Granada Gold, y en la pestaña `GRANADA 2026` ese día lo tiene MONICA BEDOYA.
Son dos salones distintos y el agente acertó — en `GRANADA GOLD 2026` el 4 de
diciembre no tiene fila—; el precio de la venta lo confirma: 7.000.000 para 60
personas es la tarifa de Granada **Premium** menos el millón de descuento de
viernes (la de Gold para 60 sería 6.500.000). El libro lleva los dos calendarios
en paralelo, con clientes distintos el mismo día: el 12 de diciembre, ADRIANA en
uno y NATALIA PLAZA en el otro.

Lo que sí estaba mal era otra cosa, y no se veía: al quedar una sola Granada,
**`"GRANADA"` a secas pasó a resolver a `Sede Granada Gold`** por el casado por
contenido. Como el equipo distingue `GRANADA` y `GOLD` en su propia columna de
salón, la primera fila que dijera «GRANADA» habría **bloqueado una fecha buena
del Gold** con una venta del vecino. Desde `20260902000004` eso se rechaza con
su motivo escrito —«si es del Gold, escribe "Granada Gold"»— en vez de
adivinarse; `GRANADA GOLD 2026` sí se resuelve, porque dice Gold. Y las tres
pestañas de Granada no se leen: no están entre las que pide el workflow.

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

El **número del asesor** es `+573006174717`, puesto el 2026-09-02 en
`Avisar al Asesor`. Va en E.164 y sin espacios: YCloud rechaza el envío si el
`to` no viene así. `probar-caso-asesor.js` comprueba que sea un número de verdad
y no el marcador `+570000000000` que estuvo ahí hasta entonces — es el fallo más
caro de esta rama y el que menos ruido hace: el aviso sale hacia un teléfono que
no existe, YCloud lo acepta, y el cliente espera una llamada que nadie sabe que
debe hacer.

**Pendiente:** el nodo `Caso del Asesor` está **deshabilitado**, y es el
interruptor de toda la rama —apagado, `hay_caso` no existe, el `IF` se va por el
`false` y el flujo sigue exactamente como antes—. Se enciende cuando la
plantilla `aviso_caso_asesor` pase a **APPROVED**, y no antes.

El "no antes" importa: con la plantilla en PENDING el envío falla, y el camino
de error hace lo que debe —dejar el caso en `requiere_humano`— pero eso significa
que **el bot se calla en ese chat y el asesor no se entera**. Al cliente se le
prometió una llamada, el bot deja de contestarle, y nadie sabe que tiene que
llamarlo. Con la rama apagada el bot sigue atendiendo, que es mucho mejor.

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
