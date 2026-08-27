# Estado del proyecto y prompt de continuación

Documento de traspaso entre sesiones. Actualizado: 2026-08-27.
Rama de trabajo: **`main`** — `gestorVideos` se mergeó (fast-forward) el 2026-08-27.

---

## PROMPT PARA PEGAR EN LA NUEVA SESIÓN

> Continúo el agente de ventas de WhatsApp **Angie Otero** (Christian Sierra
> Event Planner) en `c:\Users\mandi\Documents\GitHub\Agent---Event-Planner-CONATIA`,
> rama `main`.
>
> **Todo está en producción desde el 2026-08-27.** Lee
> `docs/ESTADO-Y-CONTINUACION.md`: la **sección 0 QUATER** es lo último que se
> hizo —los mensajes que llegan por partes, el número de contacto y las fechas
> que ya pasaron— y la **sección 0** describe el embudo.
>
> **La base y el calendario están EN CERO** desde la noche del 2026-08-27, a
> propósito, para que la próxima tanda de pruebas arranque limpia.
>
> **Lo único que falta es la prueba por WhatsApp con un número real**, que no se
> puede hacer desde la máquina. Escríbele al **+573150290928** y comprueba, en
> este orden:
>
> 1. **La primera cotización.** Saludo → nombre y evento → personas y fecha. Tiene
>    que llegar: antesala → cotización parte 1 → parte 2 → parte 3 → obsequios →
>    14 videos → *"¿cuál te llamó más la atención?"*.
>    Si los videos llegan **antes** del texto, `Enviar Texto` no está publicado.
> 2. **La segunda, en el mismo chat.** Pídele cotizar otro evento con otra
>    cantidad de personas. Tiene que salir la cotización completa del paquete
>    nuevo, un globo con la lista de valores para esa cantidad, y **cero videos**.
>    La antesala debe **nombrar el paquete** ("…la cotización del paquete
>    Matrimonio…"), no prometer videos.
> 3. **El reenvío.** Pídele que te reenvíe el video de un salón. Primero debe
>    mandarte a mirar más arriba en el chat; si insistes, llega el video.
> 4. **Los mensajes por partes.** Mándale cuatro seguidos, rápido: `quiero`,
>    `que sea`, `para 150`, `personas`. Tiene que llegar **una sola respuesta**,
>    unos ocho segundos después del último, y tiene que hablar de 150 personas.
>    Si contesta cuatro veces, el buffer no está publicado.
> 5. **Que lo normal siga siendo rápido.** En el mismo chat, contéstale `sí` a
>    cualquier pregunta. Tiene que responder de una, sin los ocho segundos. Esa
>    es la mitad del cambio que más fácil se rompe.
> 6. **Un número a medias.** Cuando te pida el número de contacto, dale
>    `31502909`. Debe pedírtelo otra vez, con calidez, sin decirte que lo
>    escribiste mal, y **sin agendar nada**.
> 7. **Una fecha que ya pasó.** Pídele cotizar para "el 15 de marzo". Debe
>    preguntarte si te refieres al **lunes 15 de marzo de 2027**, con el día de
>    la semana, y esperar a que confirmes antes de mirar disponibilidad.
>
> **Estado del despliegue (2026-08-27):**
>
> | Workflow | id | versión activa | para volver atrás |
> |---|---|---|---|
> | `enviar_medios` | `Tkh6deuiy663KNkl` | `8094c587-42aa-4cee-a332-3d252eee082f` (no se tocó) | `c345e1a6-f72b-41f7-8f5a-3b24d2c5f622` |
> | Angie Otero (agente) | `NsJQxBhrNyrKFVJu` | `c0b1faaa-6b6d-4da6-a519-3709eebb12bd` | `257af8d2-0628-4cdf-9568-f35a942446d4` |
> | `agendar_cita` | `w3p5TRsicq13Jmig` | `9f2279e2-2ff2-44c1-99ca-adccf90a69b9` | `335bfd36-35ad-4a4c-90fe-c1d0589222ca` |
> | `separar_fecha_evento` | `Mxz7P208vVXhyNg9` | `8a109ad9-bc1a-4367-aa5d-59afa5c9cf75` | `db9d09b4-c3d8-4753-b10b-d94a9690a87d` |
>
> Los `.json` de las versiones anteriores están en `.respaldo-vps-2026-08-27/`
> (fuera de git), tal como los devolvió la API antes de publicar.
>
> Las versiones viejas siguen en el historial de n8n: se vuelve desde el
> selector de versiones del editor. Un `PUT /api/v1/workflows/<id>` por la API
> **publica** (al terminar `versionId` y `activeVersionId` quedan iguales); no
> hace falta un paso aparte. Si alguna vez difieren, **lo que corre es
> `activeVersion.nodes`**, no `nodes`.
>
> **Lo que ya está hecho y NO hay que rehacer:**
> - Migraciones aplicadas en Supabase hasta `20260827000001` inclusive.
> - Cuatro workflows publicados en el VPS, con las credenciales enlazadas y
>   `active: true`: `enviar_medios`, el agente, `agendar_cita` y
>   `separar_fecha_evento`. El de Seguimiento sigue inactivo y sin tocar.
> - Sawa recomprimido a 14,75 MB y catalogado; Orquideorama y Gran Salón (foto)
>   cargados. La tanda son **14 salones** más el promocional.
> - Siete pruebas, y hay que correr las siete si se toca algo. Están listadas
>   en el README con lo que hace cada una; las de base necesitan el `.env`
>   cargado, y `probar-en-vivo.js` habla con el VPS y gasta cuota de Gemini.
> - **Todo en cero la noche del 2026-08-27:** `leads`, `n8n_chat_histories`,
>   `envios_medios`, `citas`, `agenda_reservas` y `mensajes_fragmentos`
>   vacías, con las secuencias reajustadas, y **Google Calendar vacío**. Esta
>   vez `leads` **sí se borró** —el 26 se había conservado por ser el único
>   registro de quién escribió—, por decisión del usuario. El respaldo está en
>   `.respaldo-2026-08-27-limpieza/`, fuera de git. El catálogo no se tocó.
>
> **Cuatro trampas que ya costaron una vez:**
> - **Los .json traen los nodos DOS veces**: `nodes` y `activeVersion.nodes`. Si
>   editas uno a mano hay que tocar los dos, o el `grep` te miente.
> - **`GOOGLE_GEMINI_API_KEY` está vacía en `.env`**, así que no se puede correr
>   el modelo desde la máquina. Si la consigues, lo primero es verificar que
>   Gemini de verdad manda un solo globo en el turno 3.
> - **La CDN de Supabase Storage sirve el archivo viejo hasta ~1 hora** después
>   de sobrescribir una clave. Si subes un video que Meta tiene que descargar ya,
>   usa un nombre nuevo.
> - **El prompt vive DOS veces**: en `system-prompt-angie-otero.md` y en el
>   `systemMessage` del nodo. Se edita el `.md` y se vuelca con
>   `node scripts/sincronizar-prompt.js --escribir`; sin argumentos, dice si se
>   separaron. Y ojo con el `=` delante del `systemMessage`: sin él, la fecha y
>   el catálogo le llegan al modelo sin evaluar.
>
> **Lo que sigue abierto y depende del negocio:**
> - **Casa 5** no tiene video ni foto: es el único salón fuera de la tanda.
> - **Gran Salón** entra solo con foto; falta su video.
> - **Cuatro sedes sin clasificar** como cerradas o campestres (Sede Granada
>   Gold, Valdemoro, Gran Salón, Orquideorama). De esas el agente no dice el
>   valor de separación. Se arregla con un `update sedes set tipo_espacio`.
> - **Dos archivos huérfanos en el bucket**: `sedes/sawa.mp4` y
>   `sedes/pilasPremium.mp4`. No los usa nadie.
> - **15 eventos huérfanos en Google Calendar** de las pruebas ya borradas de la
>   base. Los ids están en `.respaldo-2026-08-26/google-event-ids.tsv` (fuera de
>   git, lleva conversaciones de clientes); las
>   credenciales de Google están vacías en `.env`, así que hay que limpiarlos a
>   mano o con una corrida de n8n. Los dos que importan son las reservas del
>   4 de octubre (Casa Christian's) y el 15 de diciembre (Sede Granada Gold):
>   bloquean fechas reales y la base ya no sabe que existen.

---

## 0 QUATER. TRES DETALLES QUE SE VEÍAN EN EL CHAT (2026-08-27, noche)

Lo último que se hizo. **Publicado en el VPS y verificado en vivo.** Los tres
salieron de mirar conversaciones reales, y los tres se notaban sobre todo por lo
poco humano que hacían ver al agente.

### 1. Los mensajes que llegan por partes

**El problema.** Mucha gente en WhatsApp no escribe un mensaje: escribe cuatro.

```
quiero
que sea
para 150
personas
```

El agente contestaba los cuatro, uno por uno, y ninguna de las cuatro respuestas
podía tener sentido, porque ninguno de los cuatro mensajes lo tenía. Al cliente
le queda clarísimo que está hablando con una máquina.

**La restricción que mandó sobre el diseño**, dicha por el negocio con estas
palabras: *"no quiero que con esto entorpezcamos y ralenticemos los tramos de la
conversación que sí funcionan bien"*. Un cliente que escribe completo no puede
pagar ni un segundo por el que escribe por pedazos. Eso descarta de entrada la
solución obvia — "espera unos segundos por si acaso" —, porque en este embudo la
mayoría de los turnos son cortos y completos: `sí`, `Miguel`, `150`, `Casa 4`.

**Cómo quedó.** Cada mensaje entrante se guarda en `mensajes_fragmentos` antes de
llegar al agente. Después:

- Si el mensaje **se lee completo**, se reclama en el acto y sigue. Cero espera.
  Es el camino del 90% de los turnos, y el costo total son dos consultas.
- Si **parece un pedazo**, la ejecución espera 8 segundos. Si en ese rato entra
  otro mensaje del mismo cliente, **la ejecución vieja se calla** y la nueva se
  queda con todos los pedazos juntos. El agente ve un solo mensaje.

La forma exacta de la regla es lo único que hay que entender del detector:

> El **primer** mensaje solo espera si es gramaticalmente **imposible** que ahí
> termine la frase — `quiero`, `que sea`, `para`, o si acaba en coma o
> suspensivos. Nada más.
>
> Una vez la ráfaga ya arrancó, la vara baja: cualquier mensaje corto se le
> suma, porque el cliente ya demostró que está escribiendo por pedazos.

Esa asimetría es la que resuelve el cuarto pedazo del ejemplo. `personas`, suelto,
es indistinguible de una respuesta completa; lo único que lo delata es que hay
tres pedazos esperando. Y es también lo que garantiza que un `sí` nunca espere.

**Una trampa que ya costó un rato:** `sí` y `si` se escriben igual una vez que se
les quita el acento para comparar, y `si` es una conjunción que no puede cerrar
frase. Sin una lista aparte de respuestas de una palabra, **cada "sí" del cliente
esperaba ocho segundos**. Está atrapado en `probar-fragmentos.js`, bloque 1.

**Quién decide qué.** `fn_reclamar_fragmentos` es la que impide las dos cosas que
no pueden pasar — que dos ejecuciones contesten el mismo pedazo, o que un pedazo
se quede sin contestar. Solo la ejecución del mensaje **más nuevo** se lleva el
lote, y se lo lleva entero; a las demás les devuelve cero filas, que es la señal
de callarse. En una ráfaga de cuatro eso pasa tres veces y es lo normal.

La ventana de 5 minutos de esa función es una red de seguridad, no parte del
diseño: si n8n se reinicia mientras una ejecución espera, su fragmento queda
pendiente para siempre, y sin la ventana se le pegaría al mensaje que ese cliente
escriba tres días después.

### 2. El número de contacto tenía que quedar marcable

**El problema.** La validación era `digitos.length < 7`. Entraban números a
medias — el cliente escribe `31502909` y se le va el "enviar", o dicta el número
por audio y la transcripción se come una cifra — y la cita quedaba agendada con
un número al que nadie puede llamar. El asesor se entera cuando marca.

No era hipotético: **la única cita que había en la base al hacer esta limpieza
tenía `telefono_contacto = '31575643'`**, ocho dígitos.

**Cómo quedó.** Colombia entera está en 10 dígitos desde la renumeración de 2022:
celular `3XX XXX XXXX`, fijo `60X XXX XXXX` con indicativo de 601 a 608. Se
aceptan las dos, con o sin `+57`, `0057` o el `0` de larga distancia, y con los
espacios, puntos, guiones y paréntesis que a cada quien le dé por poner. Sale
normalizado a E.164, así que en Google Calendar y en `citas` queda siempre
escrito igual.

Lo que se rechaza dice **cuántos dígitos tenía**, para que el agente pueda
pedirlo otra vez sin sonar a reproche: *"creo que se me cortó el número, ¿me lo
confirmas completo?"*, nunca *"lo escribiste mal"*. El cliente no se equivocó.

**El validador está DUPLICADO** en `Calcular Ventana` (agendar_cita) y en
`Validar Datos` (separar_fecha_evento), porque n8n no deja compartir código entre
workflows. Eso no se puede arreglar, pero sí vigilar:
`scripts/probar-telefono.js` corre **las dos copias** contra la misma tabla de
casos y falla si dejan de coincidir, incluidos los textos.

### 3. Una fecha que ya pasó se pregunta, no se corrige

**El problema.** El cliente dice "el 15 de marzo" estando en agosto. No se
equivocó: está pensando en el año que viene y da por hecho que se entiende. El
agente hacía una de dos cosas, y las dos mal: la tomaba tal cual —consultar la
disponibilidad de una fecha que ya pasó no significa nada— o le cambiaba el año
por su cuenta y lo dejaba con una fecha apartada que nunca pidió.

**Cómo quedó.** La herramienta le devuelve al agente el guion ya armado, con las
dos fechas escritas y **con su día de la semana**:

> Ay, cuéntame una cosita para no equivocarme: el domingo 15 de marzo de 2026 ya
> pasó ☺️ ¿Me estás hablando del lunes 15 de marzo de 2027? Confírmame y te valido
> de una la disponibilidad para esa fecha 🤗

El día de la semana no es adorno: el mismo día y mes cae en otro día el año
siguiente, y eso es justamente lo que le permite al cliente darse cuenta de un
vistazo. Lo nombra `fn_fecha_en_letras`, que existe porque `to_char(..., 'TMDay')`
depende del `lc_time` del servidor, que en Supabase es inglés.

Se comprueba en tres sitios, porque son tres puertas distintas a la misma
fecha: `verificar_disponibilidad_evento` (y ahí la comprobación se movió
**arriba** de las de sede: una fecha del año pasado hay que atajarla aunque
además el nombre de la sede venga mal escrito), `separar_fecha_evento`, y el
prompt, en la sección `FECHAS QUE NO CUADRAN`. Una fecha a más de tres años
recibe el mismo trato: es casi seguro un año tecleado mal.

### Qué se tocó

| Pieza | Cambio |
|---|---|
| `mensajes_fragmentos` + `fn_reclamar_fragmentos` | **Nuevos.** Migración `20260827000001`. |
| `fn_fecha_en_letras` | **Nueva.** Migración `20260827000000`. |
| Agente: `Registrar Fragmento`, `Detectar Fragmento`, `¿Esperar al resto?`, `Esperar Continuación`, `Reclamar Fragmentos`, `¿Me toca contestar?` | **Seis nodos nuevos** entre `¿Bot activo?` y `Catálogo de Medios`. |
| Agente: nodo `Angie Otero` | El `text` pasa a leer `Reclamar Fragmentos`; la expresión que saca el texto de los tres canales se mudó a `Registrar Fragmento`. Sigue habiendo una sola copia. |
| Agente: `verificar_disponibilidad_evento` | La fecha se revisa antes que la sede; el rechazo lleva el guion armado. |
| `Calcular Ventana` (agendar_cita) | Validador de teléfono; sale normalizado a E.164. |
| `separar_fecha_evento`: `Validar Datos`, `¿Datos válidos?`, `Datos Inválidos` | **Tres nodos nuevos.** Este workflow no validaba absolutamente nada. |
| `system-prompt-angie-otero.md` | `FECHAS QUE NO CUADRAN`, la regla del número completo, y la nota de que los mensajes por partes llegan ya unidos. |
| `scripts/probar-telefono.js`, `probar-fragmentos.js`, `revisar-workflows.js`, `probar-en-vivo.js`, `simular-fragmentos.js`, `sincronizar-prompt.js`, `vaciar-calendario.js` | **Nuevos.** |
| `scripts/banco-pruebas.js` | `separar_fecha_evento` y `agendar_cita` ya no entran por detrás al SQL: pasan por sus nodos de validación. Y un turno puede traer `fragmentos`. |
| `scripts/casos-prueba.js` | Casos **9** (escribe por partes, número a medias) y **10** (fecha que ya pasó). |

### Cómo se probó

Seis pruebas, y hay que correr las seis si se toca algo:

```
node scripts/revisar-workflows.js   sin errores   los 5 workflows, 100 nodos
node scripts/probar-agenda.js       sin fallos    horario y horas libres
node scripts/probar-telefono.js     sin fallos    teléfono (dos copias) y fecha
node scripts/probar-fragmentos.js   sin fallos    el reparto de la ráfaga
node scripts/probar-ramas.js        sin fallos    las ramas del turno 3
node scripts/banco-pruebas.js       0 errores     10 conversaciones completas
```

**Y una séptima, que es la que de verdad cerró el asunto:**
`node scripts/probar-en-vivo.js` manda la ráfaga contra el n8n del VPS, con
Gemini de por medio. Es la única forma de comprobar el nodo `Esperar
Continuación` —que exista en esa versión de n8n, que acepte los segundos como
expresión, y que al despertar la ejecución conserve lo que dejó el detector—,
porque nada de eso se ve en un `.json`. Resultado:

```
"quiero"   → (callado)   9417 ms
"que sea"  → (callado)   9432 ms
"para 150" → (callado)   9440 ms
"personas" → ¡Súper! En estos momentos tenemos una súper promo…  16407 ms
```

Uno de cuatro, y el agente habló de 150 personas: recibió el texto unido.

### Todo en cero (2026-08-27, noche)

Después de publicar: `leads`, `n8n_chat_histories`, `envios_medios`, `citas`,
`agenda_reservas` y `mensajes_fragmentos` **vacías**, con las secuencias
reajustadas, y **Google Calendar vacío** (un evento, la llamada de prueba).

Esta vez `leads` **sí se borró**, por decisión del usuario: el 26 de agosto se
habían conservado porque eran el único registro de quién había escrito, y ahora
se quiso arrancar literalmente desde cero. El respaldo de las filas está en
`.respaldo-2026-08-27-limpieza/` (fuera de git: lleva conversaciones de
clientes). El catálogo —`sedes`, `precios_sedes`, `tipos_evento`, `medios`,
`servicios_adicionales_upselling`— no se tocó.

---

## 0 TER. HORARIO NUEVO Y HORAS ALTERNATIVAS REALES (2026-08-27, tarde)

Dos cosas, y la segunda salió de una prueba en producción.

### El horario

**Lunes a sábado, de 10:00 a 19:00, jornada continua, con cita previa. Los
domingos no hay atención.** Antes eran tres franjas distintas (L-V hasta las 19,
sábados hasta las 18:30, domingos de 10:30 a 13:00).

Vive en **un solo sitio**: la tabla `HORARIO` del nodo `Calcular Ventana` de
`agendar_cita`. El domingo no está en la tabla —`HORARIO[7]` es `undefined`— y
eso es lo que lo deja fuera, sin un `if` aparte que haya que acordarse de
mantener. Esa tabla **viaja en la salida del nodo** para que `Calcular Libres`
use exactamente la misma: dos copias se separan, y el día que se separen el
agente ofrecerá horas que el propio validador rechaza. El prompt la repite en
prosa, que es la única duplicación que queda y es inevitable.

### El agente ofrecía horas ocupadas, una detrás de otra

Reportado en producción: *"el agente me decía cuáles estaban disponibles, yo
escogía, se disculpaba, me daba más opciones, y esa tampoco"*. Y **pasaba sobre
todo en la segunda reserva del mismo chat**.

No era mala suerte, eran tres cosas encadenadas:

1. **`Horario Ocupado` devolvía una REGLA, no una hora.** El texto decía *"la
   nueva hora debe empezar al menos N minutos antes o después"* y ninguna hora
   concreta. El agente adivinaba.
2. **El workflow no podía hacer nada mejor:** `Buscar Choques` consultaba
   *únicamente* la ventana de la hora pedida, con `maxResults: 1`. Literalmente
   no sabía qué más había ese día.
3. **Por qué en la segunda cita:** cada cita bloquea su colchón a cada lado —30
   minutos para una visita, 20 para una llamada—, así que la cita que el agente
   acababa de crear inutilizaba justo las horas vecinas, que son las que iba a
   proponer después. La primera reserva casi nunca fallaba; la segunda, casi
   siempre.

**El arreglo.** `Buscar Choques` pasó a llamarse `Leer Agenda` y trae **siete
días completos** (`maxResults: 250`). Un nodo nuevo, `Calcular Libres`, decide
con esa agenda si la hora pedida choca **y** calcula la lista de horas que de
verdad caben, con la misma regla de colchón que valida el choque. `Horario
Ocupado` entrega esa lista. El prompt le prohíbe al agente ofrecer cualquier
hora que no venga en ella.

Detalles que importan:

- **Se ordenan por cercanía a la hora que pidió el cliente.** Si quería las 3 de
  la tarde, ofrecerle las 10 de la mañana es no haberlo escuchado.
- **Si el día está lleno, pasa a los siguientes** en vez de inventar.
- **Si no queda nada en siete días, lo dice** y manda a ofrecer que un asesor lo
  contacte. Nunca una hora inventada.
- Los rechazos de **tiempo** —fuera de horario, domingo, fecha pasada— ya no
  cortan en `Calcular Ventana`: siguen hasta `Calcular Libres` para que también
  ellos salgan con alternativas reales. Los que **no** son de tiempo (tipo
  inválido, falta el nombre o el teléfono) sí cortan ahí: no hay nada que
  ofrecer.
- El agente **nunca ve la agenda**. El prompt lo dice con esas palabras y le
  manda preguntar la hora al cliente en vez de presentarle un menú.

### Qué se tocó

| Pieza | Cambio |
|---|---|
| `Calcular Ventana` | `HORARIO` nuevo; los rechazos de tiempo pasan a marcar `fuera_horario` en vez de cortar; exporta `horario`, `rango_inicio` y `rango_fin`. |
| `Buscar Choques` → **`Leer Agenda`** | Siete días completos, `maxResults: 250`. |
| **`Calcular Libres`** | Nodo nuevo. Decide el choque y calcula las horas libres. |
| `¿Hay choque?` | Lee `$json.ocupado`: choque y fuera de horario salen por la misma rama porque se contestan igual. |
| `Horario Ocupado` | Pasa el mensaje que armó `Calcular Libres`. |
| `agendar_cita` (herramienta) | Descripción nueva: es la única que ve la agenda y devuelve horas libres reales. |
| `system-prompt-angie-otero.md` | Horario nuevo y la regla dura de no ofrecer horas sin verificar. |
| `scripts/probar-agenda.js` | **Nuevo.** Corre el `jsCode` real de los dos nodos con el reloj congelado. |

### Cómo se probó

`node scripts/probar-agenda.js` — 10 bloques, sin fallos. No toca la base ni la
red: lee el `jsCode` de los nodos del `.json`, congela el reloj con
`Settings.now` y le pasa una agenda de mentira. Luxon sale del n8n instalado
global, que es la misma versión con la que corren los nodos.

El bloque que importa es el **5**: cada hora que la herramienta ofrece se le
vuelve a meter a la herramienta, como haría el agente cuando el cliente elija, y
**todas tienen que agendar al primer intento**. Esa es la invariante que se
rompió en producción; si alguien vuelve a tocar el colchón o la rejilla y la
rompe, ese bloque lo atrapa.

---

## 0 BIS. COTIZAR VARIAS VECES EN EL MISMO CHAT (2026-08-27)

Esto es lo último que se hizo y **modifica el turno 3 que describe la sección 0**.
Está **publicado en el VPS** (`enviar_medios` v37, agente v172) y verificado
contra la base de producción — los ids de las versiones anteriores, por si hay
que volver atrás, están en el prompt de traspaso de arriba.

**El pedido del negocio.** Un cliente no siempre trae un solo evento: pregunta
por los 15 de la hija y tres mensajes después por la boda del hermano, o vuelve
otro día con algo distinto. La segunda cotización **no salía**. `Guion
Cotización` terminaba en

```sql
and exists (select 1 from fn_medios_sedes_cotizacion($3, null))
```

o sea, *"solo mando el texto si detrás va a salir un video"*. Como los videos no
se repiten, esa condición se volvía falsa apenas salía la primera tanda y el
segundo evento se quedaba sin cotización: cero filas, sin error, sin nada en el
log, y el agente contestando de memoria.

**La regla nueva: la cotización se repite, los videos no.**

| | Primera vez | Recotización |
|---|---|---|
| Antesala | *"…te voy a enviar nuestra cotización con los videos de cada salón disponible y valores PROMOCIONALES ✨"* | *"…te comparto la cotización del paquete **Matrimonio** con valores PROMOCIONALES ✨"* |
| Guion del paquete | 3 globos | 3 globos |
| Obsequios | 1 globo | 1 globo |
| Precios | en el caption de cada video | **globo de texto** con la lista de salones y su valor |
| Videos | los 14 salones + el promocional | ninguno |

La antesala de la recotización **nombra el paquete** a propósito: el cliente ya
tiene otra cotización más arriba en el mismo chat y las dos empiezan igual.

**Por qué apareció `fn_lista_salones_valores`.** Los precios viajaban pegados a
los videos. Sin videos, la segunda cotización habría salido sin un solo número —
y es el caso normal, porque el segundo evento casi nunca es para la misma
cantidad de personas. La función arma la lista de salones con su valor
PROMOCIONAL para el escalón nuevo, ya repartida en globos. Reparte con el mismo
algoritmo de `scripts/guion-cotizacion.js` (busca por bisección el límite más
bajo que todavía cabe en la misma cantidad de globos), porque el reparto a ojo
dejaba 593 caracteres y después un renglón suelto de 24. Lista **solo salones
con material**, que es la otra mitad de su trabajo: es la lista de la que el
cliente elige cuál quiere volver a ver.

**Reenviar material.** `enviar_medios` tiene una entrada nueva, `reenviar`, que
levanta el anti-repetición de `envios_medios`. El agente la usa **solo si el
cliente lo pide**, y primero lo manda a mirar más arriba en el chat. Dos formas:

- un salón suelto → `referencia` = ese salón, `reenviar` = true;
- la tanda entera → `referencia` = `todas`, `invitados`, `reenviar` = true.

En un reenvío **no se manda `tipo_evento`**: con él la herramienta vuelve a
mandar la cotización completa, y el cliente pidió los videos.

**El bug que salió de paso.** La autoprueba de la migración lo atrapó y ya
estaba vivo: el anti-repetición de la tanda miraba la **pieza** y no el
**salón**. Desde `20260826000008` la tanda elige `distinct on (sede_id)` el
video y, si no hay, la foto — así que una sede con video Y foto (hoy Pilas
Premium) mandaba el video en la primera tanda y **la foto del mismo salón** en
la segunda, porque esa foto no figuraba como enviada. Ahora si el cliente ya vio
ese salón, el salón entero queda fuera.

### Qué se tocó

| Pieza | Cambio |
|---|---|
| `20260826000010_recotizar.sql` | `p_reenviar` en `fn_medios_para_enviar` y `fn_medios_sedes_cotizacion` (las firmas viejas se **dropean**: con un default sin dropear, la llamada de 4 parámetros queda ambigua). `fn_lista_salones_valores` y `fn_empaquetar_globos`. El anti-repetición por salón. Autoprueba incluida. |
| `Guion Cotización` | Dos entradas nuevas (`$6` invitados, `$7` reenviar). Se cayó el `and exists(...)` del final. Antesala en dos formas y lista de valores al final. |
| `Seleccionar Medios` | `$6` reenviar, que pasa a las dos funciones. |
| `Diagnóstico` | `$5`: si el guion salió o no. Cinco ramas en vez de tres — la nueva es la de la recotización, que es la que le dice al agente cómo cerrar el turno. |
| `enviar_medios` (herramienta) | Entrada `reenviar` y descripción nueva. |
| `system-prompt-angie-otero.md` | Secciones **TURNO 3 BIS** y **REENVIAR MATERIAL QUE EL CLIENTE YA RECIBIÓ**. |
| `scripts/casos-prueba.js` | Tres conversaciones nuevas (6, 7 y 8). |
| `scripts/probar-ramas.js` | **Nuevo.** Las diez ramas del turno 3 que las conversaciones no tocan. |

### Cómo se probó

```
node scripts/banco-pruebas.js    # 8 conversaciones: 0 errores, 0 avisos
node scripts/probar-ramas.js     # 10 ramas del turno 3: sin fallos
```

Las tres conversaciones nuevas:

- **6. Julieta** — 15 años (100) y, en el mismo chat, un matrimonio (200). La
  segunda cotización sale con 7 globos (5 + 2 de valores) y cero videos.
- **7. Ricardo** — 15 años (150), después un grado (80), y pide de nuevo el
  video de un salón suelto (`reenviar` = true, 1 pieza, cero globos de guion).
- **8. Diana** — se le borró el chat y pide **todos** los videos otra vez. El
  agente primero la manda a mirar arriba; solo cuando insiste reenvía las 14
  piezas, sin `tipo_evento` y por lo tanto sin cotización.

> ⚠️ **Una cosa quedó decidida y conviene saberla.** El mismo paquete con la
> misma cantidad de personas, pedido dos veces, **sale las dos veces**. Es
> decisión del negocio (2026-08-27). El costo: si el modelo llama la herramienta
> dos veces en el mismo turno, el cliente recibe la cotización duplicada. Lo
> único que lo evita hoy es el prompt, que dice "UNA vez". Si aparece en
> producción, el arreglo es una tabla `envios_cotizacion` con (lead, paquete,
> invitados) y una ventana de unos minutos.

---

## 0. REFACTORIZACIÓN DEL EMBUDO (2026-08-26) — LEER ANTES QUE NADA

El negocio reescribió el cierre de venta. Lo que sigue reemplaza lo que este
documento dice más abajo sobre la cotización, el rótulo de los videos y el
turno post-videos; el resto del documento sigue vigente.

**El embudo quedó en siete turnos:** saludo con nombre y motivo → promo y
perfilamiento (personas + fecha) → **cotización completa + obsequios + los
videos de todos los salones** → eligió salón (disponibilidad y separación) →
separado → la cita → confirmación y redes.

**El cambio de fondo: la cotización ya no la escribe el agente.** `enviar_medios`
con `referencia` = `todas`, `invitados` y `tipo_evento` manda por su cuenta, en
este orden y sin que el modelo toque el texto:

1. la antesala ("Vale [Nombre], a continuación te voy a enviar nuestra
   cotización con los videos de cada salón disponible y valores PROMOCIONALES"),
2. los globos de la cotización del paquete,
3. el globo de obsequios,
4. los videos de todos los salones.

El agente solo escribe el último mensaje del turno: *"Cuéntame cuál de estos
salones te llamó más la atención"*.

Son dos razones y las dos importan. **Orden:** en n8n el material sale mientras
corre la herramienta y el texto del agente sale después, así que un agente que
escribiera la cotización se la mandaría al cliente *detrás* de los catorce
videos que venía a explicar. **Fidelidad:** el texto de los paquetes es el
libreto del negocio, y un modelo que lo redacta lo parafrasea.

### Qué se tocó

| Pieza | Cambio |
|---|---|
| `tipos_evento` | Dos columnas nuevas: `mensajes_cotizacion` (text[]) y `mensaje_obsequio`. Migraciones `20260826000000`, `20260826000003`, `20260826000004` y `20260826000005`. |
| `scripts/guion-cotizacion.js` | Genera esos textos desde `docs/paquetes.txt`. **Para cambiar un paquete se edita ese .txt y se regenera**, no se escribe SQL a mano. |
| `fn_medios_sedes_cotizacion` | Rótulo nuevo, foto cuando no hay video, orden solo por precio. Migración `20260826000001`. |
| `workflow-enviar-medios` | Tres nodos nuevos: `Guion Cotización` (Postgres), `¿Hay guion?` (IF) y `Enviar Texto` (YCloud, batch 1 / 900 ms). `Seleccionar Medios` pasó a `executeOnce` y dejó de leer `$json`. |
| `enviar_medios` (herramienta) | Dos entradas nuevas: `tipo_evento` y `nombre_cliente`. |
| `consultar_inclusiones_evento` | Devuelve `guion_cotizacion` en vez de la prosa. Es para responder dudas puntuales, no para cotizar. |
| `system-prompt-angie-otero.md` | Reescrito por turnos. |

### El rótulo del video

Pasó de `Así se ve X (salón campestre) - $15.000.000 ✨` a
`Salón Sawa - valor PROMOCIONAL: $15.000.000 - 100 personas` (migración
`20260826000008`). La palabra "Salón" la antepone `fn_nombre_salon` **solo
cuando el nombre no dice ya de qué espacio se trata**: nueve de los catorce ya
lo dicen —Sede Norte, Casa 4, Mansión Vallano, Hacienda El Talismán, Gran
Salón— y prefijarlos producía "Salón Gran Salón" y "Salón Sede Norte".

Esa misma migración cierra una discrepancia que llevaba días: el MISMO video
tenía dos nombres según por dónde saliera. En la tanda salía con el rótulo de
precio; si el cliente después pedía ese salón suelto, `fn_medios_para_enviar`
devolvía `medios.caption`, que seguía diciendo "Así se ve Sawa ✨". Ahora las
dos rutas nombran el salón igual. Cuando la sede no cotiza a
esa capacidad, la línea lo dice sola: `hasta 150 personas`, `desde 100 personas`.
El tipo de espacio salió del rótulo por decisión del negocio, pero sigue vivo en
`sedes.tipo_espacio` porque decide el valor de separación.

### Por qué el guion va partido en globos

WhatsApp le pone "Leer más" a un mensaje largo y esconde justo lo que vende.
La cotización se manda en **tres partes**, y eso es una regla del negocio, no
un cálculo de caracteres. Aparte va el techo de los globos que escribe el
agente: **280 caracteres**, que es el tamaño de un mensaje de WhatsApp que se
lee cómodo. Son dos cosas distintas y conviene no volver a mezclarlas: el
guion del paquete llega hasta ~480 por parte y está bien, porque es una lista
y se lee de un vistazo.

Del techo de 280 se sigue lo otro que importa: **no partir en dos globos lo
que es una sola idea y cabe en uno**. El saludo y el turno de la promo son un
solo mensaje cada uno —155 y 249 caracteres—, como están en el libreto del
negocio. Partidos en dos y tres globos, como estuvieron un rato, la
conversación se leía como una máquina disparando.

El **globo de obsequios va literal** de `docs/paquetes.txt`: encabezado
`Te OBSEQUIAMOS ✨`, las viñetas, la línea
`(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)` y el remate
`Por obtener este paquete✨️`. Esa línea del licor **no** va al final de la
tercera parte: en el documento original los obsequios y el cierre son un bloque
contiguo, y tenerla en los dos lados la mandaba repetida
(migración `20260826000005`).

> 📌 El marco cambió el 2026-08-26 por pedido del negocio (migración
> `20260826000009`). Antes era `Adicional: *OBSEQUIOS*✨` con el cierre en
> negrita. Dos trampas del texto nuevo: el cierre va **entre paréntesis y sin
> asteriscos** —o sea, sin negrita en WhatsApp, y es a propósito—, y la
> cabecera lleva ✨ pelado (U+2728) mientras el remate lleva ✨️ con selector
> de variación (U+2728 U+FE0F). Se ven igual y no son el mismo carácter.
> Las viñetas de cada paquete y los tres globos de la cotización no se tocaron.

El corte de las tres partes cae entre viñetas, nunca dentro de una ni
separando "Pasabocas dulces o salados" de sus sub-viñetas. Las migraciones
`20260826000003` y `20260826000004` son el ida y vuelta de esto: la primera
probó con dos partes y la segunda dejó las tres definitivas.

### Estado del catálogo después de esto

La tanda manda **14 salones** más el promocional. Entraron **Sawa** (video
recomprimido de 29,2 MB a 14,75 MB: WhatsApp no acepta más de 16),
**Orquideorama** y **Gran Salón** —este con foto, que es lo único que hay de esa
sede—.

Lo que falta:

- **Casa 5** no tiene ningún archivo. Es el único salón fuera de la tanda.
- **Sede Granada Gold, Valdemoro, Gran Salón y Orquideorama** siguen sin
  clasificar como cerradas o campestres. Ya no afecta el rótulo, pero sí el
  valor de separación, así que de esas cuatro el agente no dice ni el tipo ni la
  cifra. Se arregla con un `update sedes set tipo_espacio`.
- En el bucket quedaron dos archivos sueltos que ya no usa nadie:
  `sedes/sawa.mp4` (reemplazado por `sedes/sawa-whatsapp.mp4`) y
  `sedes/pilasPremium.mp4` (duplicado de `sedes/pilas premium.mp4`).

### El tipo de evento se resuelve por función, no por ILIKE (2026-08-26)

Los dos nodos que buscan el paquete —`consultar_inclusiones_evento` y
`Guion Cotización`— lo hacían con `nombre_paquete ilike '%' || $n || '%'`.
Medido contra 30 variantes reales, **fallaban 12**. Las tres peores eran
`15 Anos`, `Cumpleanos` y `Primera Comunion` **sin tilde**, que es exactamente
lo que la descripción de la herramienta le pedía al modelo que escribiera. Para
ILIKE la `ñ` no es una `n`.

Lo que costaba fallar: si el tipo no casa, `Guion Cotización` devuelve cero
filas y **los catorce videos salen sin la cotización delante**, en silencio, sin
error y sin nada en el log. Era la falla más cara del embudo nuevo.

Ahora resuelve `fn_resolver_tipo_evento(text)` (migración `20260826000006`):
normaliza sin tildes ni signos, consulta la columna `tipos_evento.alias` con los
sinónimos del cliente (`boda`, `graduacion`, `quinceañera`, `empresarial`…) y
busca en los dos sentidos, para que caigan tanto `Cumpleaños 40` como `15`.
Devuelve NULL si no puede decidir, que es preferible a mandar el paquete
equivocado.

La migración lleva las 30 variantes como **autoprueba**: si alguna deja de
resolver, la migración no aplica. Y `Resumen` ahora le avisa al agente cuando la
cotización no salió, para que el fallo deje de ser mudo.

Para agregar un sinónimo: `update tipos_evento set alias = alias || '{...}'`.
No hace falta cargarlo con y sin tilde, se comparan normalizados.

### Nombres de archivo que NO coinciden con la sede (confirmados, no tocar)

Tres piezas del bucket tienen un nombre que no se parece al `nombre_sede` bajo el
que están catalogadas. **El negocio confirmó el 2026-08-26 que el mapeo es
correcto.** Queda escrito porque parecen un error de catalogación y ya se
verificaron una vez: no volver a investigarlas ni "corregirlas".

| Archivo en el bucket | Sede | Por qué confunde |
|---|---|---|
| `sedes/orquideorama norte.mp4` | **Orquideorama** | El archivo dice "norte" y existe una `Sede Norte` aparte, que tiene su propio `sedes/sede norte.mp4`. Son dos salones distintos. |
| `sedes/casa vallado.mp4` | **Mansión Vallano** | "vallado" en el archivo, "Vallano" en la base. |
| `sedes/salos de las pilas.jpeg` | **Pilas Premium** | "salos de las pilas" ≈ salones de Las Pilas. Es la foto de Pilas Premium, que además tiene video propio (`sedes/pilas premium.mp4`); en la tanda gana el video. |

Auditoría completa del 2026-08-26 (bucket contra `medios`): ninguna URL rota,
ningún `peso_bytes` desalineado del tamaño real, ninguna fila apuntando a un
archivo inexistente. Lo único suelto son dos huérfanos, abajo.

Los precios están completos: 16 escalones de 50 a 200 de a 10. La cobertura por
sede no es pareja **y es correcto que no lo sea**: seis sedes cotizan de 50 a
200, siete llegan hasta 150 y dos (Gran Salón y Valdemoro) arrancan en 100.

### Cómo se probó

`node scripts/banco-pruebas.js` corre cinco conversaciones completas contra la
base real, ejecutando **las queries que están en los .json de los workflows**
—se leen de ahí, no se copian— e imprimiendo el chat que le habría llegado al
cliente, mensaje por mensaje. Antes de las conversaciones corre un chequeo de **los siete paquetes** —cada uno
con su nombre canónico y con una variante sin tilde— exigiendo el guion completo:
antesala + 3 partes + obsequios. Después revisa, por turno: largo de cada globo
(280 para lo que escribe el agente), Markdown que se escapa, links con texto
pegado, número de preguntas, y que la tanda mande las piezas esperadas.

Lo simulado es el transporte (en vez de POST a YCloud, imprime) y `agendar_cita`
(va con doble, porque toca Google Calendar).

**Lo que NO prueba: si Gemini obedece el prompt.** `GOOGLE_GEMINI_API_KEY` está
vacía en `.env`, así que los turnos del agente en `scripts/casos-prueba.js` están
redactados a mano siguiendo el prompt. Cuando haya key, eso es lo primero que
hay que cerrar.

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

**Todo lo configurable vive en `.env`** (gitignored). La plantilla comentada,
con la lista completa de variables y de dónde sale cada una, es `.env.example`
— ese sí se versiona. Para empezar: `cp .env.example .env` y rellenar.

Lo que `.env` **no** puede darte: las credenciales de los nodos de n8n
(Postgres, Google, WhatsApp) están cifradas dentro de `~/.n8n/database.sqlite`
y solo se editan desde la UI de n8n. En `.env` quedan sus IDs para ubicarlas.


### Supabase Cloud — migrado de cuenta (2026-08-24)

El proyecto se movió porque `conatiaadmin@gmail.com` entró en auditoría de
Google. Origen y destino son proyectos distintos, no la misma base renombrada.

| | Antes | Ahora |
|---|---|---|
| Cuenta | conatiaadmin@gmail.com | **creatik.motion@gmail.com** |
| Project ref | `jehhlnfygiaavmxgaxpz` | **`vzxcqoqljnndoxmzgfda`** |
| Región | East US (N. Virginia) | **us-west-2 (Oregon)** |
| Credencial n8n | `LK81zhoNwy6nRcuk` | **`Ou3OkUR92F7f6ofK`** |

Se migraron **366 filas en 10 tablas** y **15 archivos (141 MB)** del bucket
`medios`. Conteo final idéntico al origen, cero huérfanos referenciales.

#### Cuatro cosas que no son obvias

1. **Los dos seeds NO se aplicaron, a propósito.** `seed_catalogo` y
   `seed_medios` dejan que la base genere los uuid y resuelven las FK por
   nombre. Aplicarlos habría dado uuid nuevos a `sedes` y `medios`, y las 7
   columnas que apuntan al catálogo (`envios_medios.medio_id`,
   `agenda_reservas.sede_id`, `leads.sede_interes`…) habrían quedado colgando.
   El catálogo entró por el import, con los uuid originales. **Aun así los dos
   quedaron registrados en `supabase_migrations.schema_migrations`**, para que
   un `db push` futuro no los corra y duplique el catálogo entero.

2. **`n8n_chat_histories` se creó a mano.** No está en las migraciones: la crea
   n8n sola la primera vez que usa la memoria. Sin ella se perdían las
   conversaciones vivas. Después del import hay que reajustar la secuencia del
   `serial`, o el próximo mensaje choca contra la primary key.

3. **Se conecta por el POOLER en modo sesión (5432), no por el host directo.**
   `db.vzxcqoqljnndoxmzgfda.supabase.co` no resuelve a IPv4, así que el VPS no
   lo alcanzaría. El pooler que reporta la API viene en modo *transaction*
   (6543); se usa el 5432 porque la memoria del agente necesita sesión.

4. **`supabase db dump` no se usó.** Exige Docker (corre pg_dump en un
   contenedor) y la contraseña de la base. `supabase db query --linked` va por
   la Management API y basta con el access token.

> ⚠️ **El proyecto viejo sigue vivo y con los datos.** No se borró nada. Si algo
> falla, volver es cambiar el id de credencial de vuelta a `LK81zhoNwy6nRcuk`
> en los 21 nodos. Conviene no borrarlo hasta llevar unos días estable.

> 📌 **Alcance real de la auditoría: solo era Supabase.** En una versión previa
> este documento afirmaba que la API key de Gemini y el proyecto GCP
> `omega-dahlia-500617-g6` (dueño del service account `n8n-calendar@…` que usan
> `agendar_cita` y `separar_fecha_evento`) también colgaban de
> `conatiaadmin@gmail.com`. **Eso nunca se verificó y es incorrecto** — se
> dedujo del contexto. El usuario confirmó el 2026-08-24 que Gemini, el
> calendario, el proyecto GCP y el VPS están en cuentas distintas.
>
> Con la base migrada, no queda nada del sistema atado a la cuenta en
> auditoría. El único rastro es el proyecto Supabase viejo
> (`jehhlnfygiaavmxgaxpz`), que se conserva a propósito como respaldo.
>
> El dueño de un proyecto GCP **no se puede saber leyendo el JSON del service
> account**: hay que mirarlo en
> `console.cloud.google.com/iam-admin/iam?project=omega-dahlia-500617-g6`.

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
  ("Christian Sierra — Angie Otero (Agente Ventas WhatsApp)")
- Credencial Postgres a Supabase: id **`ErY9RiTjTsXVB0JC`**
  ("Supabase - Christian Sierra") — ya conectada a los 5 nodos que la usan.

### Google OAuth (creado, PERO SIN CONECTAR)
- Client ID: `11556097498-nj6nr5ialn882o8ih6l3vdckvukjb3kp.apps.googleusercontent.com`
- Client Secret: en `.env` — ver `.env.example`
- Redirect URI configurado: `http://localhost:5678/rest/oauth2-credential/callback`
- **Falta que el usuario cree las credenciales en la UI de n8n y haga
  "Connect my account".** La API de n8n rechaza crearlas (bug de validación
  de esquema en esta versión; ya se intentaron 3 variantes, no insistir).
- Las credenciales `Google Calendar account` / `account 2` que aparecen en la
  lista son de OTROS proyectos del usuario — no usarlas.

### WhatsApp — YCloud, WABA "sierra planner" (2026-08-23)

**Es la conexión definitiva.** Coexistencia: el número sigue vivo en la app de
WhatsApp Business y a la vez habla por la Cloud API, así que Christian puede
contestar a mano sin sacar al bot.

| | |
|---|---|
| Proveedor | YCloud (`api.ycloud.com/v2/whatsapp/messages/sendDirectly`) |
| WABA | `1102665725775760` — "chrisian sierra eventos", BM Motion Dreams Studio |
| Número | `+573150290928` (phone number id `1343776285475377`) |
| Coexistencia | activa — la API reporta `isOnBizApp: true` |
| Límite | TIER_250, `businessVerificationStatus: not_verified` |
| Credencial n8n | `FuwQeM17hSh07Wal` — "YCloud - Sierra Planner" (`httpHeaderAuth`, `X-API-Key`) |
| Webhook | endpoint YCloud `6a8b3f833a7ced1bf600652a` → `/webhook/ycloud-whatsapp` |
| Eventos | `whatsapp.inbound_message.received` + `whatsapp.smb.message.echoes` |

Los 5 nodos de envío (`Enviar WhatsApp`, `Aviso Fallo Agente`, `Enviar Video`,
`Enviar Foto`, `Enviar Recordatorio`) apuntan a esta WABA y comparten esa única
credencial.

#### La WABA cambió: entregar el teléfono rompió la coexistencia (2026-08-24)

El número se registró primero en un teléfono de prueba y ahí se hizo la
conexión. Al entregarle la SIM al cliente y **abrir WhatsApp Business en su
teléfono**, WhatsApp re-registró el número en ese dispositivo. Un número solo
tiene **un dispositivo principal**: ese re-registro invalidó el anterior y con
él el vínculo de coexistencia con la Cloud API.

Síntoma: los mensajes llegaban al celular con doble check pero **no entraba ni
un webhook**. La API lo decía sin ambigüedad — `WABA ... not found` y, al
intentar enviar, `403 WHATSAPP_PHONE_NUMBER_UNAVAILABLE` con `target: "from"`.
El bot no tenía nada roto.

Se arregló rehaciendo el onboarding de coexistencia desde el panel de YCloud,
escaneando el QR **desde el teléfono del cliente**. Eso creó una **WABA nueva**
(`1102665725775760`, antes `3402911193221493`) — la vieja no se recupera.

Tres cosas que se aprendieron:

1. **Ningún nodo hubo que tocar.** Los 5 nodos de envío identifican la WABA por
   el número (`from: +573150290928`), no por el `wabaId` ni el
   `phoneNumberId`. Por eso el cambio de WABA fue transparente. Si alguna vez
   se cambian a `phoneNumberId`, esto deja de ser cierto.
2. **El endpoint del webhook sobrevivió.** Es de la cuenta de YCloud, no de la
   WABA, así que siguió activo y con sus 3 eventos.
3. **Las plantillas viven en la WABA.** Las que hubiera en la vieja no
   existen aquí. Importa para `Seguimiento`, que sigue inactivo justamente
   esperando una plantilla aprobada.

> ⚠️ **Para que no se repita: el número se registra en UN solo teléfono.** Si
> otra persona necesita responder, se usan *dispositivos vinculados*
> (WhatsApp Web / escritorio), nunca abrir WhatsApp Business en otro celular.

> 📌 La WABA nueva reporta `currency: IDR`. Conviene revisarlo en facturación.

#### El bot se calla cuando contesta un humano

Es lo que justifica la coexistencia, y son 3 nodos en `NsJQxBhrNyrKFVJu`
colgados de la salida **falsa** de `¿Entrante de cliente?`:

```
WhatsApp In → ¿Entrante de cliente? ─true→  Extraer Mensaje → … → agente
                      └────────────false→  ¿Eco de humano? → Extraer Eco → Pausar Bot
```

Tres cosas que no son obvias y conviene no re-descubrir:

1. **El eco viaja en `whatsappMessage`, igual que `whatsapp.message.updated`.**
   Por eso `¿Eco de humano?` discrimina por `body.type`, nunca por la presencia
   de esa propiedad: si mirara la forma del payload, cada acuse de recibo
   pausaría un chat.
2. **`Pausar Bot` es un upsert, no un update.** Si el dueño escribe primero a
   un número nuevo, el lead todavía no existe; con un update simple no pasaría
   nada y el bot se metería en cuanto el cliente respondiera. El `on conflict`
   de `Upsert Lead` no toca `requiere_humano`, así que la pausa sobrevive.
3. **El bot no se auto-pausa.** `smb_message_echoes` lo emite Meta *solo* para
   mensajes escritos desde la app o un dispositivo vinculado, nunca para los
   que salen por la Cloud API.

> ⚠️ La pausa **no caduca**: el bot no vuelve solo a ese chat hasta que alguien
> ponga `requiere_humano = false`. Si se quiere una pausa de N horas hace falta
> una columna de timestamp; hoy solo queda el `updated_at` que ya escribe.

> ⚠️ **No suscribir `whatsapp.smb.history`.** Es el volcado del historial de la
> app al hacer el onboarding: entraría en masa por el mismo webhook y crearía
> un lead por cada conversación vieja.

#### Cuentas de YCloud: hay dos, no una

La cuenta anterior (WABA `1620540339506984`, "Christian Event Example", número
`+573182899705`) es **otra cuenta de YCloud**, con su propio API key. El key
viejo devuelve `403 FORBIDDEN` contra la WABA nueva; no es un problema de
permisos que se pueda arreglar, son cuentas distintas.

Su webhook (`6a87625ab979cf56e2f92360`) quedó en `status: disabled`. Tenía que
quedar así: apuntaba al mismo `/webhook/ycloud-whatsapp`, y como los nodos de
envío ya salen por el número nuevo, un mensaje al número viejo habría hecho que
el bot respondiera **desde otro número**. Se reactiva poniéndolo en `active`.

### Estabilidad del agente (2026-08-23)

Las 9 ejecuciones fallidas que habia registradas se agrupan en 4 causas. Tres
tenian arreglo estructural y ya lo tienen:

| Causa | Veces | Arreglo |
|---|---|---|
| `Either 'to' or 'recipient' must be provided` | 4 | nodo `¿Identidad válida?` |
| `(#131000) Something went wrong` (transitorio de Meta) | 3 | `retryOnFail` en los nodos de red |
| `WABA credit line not established` | 1 | configuración de facturación, ya resuelta |
| `self-signed certificate` contra Postgres | 1 | de la puesta en marcha, no reproducible |

**`¿Identidad válida?`** — entre `Extraer Mensaje` y `Upsert Lead`. Si el
payload no trae `from` ni `fromUserId`, el flujo termina ahí. Antes seguía con
`telefono = ''`, **insertaba un lead basura** y reventaba después en el envío.
Había una fila así en la tabla, creada a las 20:15:40 del 20-ago, el timestamp
exacto de la ejecución 142. Borrada.

**Reintentos** — `maxTries` 3 (2 s) en lo que sale a la red y 3 (1 s) en lo que
pega a Postgres, en los 3 workflows. Cubre la clase transitoria entera.

**`Escalar Envío Fallido`** — `Enviar WhatsApp` pasa a `onError:
continueErrorOutput`. Si tras los reintentos la respuesta no sale, se marca
`requiere_humano = true` en vez de morir la ejecución. El cliente preguntó y se
quedó sin nada: eso lo tiene que recoger una persona, no desaparecer.

**`¿Error transitorio?`** — antes, *cualquier* fallo del agente disparaba
`Limpiar Memoria Rota`, que borra la conversación entera. Un 429 de Gemini le
costaba al cliente todo su contexto. Ahora se salta el borrado cuando el error
huele a pasajero (429, quota, 503, timeout, ECONNRESET…). **El caso por defecto
sigue siendo borrar**, a propósito: la protección original era contra el 400 de
`function call turn`, que deja la conversación rota para siempre. Ante un error
desconocido, perder contexto es preferible a un cliente muerto.

> ⚠️ El nodo `Gemini` no tiene modelo fijado (`options: {}`), así que usa el
> default de la versión del nodo. Un default que cambia solo es una fuente de
> inestabilidad; conviene fijarlo. Verificado que `gemini-2.5-flash` responde
> con esta credencial.

### Fallos de entrega: hacerlos visibles (2026-08-23)

**El punto ciego que esto cierra.** YCloud responde `200` con
`status: accepted` y el nodo `Enviar WhatsApp` queda en verde, pero la entrega
se resuelve **después**, de forma asíncrona. Si falla, nadie se enteraba: el
cliente quedaba sin respuesta y en n8n todo se veía correcto.
`Escalar Envío Fallido` no cubre este caso — solo se dispara con errores
inmediatos del HTTP.

Se descubrió con un envío real que devolvió `accepted` y terminó en
`failed / 131026 Message Undeliverable`.

Los dos motivos más frecuentes son justo los de una prueba humana:

| Código | Qué pasó |
|---|---|
| `131026` | El número no tiene WhatsApp o no puede recibir |
| `131047` | Pasaron más de 24 h desde el último mensaje del cliente |

**Cómo quedó.** El evento `whatsapp.message.updated` está suscrito en el
endpoint `6a8b3f833a7ced1bf600652a`, y la rama cuelga de la salida **falsa** de
`¿Eco de humano?`, que estaba vacía:

```
¿Entrante de cliente? ─false→ ¿Eco de humano? ─false→ ¿Entrega fallida? ─true→ Extraer Fallo → Escalar Entrega
```

Cuatro decisiones que conviene no re-descubrir:

1. **Se filtra por `status === 'failed'`.** `whatsapp.message.updated` llega en
   **cada** transición (`sent`, `delivered`, `read`, `failed`). Sin ese filtro,
   cada mensaje entregado con éxito escalaría a un humano.
2. **En un evento de estado los papeles están invertidos.** `from` es la
   empresa y `to` es el cliente. Marcar `from` marcaría la fila de la empresa.
3. **`Escalar Entrega` es un UPDATE, no un upsert** — al revés que
   `Pausar Bot`. Aquí el lead siempre existe (le escribimos porque nos
   escribió). Crear una fila desde un acuse de fallo solo ensuciaría la tabla.
4. **Respeta `no_insistir`.** A quien pidió que no lo contactaran más no se le
   reabre la conversación por un fallo de entrega. Probado.

> ⚠️ **Sube el volumen de ejecuciones.** Ahora entra un webhook por cada
> cambio de estado de cada mensaje, no solo por cada mensaje del cliente.
> Terminan en 4 nodos, pero con `saveDataSuccessExecution: all` todas quedan
> guardadas. Si la lista de ejecuciones se vuelve inmanejable, ese ajuste es
> el que hay que revisar.

> 📌 Cuando se active `Seguimiento`, sus fallos también escalarán. Con leads
> fríos y sin plantilla aprobada eso serían muchos: **crear la plantilla antes
> de activarlo**, o el `requiere_humano` se llena de falsos positivos.

### Notas de voz: transcripción con Gemini (2026-08-23)

El agente entiende audios. Antes contestaba
`[El cliente envio un mensaje de tipo "audio" que no puedo leer]`.

```
¿Identidad válida? → ¿Es audio? ─true→ Descargar Audio → Audio a Base64 → Transcribir Audio → Mensaje Final ─┐
                                └false→──────────────────────────────────────────────────────────────────────┴→ Upsert Lead
```

**No se usó nodo nativo.** No se pudo confirmar si esta instancia trae
`@n8n/n8n-nodes-langchain.googleGemini` (el catálogo `/types/nodes.json` pide
login del editor, y la sonda por API resultó inútil: hasta un tipo inventado
conserva sus `parameters`). Un HTTP Request no depende de la versión de n8n y
reusa la credencial `googlePalmApi` que ya existía — **cero proveedores nuevos**.

Detalles que costaron verificación:

1. **`predefinedCredentialType` + `googlePalmApi` autentica contra
   `generativelanguage.googleapis.com`.** Probado: Gemini contestó. No hace
   falta credencial nueva ni tener la API key a mano.
2. **El base64 se hace en un Code node, no con `{{ $binary.data.data }}`.** Esa
   expresión solo resuelve si n8n guarda el binario en memoria; en modo
   filesystem devuelve `undefined` y el fallo sería silencioso. Con
   `this.helpers.getBinaryDataBuffer()` funciona en los dos modos — verificado
   contra un binario real de 155 KB del catálogo.
3. **Al mime hay que quitarle los parámetros.** Las notas de voz llegan como
   `audio/ogg; codecs=opus` y Gemini rechaza eso; quiere `audio/ogg` pelado.
4. **Si la transcripción falla, `Mensaje Final` conserva el texto original.**
   Descarga caída, Gemini con error o audio sin voz degradan al aviso de
   siempre en vez de dejar al cliente sin respuesta. Probado inyectando un JPEG
   como si fuera audio: `transcrito: false` y el flujo siguió normal.

Probado con voz real sintetizada, texto conocido de antemano:

```
dicho     : "Hola, buenas tardes. Quiero cotizar una fiesta de quince años
             para ciento veinte invitados en diciembre."
transcrito: "Hola, buenas tardes. Quiero cotizar una fiesta de 15 años
             para 120 invitados en diciembre."
```

Convierte los números a dígitos, que le viene mejor al agente.

> 📌 El *system message* del nodo `Brian Otero` **no menciona los audios**. El
> agente los recibe ya como texto y no necesita saberlo. Si alguna vez conviene
> que distinga una nota de voz de un texto escrito, el campo `transcrito` ya
> viaja en el item.

### WhatsApp — Evolution API (archivado 2026-08-23)

Estuvo vivo entre el 2026-08-20 y el 2026-08-23. Hoy sus nodos siguen en los 3
workflows con sufijo `(Evolution)`, `disabled` y desconectados; también los de
Meta con sufijo `(Meta)`. Nada que reconstruir para volver.

`infra/evolution-api/README.md` documenta ese despliegue y **describe la ruta
viva de entonces, no la de hoy** — leerlo como historia.

### WhatsApp Business Cloud (plan anterior, archivado)
- **No existe todavía.** Decisión del usuario: se deja para el final.
- Por eso los nodos `WhatsApp In`, `Enviar WhatsApp` y `Aviso Fallo Agente`
  están **temporalmente deshabilitados** (`disabled: true`) para que el
  workflow pueda activarse. Reactivarlos al conectar Meta.

---

## 3. Estado real, verificado

### Sincronización repo ↔ VPS (2026-08-25)

El VPS es la fuente de verdad: los cambios se hacen en su UI y el repo se
re-exporta después. Los cinco `n8n/workflow-*.json` son export literal de
`$N8N_VPS_URL/api/v1/workflows/<id>` sin los campos que solo devuelve la API
(`createdAt`, `updatedAt`, `versionId`, `triggerCount`, `pinData`, `meta`,
`tags`, `shared`, `isArchived`).

| Workflow | id en el VPS | activo |
|---|---|---|
| Brian Otero (agente) | `NsJQxBhrNyrKFVJu` | sí |
| `enviar_medios` | `Tkh6deuiy663KNkl` | sí |
| `agendar_cita` | `w3p5TRsicq13Jmig` | sí |
| `separar_fecha_evento` | `Mxz7P208vVXhyNg9` | sí |
| Seguimiento | `fWtN6n18kbcYyAga` | no — espera plantilla aprobada |

> 📌 **n8n 2.x versiona los workflows.** Cada uno trae `versionId` (el borrador)
> y `activeVersionId` (lo que corre). Un `PUT` por la API pública **publica**:
> al terminar, los dos ids quedan iguales. Si alguna vez difieren, lo que está
> vivo es `activeVersion.nodes`, no `nodes` — mirar el que no es.

### El agente habla como Angie Otero y manda varios mensajes (2026-08-25)

Cambio hecho por el usuario en la UI del VPS; el repo se sincronizó después.

- El personaje pasa de **Brian Otero** a **Angie Otero**. El nodo, el workflow
  y los archivos conservan el nombre viejo: es referencia interna que el
  cliente nunca ve.
- El prompt separa sus mensajes con `|||`. El nodo nuevo `Dividir Mensajes`
  —entre `Canal de prueba?` y `Enviar WhatsApp`— parte esa cadena en un item
  por globo, así que el cliente recibe mensajes cortos y seguidos en vez de un
  ladrillo. En el canal de prueba local, `Responder Chat` los une con saltos de
  línea porque ahí no hay globos.
- Trae guiones literales (saludo, antesala de la cotización, cierre
  post-videos), pide el nombre del cliente de entrada y lo usa toda la
  conversación, y clasifica los salones en cerrados (separación desde
  $1.000.000) y campestres (desde $2.000.000).

**Dos cosas que se corrigieron al sincronizar:**

1. **Los nombres de los salones no coincidían con `sedes`.** El prompt decía
   "Sede 66", "Marqués del Oyola", "Mansión Casa #5"; la base tiene "Sede Sur
   66 Mundo Foto", "Marquez De Loyola", "Casa 5". `fn_medios_para_enviar`
   resuelve la sede con `nombre_sede ilike '%referencia%'`, así que con esos
   nombres **el video no salía**. La lista quedó con los nombres exactos de la
   base, y el prompt le dice al agente que a la herramienta le pase el nombre
   completo aunque al cliente le hable con naturalidad.
2. **El guard de `Enviar WhatsApp` vivía solo en el repo.** Convierte una
   salida vacía o un `Calling tools…` del agente en "Dame un segundito que
   confirmo eso y te cuento 🤗" en vez de mandárselo al cliente. Nunca se había
   subido; ahora está en el VPS.

### La tanda de videos de la cotización (2026-08-25)

Regla del negocio, en dos partes:

1. Después de cotizar, el cliente recibe **los videos de todos los salones
   juntos**, cada uno rotulado con su nombre, si es cerrado o campestre, y el
   precio para su cantidad de invitados.
2. **La primera vez** que ve salones se le suma el video de promoción.

Son 12 piezas: 11 videos de salón y el promocional. **Los testimonios ya no se
envían** (migración `20260825000002`): quedaron con `activo = false`, que los
saca de las tres funciones a la vez, incluida la que arma el resumen del
catálogo que lee el agente.

Todo vive en SQL, no en el prompt: el agente hace **una** llamada
(`categoria` = `sede`, `referencia` = `todas`, `invitados` = N) y la base decide
qué sale y con qué rótulo. Que el precio del caption lo escriba la base y no el
modelo es justamente el punto: el caption es lo que el cliente relee después, y
un número escrito por el modelo puede discrepar del que acabó de cotizar.

**Lo nuevo en la base** (dos migraciones, aplicadas y registradas):

| | |
|---|---|
| `sedes.tipo_espacio` | `cerrado` \| `campestre` \| NULL. Decide el **rótulo**, no si la sede entra: NULL manda el video sin el paréntesis de tipo |
| `fn_medios_sedes_cotizacion(telefono, invitados)` | los videos de todas las sedes con material cargado, con el caption ya armado |

`supabase/tests/medios_cotizacion_test.sql` — 16 aserciones pgTAP, en verde.

**El nodo `Seleccionar Medios` tiene dos modos.** `categoria` = `sede` con
`referencia` vacía o `todas` dispara la tanda; cualquier otra referencia sigue
por `fn_medios_para_enviar` como siempre. Se filtran con un `where` sobre el
modo en vez de partir el workflow en dos ramas paralelas que habría que
mantener a la par.

Cinco cosas que conviene no re-descubrir:

1. **El escalón se redondea en la base con la misma regla del cotizador** (55
   invitados → 60), para que no haya dos verdades sobre el precio.
2. **No se filtra por capacidad, a pedido del negocio.** Un salón que no
   alcanza para esa cantidad de invitados igual se muestra, y su rótulo lo
   aclara: "hasta 150 invitados", o "desde 200" si el salón arranca más arriba.
   Esconderlos era la alternativa; prefirieron mostrar el inventario completo.
3. **La promoción se pega una sola vez por cliente**, y la condición mira
   `envios_medios`, no lo que queda disponible. Son cosas distintas en cuanto
   haya más de una pieza institucional: cuando los dos testimonios estaban
   activos, mirar lo disponible hacía que el segundo envío arrastrara el segundo
   testimonio.
4. **Los acompañantes cuelgan de que el pedido devuelva algo.** Sin material la
   salida queda vacía, el flujo cae en `Diagnóstico` y la promoción nunca llega
   suelta.
5. **El orden es cerrados, campestres y al final las sin clasificar**; dentro
   de cada grupo, de menor a mayor precio. Lo fija un `order by`, no el azar del
   plan — el booleano `tipo_espacio = 'campestre'` da NULL para las sin
   clasificar, y los NULL van últimos.

> 📌 **Peso de una cotización: ~117 MB de egress.** Once videos de sede (104 MB)
> más el promocional (13 MB). No los sube n8n —se manda la URL pública y
> WhatsApp la descarga—, así que la llamada es liviana y el turno no se alarga.
> Lo que sí consume es el **egress de Supabase Storage**: con los 5 GB del plan
> son unas 42 cotizaciones al mes antes de pasarse. Es el número que hay que
> vigilar si el volumen crece.

> 📌 **Cómo se aplicaron las migraciones.** El `SUPABASE_ACCESS_TOKEN` del
> `.env` está caducado (403), así que se corrieron por el pooler con psycopg2 y
> se registraron a mano en `supabase_migrations.schema_migrations` con
> `version` = solo el timestamp y `name` = el archivo, que es lo que escribe el
> CLI. **Ojo con las quince filas anteriores: tienen el nombre pegado al
> `version`** (`20260812000000_schema`), formato que el CLI no reconoce, así que
> un `db push` las vería como pendientes e intentaría re-aplicarlas. Vale
> arreglarlo antes del próximo push.

> ⚠️ **La tanda manda hoy 11 videos, y lo único que falta son archivos.**
> - **"Salón Inti Raimi" es Sawa** (confirmado por el usuario el 2026-08-25). No
>   era una sede nueva: el nombre comercial no aparecía en
>   `docs/paquetes todo incluido.txt`, que es de donde salió toda la matriz de
>   precios, y ahí el salón figura como Sawa. Queda clasificada como campestre.
>   El prompt lo dice para que el agente entienda los dos nombres.
> - **Sawa y Casa 5** (el "Mansión Casa #5" de la lista) tienen precios y
>   clasificación pero **no tienen video**. Es lo único que falta para que la
>   tanda cubra los diez salones del negocio.
> - **"Jardín Real Casa 4" es Casa 4**, campestre (confirmado el 2026-08-25).
>   Mismo caso que Sawa: nombre comercial distinto del que quedó en `sedes`.
> - **Sede Granada Gold y Valdemoro** se envían **sin el paréntesis de tipo**,
>   por decisión del negocio: "el nombre y el precio sin especificar que es
>   campestre o cerrado". Clasificarlas después es un `update` y el rótulo
>   aparece solo.
> - **Gran Salón y Orquideorama** no tienen video ni clasificación, así que no
>   aparecen en ninguna tanda. Sus precios sí están completos.

> 📌 **Los precios NO son lo que falta.** Las 15 sedes tienen su matriz completa
> (16 escalones las que van de 50 a 200, 11 las demás). Cualquier salón que se
> sume ya tiene con qué cotizarse.

**Cómo se suma un salón a la tanda** — sirve para los dos que faltan y para
cualquiera futuro:

1. Subir el video al bucket `medios`, carpeta `sedes/`. Máximo **16 MB**: es el
   límite de WhatsApp y la base lo valida con un `check`, así que un archivo
   pesado falla al catalogarlo y no frente a un cliente.
2. Catalogarlo:

   ```sql
   insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
   select 'video',
          'https://vzxcqoqljnndoxmzgfda.supabase.co/storage/v1/object/public/medios/sedes/<archivo>',
          'Así se ve ' || s.nombre_sede || ' ✨',
          'Recorrido de ' || s.nombre_sede,
          'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
          s.id_sede,
          <bytes>
   from sedes s
   where s.nombre_sede = 'Casa 5';   -- o 'Sawa'
   ```

   Los espacios del nombre del archivo van como `%20` en la URL. El `caption` de
   esta fila **no** se usa en la tanda —ahí lo arma
   `fn_medios_sedes_cotizacion`— pero sí cuando el cliente pide ese salón suelto.
3. Si la sede todavía no existe (el caso de Inti Raimi), antes va su fila en
   `sedes` con su `tipo_espacio`, y su matriz de precios en `precios_sedes`. Sin
   precios el video sale con rótulo sin precio.

Nada más: la tanda lee la base en cada llamada, no hay que tocar el prompt ni el
workflow.

### El cierre: cita, y recién ahí las redes (2026-08-25)

El embudo termina igual siempre: el cliente elige salón y la conversación va a
**una** de estas dos, con fecha y hora concretas.

| | |
|---|---|
| `visita_sede` | viene a la sede principal, Carrera 66 #10A-08 — 30 min |
| `llamada` | un asesor lo llama para cuadrar pagos, gestión y detalles — **20 min** |

**Las llamadas pasan a 20 minutos, con 20 de colchón** (antes todo era 30/30).
Vive en el mapa `MINUTOS` del nodo `Calcular Ventana` de `agendar_cita`, que
ahora deriva duración y colchón del `tipo_cita` en vez de tener dos constantes.
La ventana de choque de una llamada queda en 60 minutos y la de una visita sigue
en 90. El nodo además devuelve `duracion_min`, para que el agente se lo diga al
cliente sin suponerlo.

Se ajustó también la regla de "no derivar". Seguía prohibiendo cualquier
mención a un asesor, y eso choca con el nuevo cierre: lo que está prohibido es
dejar al cliente esperando algo **sin día ni hora**. Una `llamada` agendada
—día, hora y número— no es derivar, es cerrar.

**Instagram y TikTok van al final**, como un "síguenos en redes" cuando la
conversación ya resolvió lo suyo, y no como argumento de venta. Si el cliente
las pide él mismo ("¿tienen Instagram?"), se las manda en el momento. Cada link
solo en su propio globo, una sola vez por conversación. Todo esto es prompt: el
workflow no cambió.

### Prueba de punta a punta (2026-08-25)

Tres conversaciones completas por el canal de chat del VPS, más siete sondas
directas al webhook de producción para las ramas que el chat no alcanza. **Cero
ejecuciones con error**: las 9 que hay registradas son todas del 20-ago y ya
estaban documentadas.

**Rutas verificadas nodo por nodo**, leyendo el `runData` de cada ejecución:

| Rama | Cómo se probó | Resultado |
|---|---|---|
| Canal de chat completo | 3 conversaciones | `Chat de Prueba → Normalizar Chat → Upsert Lead → ¿Bot activo? → Catálogo de Medios → Sanear Memoria → Gemini/Memoria/Brian Otero → Canal de prueba? → Responder Chat` |
| WhatsApp real entrante | webhook `whatsapp.inbound_message.received` | llega hasta `Dividir Mensajes` → `Enviar WhatsApp`, que mandó **3 globos en 1,4 s** |
| Nota de voz | webhook con `type: audio` | `¿Es audio? → Descargar Audio → Audio a Base64 → Transcribir Audio → Mensaje Final` (20 s la transcripción) |
| Eco de humano | webhook `whatsapp.smb.message.echoes` | `Extraer Eco → Pausar Bot`; el upsert **creó** el lead ya pausado |
| Entrega fallida | webhook `message.updated` con `status: failed` | `Extraer Fallo → Escalar Entrega`, `requiere_humano = true` |
| Respeta `no_insistir` | el mismo, contra un lead cerrado | el UPDATE corre y **no** lo reabre |
| `status: delivered` | el mismo, con otro estado | corta en `¿Entrega fallida?`, no escala |
| Identidad inválida | entrante sin `from` ni `fromUserId` | corta en `¿Identidad válida?`, sin lead basura |
| Choque de horarios | cita pedida sobre una llamada real ya agendada | `Buscar Choques → ¿Hay choque? → Horario Ocupado`, sin crear nada |
| `agendar_cita` | una visita y una llamada | 30 y **20** minutos exactos, en `citas` y en Google Calendar |
| `separar_fecha_evento` | separado real | fila `bloqueado_temporal` + evento de día completo con su `google_event_id` |
| `enviar_medios` | tanda de cotización | 12 piezas seleccionadas, bucle de 12 iteraciones, `Resumen` correcto |
| Herramientas de consulta | en conversación | precios, inclusiones, disponibilidad y `cerrar_seguimiento` (dejó `no_insistir = true`) |

**Lo que no se pudo probar:** la entrega real de los videos. En el canal de
chat el "teléfono" del lead es `test-<sessionId>`, y YCloud lo rechaza con
`400 PARAM_INVALID: Invalid BSUID format`. Todo lo anterior al proveedor está
verificado; falta un envío a un número real autorizado. Tampoco se ejercitaron
`Escalar Envío Fallido`, `Aviso Fallo Agente`, `¿Error transitorio?` ni
`Limpiar Memoria Rota`, que solo corren si el agente o el HTTP fallan de verdad,
ni el workflow de Seguimiento, que sigue inactivo esperando plantilla.

#### Dos defectos encontrados y arreglados

**1. El centinela `SIN_VOZ` se colaba como mensaje del cliente.** Ante un audio
sin voz, Gemini contestó `SIN_VOZ00:00`, y la guarda de `Mensaje Final` era
`/^SIN_VOZ\b/i`: entre la `Z` y el `0` **no hay frontera de palabra** —las dos
son `\w`—, así que no disparaba y al agente le llegaba `SIN_VOZ00:00` como si el
cliente lo hubiera dicho, con `transcrito: true`. Ahora es
`/^\s*sin[_\s-]*voz/i`, anclada al principio y tolerante a la basura de atrás.

> ⚠️ **El centinela no es confiable y el arreglo no lo vuelve confiable.** En un
> segundo intento con el mismo archivo, Gemini contestó `No` en vez de
> `SIN_VOZ`, y eso ningún patrón lo distingue de un cliente que de verdad dijo
> "no". La solución de fondo es pedirle salida estructurada
> (`{"voz": bool, "texto": "…"}`) y decidir por el booleano. Queda pendiente
> porque cambia el contrato del nodo y hay que probarlo con voz real.

**2. El agente le contaba al cliente los fallos internos.** Cuando la tanda de
videos falla, `Resumen` le decía "no le digas al cliente que ya lo tiene" pero
no le prohibía mencionar el fallo. Resultado real, textual: *"Tuvimos un
inconveniente técnico con la carga de los videos en este momento"*. Además
**reintentaba la herramienta en el mismo turno** (una segunda llamada con una
sede suelta), y el turno se fue a **dos minutos**. El `Resumen` ahora prohíbe
las dos cosas explícitamente. De paso se cayó el "ofrécele que un asesor se lo
haga llegar", que contradecía la regla de no dejar nada sin fecha y hora.

### Los globos llegaban desordenados (2026-08-25)

**El defecto más grave que apareció, y el cliente lo estaba viendo.** En una
conversación real, el link de TikTok llegó antes del texto que lo presenta, y el
"ya quedó agendada tu cita" llegó después del "te espero mañana". En otro turno,
el "Excelente elección, Jordan" llegó después de la pregunta por la cita.

**La causa no era el modelo: era n8n.** `Dividir Mensajes` entrega los N globos
como N items a `Enviar WhatsApp`, y el nodo HTTP Request **sin `batching`
configurado dispara todos los items en paralelo**. Los seis mensajes salían a
YCloud a la vez y WhatsApp los entregaba en el orden en que le llegaban.

El arreglo son dos parámetros: `batchSize: 1` y `batchInterval: 900`. Medido
antes y después con el mismo saludo de tres globos:

| | Tiempo del nodo | Qué pasa |
|---|---|---|
| Antes | 1.406 ms para 3 globos | los tres en paralelo, orden indefinido |
| Después | 3.102 ms para 3 globos | uno tras otro, ~1 s cada uno |

Los 900 ms además se leen más humanos que tres mensajes simultáneos. La cuenta:
un turno de 4 globos ahora tarda unos 4 s en salir completo.

> 📌 **`enviar_medios` nunca tuvo este problema.** Ahí el `splitInBatches`
> entrega un medio por iteración, así que `Enviar Video` siempre recibió un solo
> item. El orden de la tanda estaba garantizado por el bucle.

### Un turno, un propósito (2026-08-25)

El desorden tapaba un segundo defecto, este sí del prompt. El bloque literal
`CUANDO EL CLIENTE ELIGE SALÓN` eran **tres globos de letra chica** —promoción
sujeta a disponibilidad, separación de cerrados, separación de campestres— sin
acuse de la elección y sin pregunta. El modelo tenía que inventar el resto del
turno, y terminaba mandando seis globos que saltaban de "me gustó Valdemoro" a
la dirección de la oficina.

Ahora ese turno está definido completo y cerrado: acuse, disponibilidad
**consultada de verdad**, las condiciones en un solo globo, y una pregunta.
Nada de cita: eso es el turno siguiente. Probado:

```
¡Excelente elección, Jordan! Valdemoro es espectacular ✨
Te confirmo que para el 12 de diciembre de 2026 aún está disponible, pero como es temporada alta, los espacios se llenan rápido 🤗
Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.
¿Te la separamos para que quede asegurada? 🤗
```

Y dos reglas duras nuevas en el bloque de formato: **un turno = un solo
propósito**, y **los links van siempre en los últimos globos del turno**, nunca
con texto detrás.

### Un solo nombre: Angie Otero (2026-08-25)

Ya no queda ningún "Brian" vivo. Se renombraron el nodo del agente, el workflow
(`Christian Sierra — Angie Otero`), las descripciones que van a los eventos de
Google Calendar en `agendar_cita` y `separar_fecha_evento`, y los dos archivos
del repo (`workflow-angie-otero.json`, `system-prompt-angie-otero.md`).

Renombrar el nodo era seguro porque **nada lo referenciaba por nombre**: no hay
ni un `$('Brian Otero')` en ningún workflow. Las conexiones sí lo nombran, y se
reescribieron junto con el nodo.

Lo que conserva el nombre viejo a propósito: los documentos de diseño fechados
en `docs/superpowers/` y `infra/evolution-api/README.md`. Son el registro de lo
que se decidió entonces, no documentación viva.

### Chats reiniciados (2026-08-25)

`delete from n8n_chat_histories` — **271 filas en 21 sesiones**, para que ninguna
conversación arrastre el contexto de las versiones viejas del prompt. Se
reajustó la secuencia del `serial` con `setval(..., 1, false)`; sin eso el
próximo mensaje choca contra la primary key (ya está documentado más arriba).

No se tocó nada más: `leads`, `citas` y `agenda_reservas` quedaron intactos, así
que las citas agendadas y las fechas separadas siguen en pie.

### Una respuesta vacía de Gemini le borraba la memoria al cliente (2026-08-25)

Apareció al probar la ubicación temporal, y es el fallo más caro de los que se
encontraron. La cadena completa:

1. `Gemini` devolvió una generación **vacía** — `generations: [[]]`, 6.320
   tokens de entrada y **0 de salida**.
2. El nodo del agente reventó leyendo esa respuesta:
   `Cannot read properties of undefined (reading 'message')`.
3. `¿Error transitorio?` dijo que **no** era pasajero, porque ese mensaje no
   estaba en su lista.
4. `Limpiar Memoria Rota` **borró la conversación entera de ese cliente**.
5. `Aviso Fallo Agente` intentó mandar la disculpa, falló, y **tumbó la
   ejecución en rojo** — tapando la causa real: en la lista de ejecuciones se
   veía un error de YCloud, no el fallo del agente que lo originó.

Dos arreglos:

- **`¿Error transitorio?` ahora reconoce el caso.** Se sumaron
  `cannot read properties of undefined`, `empty response` y `no candidates`. Una
  generación vacía es un hipo del proveedor, no una conversación corrupta:
  borrarle la memoria al cliente no arregla nada y le cuesta todo su contexto.
  Verificado que el 400 de `function call turn` —el motivo por el que existe el
  borrado— **sigue** clasificando como no pasajero.
- **`Aviso Fallo Agente` pasa a `onError: continueErrorOutput`**, con su salida
  de error conectada a `Escalar Envío Fallido`. Si ni la disculpa sale, el lead
  queda marcado para que lo recoja una persona, en vez de morir la ejecución.

### Los mensajes de `agendar_cita` tenían la duración escrita a mano (2026-08-25)

Consecuencia de haber hecho la duración dependiente del tipo de cita, y solo se
ve leyendo lo que la herramienta le devuelve al agente:

| Nodo | Decía | Dice |
|---|---|---|
| `Cita Confirmada` | "duración 30 minutos" fijo | `{{ duracion_min }}` — 20 en una llamada |
| `Horario Ocupado` | "60 minutos antes o después… 30 min libres a cada lado" | `{{ duracion_min + colchon_min }}` y `{{ colchon_min }}` — 40 y 20 en una llamada |

`Calcular Ventana` ahora exporta también `colchon_min`. Probado con dos llamadas
encimadas: el mensaje salió con 40 y 20, y el agente ofreció una hora 40 minutos
después, que es exactamente la regla.

### Ubicación temporal del agente (2026-08-25)

Verificado preguntándoselo directo por chat: contestó *"martes 25 de agosto de
2026 y son exactamente las 11:06 a. m."* contra un reloj real de 11:06 en
Bogotá. La línea `$now` del system message se rerenderiza en cada turno, el
workflow está en `America/Bogota` y `Calcular Ventana` valida en esa misma zona.

Las fechas relativas también salieron bien: "mañana" → miércoles 26, "el próximo
lunes" → 31 de agosto, y el 20 de marzo de 2027 lo nombró como sábado, que es lo
que es.

Se reforzó igual el prompt con tres reglas, porque el riesgo real no es el
cálculo sino el arrastre:

- Esa línea **se recalcula en cada mensaje**: si el cliente escribió ayer y
  contesta hoy, "mañana" ya no significa lo mismo y no vale reutilizar la fecha
  que se dijo antes.
- **Siempre el día de la semana junto a la fecha** ("mañana miércoles 26"), que
  es lo que deja al cliente detectar el error.
- **Al confirmar, la fecha que vale es la que devolvió `agendar_cita`**, no la
  que calculó el modelo: la herramienta responde con el día, la fecha y la
  duración reales de lo que quedó en el calendario.

### Chats despausados (2026-08-25)

Había **6** con `requiere_humano = true`, no uno: cinco eran leads de prueba de
sesiones anteriores y uno era un cliente real (`CO.863955426654893`, "✨JoJo✨"),
pausado desde las 07:36. Los seis quedaron en `false`. El único lead con
`no_insistir` se dejó como estaba: esa marca es otra cosa —quien pidió no ser
contactado— y no silencia las respuestas, solo el seguimiento.

> ⚠️ **Quedan datos de prueba de sesiones anteriores** que no se tocaron porque
> no son de esta tanda: 18 leads `test-*`, 3 citas (Carlos Vega, Julio Paz,
> Elena Castro) y **2 reservas en Sede Granada Gold** — 2026-12-19 y 2027-03-20.
> Las dos reservas **bloquean fechas reales** de esa sede, y la cita de Julio Paz
> está ocupando un espacio del calendario de empresa en diciembre. Conviene
> borrarlas.

> ⚠️ Lo que sigue en esta sección quedó viejo: los bloques de `agendar_cita` y
> `enviar_medios` que dicen "construido, sin probar" son de cuando n8n corría en
> local, y los ids que citan son los de aquella instancia.

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
  `n8n/system-prompt-angie-otero.md` pero **no** en el nodo del agente.
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

### Repetir la tanda de videos: el diagnóstico mandaba al agente a pedirlos uno por uno (2026-08-25)

**Los videos no se duplicaban** — eso ya estaba resuelto: tanto
`fn_medios_para_enviar` como `fn_medios_sedes_cotizacion` excluyen lo que el
cliente ya recibió, mirando `envios_medios`. Verificado contra producción en una
transacción con `rollback`: primera tanda 12 videos, segunda tanda 0.

El problema estaba en **qué se le decía al agente cuando la tanda salía vacía**.
El nodo `Diagnóstico` resolvía el caso con `fn_medios_diagnostico($1,$2,$3)`, que
para `categoria = 'sede'` exige `length(referencia) > 0`. La tanda va con la
referencia vacía o `'todas'`, así que devolvía `total_existentes = 0` y caía en
la rama equivocada:

> *"No hay medios para esa referencia. Con material disponible: Casa 4, Casa 74,
> … **Vuelve a intentarlo con una de esas**."*

El agente lo leía al pie de la letra y se ponía a pedir los once salones de a
uno. `Diagnóstico` ahora distingue tres situaciones y recibe el teléfono como
`$4` para poder mirar `envios_medios`:

| Situación | Qué se le dice al agente |
|---|---|
| Tanda + el cliente ya recibió videos de sede | ya los tiene, que los busque más arriba; **no** repetirlos ni pedirlos salón por salón |
| Tanda sin nada enviado (teléfono inutilizable, catálogo vacío) | no hay nada que enviar; no mencionarlo, seguir hacia la cita |
| Referencia concreta ya enviada / inexistente | los dos textos de siempre |

**Y una segunda vuelta sobre lo mismo.** Con el texto corregido el agente dejó de
pedirlos uno por uno, pero seguía contestando *"con gusto te los envío
nuevamente / aquí tienes los videos"* sin que saliera nada. El texto le decía qué
no hacer con la herramienta, no qué no decirle al cliente. Ahora se lo prohíbe
explícitamente — *"no le digas «te los envío» ni «aquí tienes»: no va a llegar
nada nuevo y sería mentirle"* — y el prompt lleva la regla equivalente en
`ENVÍO DE VIDEOS EN LA COTIZACIÓN`, porque la frase *"a continuación te voy a
enviar nuestra cotización con video de cada salón"* es un guion literal que el
modelo suelta antes de mirar el resultado de la herramienta.

Verificado en vivo, sembrando un lead con las 12 piezas ya registradas en
`envios_medios`:

> — *no me llegaron bien los videos, ¿me los reenvías?*
> — *¡Qué extraño, Daniela! Deberían aparecerte justo arriba de nuestros
> mensajes anteriores, por favor revisa un momentico que ahí siguen…*

> ✅ **Resuelto el 2026-08-27.** Aquí quedaba anotado que no existía forma de
> reenviar la tanda a un cliente que la perdió de verdad, y que la salida sería
> "un parámetro tipo `reenviar` que se salte el `not exists` sobre
> `envios_medios`". Eso es exactamente lo que hace la migración
> `20260826000010`. Ver la sección **0 BIS**.

### El agente escribía Markdown en WhatsApp (2026-08-25)

Al listar salones y precios soltaba `**Salones cerrados:**` y viñetas con `-`.
WhatsApp no interpreta Markdown: al cliente le llegan los asteriscos y los
guiones tal cual. El modelo lo copiaba del propio system prompt, que está escrito
en Markdown. Ahora hay una regla explícita en `FORMATO DE SALIDA` que separa las
dos cosas — las instrucciones van en Markdown porque son para él; sus mensajes,
no — y menciona que el resaltado de WhatsApp es `*un solo asterisco*`. Verificado:
la misma lista sale en texto plano.

### Regresión atrapada en el mismo test: "míralos más arriba" cuando no había nada (2026-08-25)

La regla nueva de *"si ya los tiene, dile que los busque más arriba"* se le pegó
al caso contrario — **envío fallido** — y el agente le decía a un cliente nuevo
que mirara unos videos que nunca salieron. Son dos textos distintos y cada uno
tiene que cerrar su propia puerta: el `Resumen` del envío fallido ahora prohíbe
además esa frase (*"ni que lo busque más arriba en el chat: no hay nada que
buscar"*). Verificado: ante *"no veo ningún video, ¿me llegaron?"* el agente ya
no afirma que estén, y reconduce a la cita en la sede principal.

> 📌 Ese camino solo se recorre cuando el proveedor rechaza el archivo. En el
> canal de prueba pasa **siempre**, porque el teléfono `test-<sesión>` no es un
> BSUID válido para YCloud; en producción, con los videos llegando, no aparece.
> Es la razón por la que el canal de prueba es bueno para revisar el guion y malo
> para revisar el envío.

### FUGA GRAVE: "Calling tools: enviar_medios{…}" le llegó a un cliente real (2026-08-25)

Un cliente recibió por WhatsApp, tal cual:

```
Calling tools: enviar_medios{categoria:
sede
,invitados:80,referencia:
todas
,tipo_medio:
video
}
```

Tres cosas fallaron en cadena y conviene no confundirlas.

**1. Gemini devolvió la llamada a la herramienta como texto.** En la memoria
(`n8n_chat_histories`, mensaje 140 de esa sesión) se ve el turno del asistente
con `"content": "Calling tools: enviar_medios{…}"` y **`"tool_calls": []`** —
vacío. El nodo del agente lo tomó por respuesta final. Compárese con el mensaje
137 de la misma conversación, que también empieza por `Calling tools:` pero trae
sus dos `tool_calls` de verdad y sus dos mensajes `tool` de respuesta: ese es el
formato normal de n8n y no es ningún error. Consecuencia doble: fuga **y** turno
perdido, porque `enviar_medios` nunca se ejecutó.

**2. El guard existía y no había funcionado nunca.** En `Enviar WhatsApp` estaba:

```js
/^Calling tools\b/i.test(t.trim())
```

Escrito así **dentro del JSON del workflow**, y en JSON `\b` no es el límite de
palabra del regex: es el carácter **backspace (0x08)**. El regex real era
`/^Calling tools\x08/i` — exigía un backspace literal después de "tools", así que
no casó ni una sola vez desde que se escribió. Confirmado leyendo los bytes del
nodo vivo: `['0x8', '0x2f', '0x69', …]`.

> ⚠️ **Regla para todo este repo:** un `\b` en un regex que viva dentro de un
> campo JSON hay que escribirlo `\b`. Barrí los cinco workflows buscando
> backspace, form-feed y vertical-tab colados de la misma forma: era el único
> caso. Cualquier edición futura por API debe construir la cadena con
> `json.dump`, que escapa la barra sola, en vez de escribirla a mano.

**3. La memoria quedó envenenada.** El texto fugado se guarda como turno del
asistente y pasa a ser un ejemplo que el modelo imita en los turnos siguientes.

Los tres arreglos:

| Dónde | Qué |
|---|---|
| `Dividir Mensajes` | detección primaria, **antes** de partir en globos: cinco patrones (`^calling tools`, `functionCall`/`tool_code`/`tool_call`, texto que empieza por `{`, nombre de herramienta seguido de `{`, `tipo_medio:`) más vacío y no-string. Si detecta fuga devuelve un solo globo: *"Dame un segundito que confirmo eso y te cuento 🤗"*. Ningún patrón usa `\b`. |
| `Enviar WhatsApp` | el guard viejo, reescrito sin `\b`, como última línea de defensa |
| `Sanear Memoria` | CTE `despoisonar` que **reescribe** (no borra, para no romper la alternancia human/ai que Gemini exige) el contenido de los mensajes `ai` que empiezan por `Calling tools` **y tienen `tool_calls` vacío`**. Los legítimos no se tocan. Se autocura en cada turno. |

Verificado: 15 casos en Node contra el filtro — las 10 formas de fuga bloqueadas
y los 5 mensajes legítimos intactos, incluido el de tres globos y el que termina
en link; la expresión de `Enviar WhatsApp` produce JSON válido y sigue eligiendo
`to` o `recipient` según el formato del número; la memoria del cliente afectado
quedó saneada y en toda la base hay **0** mensajes envenenados.

> 📌 **Lo que este arreglo NO hace:** recuperar el turno. Cuando Gemini falla
> así, la herramienta no se ejecuta y no hay forma de reintentarla desde ahí; el
> cliente recibe el "dame un segundito" y el agente responde bien en el mensaje
> siguiente. Convertir la fuga en un reintento automático sigue pendiente.

> 📌 **El canal de prueba (`Responder Chat`) no lleva el filtro, a propósito.**
> Va por la otra rama de `Canal de prueba?`, así que en los tests la fuga se ve
> en crudo — que es justo lo que se quiere al probar. El cliente real va siempre
> por `Dividir Mensajes` → `Enviar WhatsApp`, filtrado dos veces.

> 📌 `Enviar WhatsApp (Evolution)` está deshabilitado y cuelga de la rama de
> entrada de Evolution, no de `Dividir Mensajes`: manda `$json.output` en crudo.
> Si alguna vez se reactiva ese canal, hay que ponerle el filtro.

### Limpieza de datos de prueba (2026-08-25)

`agenda_reservas` quedó **vacía**: las dos reservas que había eran de prueba y
bloqueaban fechas reales de Sede Granada Gold (2026-12-19 y 2027-03-20). Se
borraron también las 4 citas de leads de prueba y los 27 leads sintéticos, cada
uno con su evento de Google Calendar eliminado por la cuenta de servicio.

Lo que **no** se tocó: las 10 citas de números reales y la memoria del chat vivo.
El criterio fue `telefono ilike 'test%'`, `telefono like '+1000000%'` y cuatro
números sintéticos nombrados uno a uno; nada que se pareciera a un cliente entró
en el borrado.

> 📌 Los leads de prueba tenían `estado = 'cotizado'` y `seguimiento_etapa = 0`:
> en cuanto se active el workflow de Seguimiento habrían empezado a dispararle
> mensajes a números que no existen. Conviene revisar que no se acumulen otra vez.

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
   `n8n/system-prompt-angie-otero.md` al *System Message* del nodo
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
