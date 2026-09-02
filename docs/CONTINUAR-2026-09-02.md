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

**Traspaso al asesor — CONSTRUIDO, APAGADO.**
Después de la cita, el bot le dice al cliente que el asesor retoma, le avisa al
asesor y se calla (`requiere_humano`). Migración `20260902000000` aplicada en
producción. Los 6 nodos están en el VPS pero `Caso del Asesor` está
**deshabilitado**, y es el interruptor de toda la rama.

**Datos en producción.** 113 reservas (todas `origen='humano'`, del Excel), 0
citas, leads reales. Sin deriva: repo, base y VPS coinciden.

## Lo que falta

### 1. Traspaso al asesor: dos cosas de fuera

- **El número de WhatsApp del asesor.** Hoy el nodo `Avisar al Asesor` lleva el
  marcador `+570000000000`.
- **La plantilla `aviso_caso_asesor`**, en revisión de Meta.
  `node --env-file=.env scripts/plantilla-asesor.js` dice cómo va.

Con las dos, se enciende `Caso del Asesor` y se sube.

### 2. Enseñarle al equipo la hoja nueva

La sincronización solo sirve si alguien escribe en la pestaña `Reservas`. Lo que
hay que decirles, y no está escrito en ningún sitio que ellos lean:

- Una fila por fecha vendida: basta con **la fecha y el nombre del salón** (el
  cliente ayuda, pero no hace falta).
- El salón, con el nombre del catálogo. "Granada" a secas no vale: son dos
  salones distintos, Gold y Premium, con precios distintos.
- La fecha, **escrita como fecha**, no como texto. Así no hay que adivinar si
  3/5/2027 es mayo o marzo.
- Para soltar una fecha: `sí` en la columna `cancelada`. **Borrar la fila no
  hace nada** — a propósito.
- La última columna dice qué pasó con cada fila. Si una se queda en blanco, esa
  fila no la está viendo nadie.

### 3. Vigilar la primera semana

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
