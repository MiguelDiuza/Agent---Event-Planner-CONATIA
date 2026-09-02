# Continuación — 2026-09-02

Contexto para retomar en una sesión nueva. Rama: `sync-vps-y-fechas-reales`.

## Dónde quedó todo

**Excel del equipo (Google Sheets) — FUNCIONANDO, y ahora en los dos sentidos.**
Hoja `1H1Sq3HGl0oWamnt7TLCg2X_Tvyj6blMF6TjJ7ihtDAA`, pestañas `Reservas` (10
columnas) y `Citas` (11). Los dos nodos que escriben (`Anotar en Excel` en
`separar_fecha_evento`, `Anotar Cita en Excel` en `agendar_cita`) están
encendidos y publicados en el VPS. Las 113 fechas ya vendidas están volcadas.

La credencial es una cuenta de servicio **propia**, no la de Calendar:
`chris-164@rising-precinct-507407-c3.iam.gserviceaccount.com`, credencial de n8n
`ZzY1Zt2j9JaKlujB`. El proyecto está **sin organización**, creado con un Gmail
personal, porque Workspace bloquea la descarga de llaves JSON
(`constraints/iam.disableServiceAccountKeyCreation`). La llave vive en
`.gcp-sa-sheets.json` (ignorada por git). Ver el README para el porqué completo.

**La vuelta: Sheets → `agenda_reservas` — HECHA Y CORRIENDO.**
`workflow-sincronizar-hoja.json`, id del VPS `INeFiJhftIxWbNcN`, **activo**.
Cada 15 minutos lee la pestaña `Reservas`, mete en `agenda_reservas` lo que el
equipo escribió a mano con `origen='humano'` y `estado='separado'`, y crea el
evento de Calendar de cada fecha nueva. Toda la decisión vive en
`fn_sincronizar_agenda_desde_hoja` (migración `20260902000001`), que es lo que
permite probarla sin n8n y sin Google:
`node --env-file=.env scripts/probar-sincronizacion.js --local`.

Las cuatro decisiones que estaban abiertas quedaron así (el porqué de cada una,
en el README y en el encabezado de la migración):

- **Frecuencia:** cada 15 minutos.
- **Choques con el bot:** gana la base. Una fila del Excel no pisa una fecha que
  apartó Angie; se reporta y lo resuelve una persona.
- **Filas mal escritas:** no tumban la corrida. Cada rechazo se escribe **en la
  hoja**, en la columna `sincronizado`, al lado de la fila que lo provocó.
- **Borrados:** borrar la fila NO libera la fecha. Se libera escribiendo `sí` en
  la columna `cancelada`, y solo si la apartó una persona. Y liberar no borra:
  la fila se queda en `disponible`, con el rastro de quién la tenía.

Por eso `Reservas` pasó de 8 a 10 columnas: `cancelada` (la escribe una persona)
y `sincronizado` (la escribe el workflow). **Una fila sin nota en `sincronizado`
es una fila que la sincronización no está viendo.**

Probado en producción, no solo en el banco. La ejecución `7060` (09:15Z) anotó
las 113 filas de la hoja y no insertó nada; la `7061` (09:30Z) no escribió ni
una celda. Entre las dos se metió a mano una fila con la sede en minúsculas
—`sede granada gold`, sin tildes ni mayúsculas— y salió entera por el otro
lado: fila en `agenda_reservas` con `origen='humano'` y `estado='separado'`,
evento creado en Calendar, su `google_event_id` guardado de vuelta, y la hoja
con `origen` relleno y `✓ en la agenda` al lado. Se borró después: hoja, base y
Calendar quedaron en 113.

**Las 113 fechas ya están en Google Calendar.** Se volcaron el 2026-09-02 con
`scripts/volcar-agenda-a-calendar.js --escribir`: eventos de día completo y
`transparency=transparent`, idénticos a los que crea `separar_fecha_evento`, así
que no le bloquean a nadie las citas de 30 minutos de ese día. De aquí en
adelante ese guion no hace falta: el workflow crea el evento de cada fecha
nueva. Lo que sí sigue sirviendo es su otra mitad, `--huerfanos --escribir`, que
borra los eventos de RESERVA que ya no respalda ninguna fila de la agenda — los
que dejan las pruebas al limpiarse por SQL.

**El libro viejo entero, dentro del nuevo.** Las 21 pestañas de `2025.xlsx`
—`VALORES`, los maestros `2026` y `2027`, un calendario por sede, y tres ocultas
que son plantillas vacías— están copiadas tal cual, con su orden y con las
ocultas ocultas, y comprobadas celda por celda. Los calendarios por sede llevan
teléfono, valor, abonos y saldo: cosas que la base no tiene ni necesita.

Se hace con `scripts/leer-excel-viejo.py` (el .xlsx a un .json por pestaña) y
`scripts/replicar-hojas-excel-viejo.js`. Ojo: **son pestañas para las personas,
no para el agente** — escribir una venta en `CIUDAD JARDIN` no aparta nada. La
única puerta a la base sigue siendo `Reservas`.

**Faltaban tres fechas vendidas, y ya están.** La carga del 2026-09-01 tomó el
año literal de la celda y las descartó por pasadas, pero el libro se llama
`2025.xlsx` y se reutilizó para 2026: el año de verdad lo dice la columna del
día de la semana. Eran `Sede Granada Premium 2027-08-07` (MARTHA CAMPOS),
`Sede Granada Premium 2027-08-14` (YESENIA MORENO) y `Casa 4 2026-12-27`
(DIEGO MONTOYA). Se metieron por la pestaña `Reservas`, como cualquier venta del
equipo. **La sede de la de DIEGO MONTOYA es una deducción**: venía en la hoja de
Granada con "CASA 4" escrito donde va el día, y 17.100.000 para 120 personas es
la tarifa de Casa 4 en `VALORES` (Granada Premium para 120 son 11.300.000).
Conviene que alguien del equipo lo confirme.

El resto cuadra: las 49 filas vendidas de los maestros estaban las 49 en la base.

**Granada Premium: fuera.** Preguntado a propósito, el cliente contestó que ese
salón es de **otra administración** y que hay que ignorarlo por completo. Se
borró de raíz (migración `20260902000003`): la sede, sus 32 fechas, sus 32
eventos de Calendar y sus 32 filas de la pestaña `Reservas`. Dejarla sin precios
no bastaba — si un cliente la nombraba, el agente le contestaba si estaba libre.
De paso desapareció una ambigüedad: **"Granada" a secas ya resuelve al Gold**,
que es el único que trabajan.

Dos de las tres fechas recuperadas arriba eran de Premium, así que se fueron con
ella. **Solo sobrevive `Casa 4 2026-12-27` (DIEGO MONTOYA)** — y es justo la que
convendría confirmar, porque salió de la hoja de Granada, que ahora sabemos que
es del vecino. Se deja bloqueada: el precio dice que el evento es en Casa 4, y
bloquear de más cuesta una consulta; bloquear de menos, un evento doble.

Hoy la agenda tiene **84 fechas**, y la hoja, la base y Calendar cuadran las tres.

**Auditoría completa del libro contra la base (2026-09-02, al cerrar).** Se
leyeron las 21 pestañas y se cruzaron las dos direcciones: de las fechas
vendidas de hoy en adelante que deberían estar en la base, **no falta ninguna**.

Ojo con un detalle que costó una lectura mala: los maestros escriben el día en
**dos órdenes distintos** — la hoja `2026` pone `1 SABADO` y la de `2027`
`SABADO 02`, y la fila 22 de 2027 mezcla las dos. Una auditoría que solo
entienda un formato se deja 21 fechas fuera sin avisar. Ya está contemplado.

### Una fecha vendida sin sede — PENDIENTE DE PREGUNTAR

En el maestro `2027`, fila 54: **sábado 18 de septiembre de 2027, LILIBETH
RAMIREZ, 3178922422, 15 años, 150 personas, $18.200.000** — y la **columna de la
sede está vacía**. No aparece en ninguna otra pestaña del libro.

No se cargó porque no se puede saber dónde es, y el precio **no lo resuelve**:

- $18.200.000 para 150 es casi la tarifa de **Valdemoro / Gran Salón** ($18M).
  Las dos son sedes **aliadas**, y para esas el agente nunca confirma
  disponibilidad: deriva al asesor. Si es una de ellas, **no hay riesgo**.
- Pero **Ciudad Jardín** para 150 son $17M, y la pista de cristal —o una hora
  adicional— cuesta exactamente **$1.200.000**: 17 + 1,2 = **18,2 exacto**.
  Ciudad Jardín **sí** es sede propia, y ahí el agente **sí** confirma.

Hoy, si un cliente pide el 18 de septiembre de 2027, el agente le dice
**DISPONIBLE en las cuatro sedes propias**. Si el evento de LILIBETH es en
Ciudad Jardín, esa fecha se puede vender dos veces.

No se bloqueó por cuenta propia porque habría que elegir una sede a ojo, y
bloquear la equivocada quita un sábado vendible sin arreglar nada. **Lo que hay
que hacer es preguntarle al equipo en qué salón es ese evento**, y meter la fila
en la pestaña `Reservas`. Es una sola fecha y está a más de un año.

La otra fila sin sede —`2027-04-11`, que solo dice "separado", sin cliente, sin
teléfono y sin valor— es una nota, no una venta. Y además cae en domingo.

**Traspaso al asesor — LISTO Y PUBLICADO, PERO APAGADO.**
Después de la cita, el bot le dice al cliente que el asesor retoma, le avisa al
asesor y se calla (`requiere_humano`). Migración `20260902000000` aplicada en
producción, los 6 nodos en el VPS.

**El número del asesor ya está: `+573006174717`** (2026-09-02), en el nodo
`Avisar al Asesor` y publicado. `probar-caso-asesor.js` comprueba que sea uno de
verdad, para que el marcador `+570000000000` no pueda volver sin que nadie lo
note.

Pero `Caso del Asesor` sigue **deshabilitado** a propósito, y es el interruptor
de toda la rama. Falta lo único que no depende de nosotros: **la plantilla
`aviso_caso_asesor` sigue en PENDING** en Meta.

Encenderla antes de la aprobación deja el peor de los escenarios, y está
comprobado en el banco: el envío falla, la salida de error va a `Escalar Caso
Sin Aviso`, **el bot se calla igual** en ese chat (`requiere_humano`) y el
asesor **no se entera**. O sea: al cliente se le promete una llamada, el bot
deja de contestarle, y nadie sabe que tiene que llamarlo. Hoy, con la rama
apagada, el bot simplemente sigue atendiendo — que es mucho mejor.

Lo bueno es que la cita queda **sin marcar** como avisada, así que el aviso se
reintenta solo la próxima vez que ese cliente escriba.

Cuando Meta apruebe:

```bash
node --env-file=.env scripts/plantilla-asesor.js       # confirmar APPROVED
# habilitar `Caso del Asesor` en n8n/workflow-angie-otero.json (quitar disabled)
node --env-file=.env scripts/probar-caso-asesor.js --local
node --env-file=.env scripts/desplegar-vps.js --publicar
node --env-file=.env scripts/verificar-despliegue.js
```

**Datos en producción.** 84 reservas (todas `origen='humano'`, del Excel), 0
citas, leads reales. Sin deriva: repo, base y VPS coinciden.

## Lo que falta

### 1. Traspaso al asesor: solo falta Meta

El número del asesor ya está puesto y publicado (`+573006174717`). Lo único que
falta es que Meta apruebe la plantilla **`aviso_caso_asesor`**, hoy en PENDING:
`node --env-file=.env scripts/plantilla-asesor.js` dice cómo va.

En cuanto pase a APPROVED se enciende `Caso del Asesor` y se sube — los pasos
exactos están arriba. **Antes no**, por lo que se explica ahí: el bot se
callaría sin que el asesor se entere.

### 2. Enseñarle al equipo la hoja nueva

La sincronización solo sirve si alguien escribe en la pestaña `Reservas`. Lo que
hay que decirles, y no está escrito en ningún sitio que ellos lean:

- Una fila por fecha vendida: basta con **la fecha y el nombre del salón** (el
  cliente ayuda, pero no hace falta).
- El salón, con el nombre del catálogo. No hace falta clavarlo: `casa christians
  ciudad jardin`, en minúsculas y sin tildes, resuelve solo. Y desde que Granada
  Premium salió del catálogo, "Granada" a secas también vale — es el Gold.
- La fecha, **escrita como fecha**, no como texto. Así no hay que adivinar si
  3/5/2027 es mayo o marzo.
- Para soltar una fecha: `sí` en la columna `cancelada`. **Borrar la fila no
  hace nada** — a propósito.
- La última columna dice qué pasó con cada fila. Si una se queda en blanco, esa
  fila no la está viendo nadie.

### 3. Preguntarle al equipo dos cosas del libro viejo

Las dos están explicadas arriba, y las dos son de la misma naturaleza: una fecha
vendida cuya sede no se puede deducir del papel.

1. **¿En qué salón es el evento de LILIBETH RAMIREZ del 18 de septiembre de
   2027?** Es el único agujero real que queda: hoy el agente da esa fecha por
   libre en las cuatro sedes propias.
2. **¿La fecha de DIEGO MONTOYA del 27 de diciembre de 2026 es en Casa 4?** Está
   cargada como tal —deducida del precio— pero venía escrita en la hoja de
   Granada, que es del vecino.

Las dos se arreglan escribiendo la fila en la pestaña `Reservas`; la segunda,
si estuviera mal, se suelta con `sí` en la columna `cancelada`.

### 4. Vigilar la primera semana

Lo que conviene mirar un par de veces:

- Que la columna `sincronizado` no se llene de `✗` (sedes mal escritas: si pasa
  mucho, el catálogo de nombres no es el que el equipo usa).
- Que no aparezcan `⚠` de choque. Uno significa que el bot y una persona
  vendieron la misma fecha, y eso hay que resolverlo con el cliente.
- `node --env-file=.env scripts/volcar-agenda-a-calendar.js` (en seco) de vez en
  cuando: dice si alguna fecha ocupada se quedó sin evento en Calendar, y si
  sobra algún evento sin fila que lo respalde.

## Guiones útiles

```bash
node scripts/probar-excel.js                                  # sin red
node --env-file=.env scripts/probar-sincronizacion.js --local # la vuelta del Excel, sin n8n ni Google
node --env-file=.env scripts/preparar-excel.js                # estado de la hoja
node --env-file=.env scripts/migrar-reservas-a-excel.js       # qué falta por volcar a la hoja
node --env-file=.env scripts/volcar-agenda-a-calendar.js      # qué falta y qué sobra en Calendar
node --env-file=.env scripts/probar-caso-asesor.js --local
node --env-file=.env scripts/verificar-despliegue.js          # repo == VPS?
node --env-file=.env scripts/desplegar-vps.js --publicar
```

## Una trampa que ya mordió

`scripts/casos-prueba.js` usaba `Sede Norte / 2026-12-05` como fecha "libre" del
caso 9, y esa es una de las 113 que el equipo tenía vendidas: desde que entró la
migración `20260901000000`, el banco daba rojo por un dato real, no por un fallo.
Se movió a 2028, que es más allá de donde llega el calendario de la empresa. **Una
fecha de prueba tiene que ser una que nadie pueda vender.**
