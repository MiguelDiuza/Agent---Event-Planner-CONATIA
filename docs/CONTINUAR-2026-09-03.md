# Dónde quedó todo — 2026-09-03

Continúa [CONTINUAR-2026-09-02.md](CONTINUAR-2026-09-02.md). Lo de ese día sigue
valiendo salvo donde aquí diga otra cosa.

## De qué iba el día

El cliente mandó una captura: el agente le dijo a alguien que el **viernes 4 de
diciembre** estaba libre en Granada Gold, y en la hoja `GRANADA 2026` ese día lo
tiene MONICA BEDOYA. La pregunta era «el agente está reservando fechas ocupadas».

**No lo estaba haciendo, y sí había un agujero — otro.**

La captura era una confusión entre los dos Granadas: son dos salones distintos y
el libro los lleva en calendarios separados, con clientes distintos el mismo día
(12 de diciembre: ADRIANA en uno, NATALIA PLAZA en el otro). El 4 de diciembre
está vendido en el que **no** manejamos. El precio lo confirma: 7.000.000 para 60
personas es la tarifa de Granada Premium menos el descuento de viernes.

Ratificado ese día por el cliente, con estas palabras: **«Granada se ignora por
completo. Solo se tiene en cuenta Granada Gold. Ninguna otra.»**

Lo que sí estaba roto era otra cosa, y más grande. Tres cosas.

## Lo que se arregló

### 1. El agente no leía donde el equipo vende

La sincronización miraba **una** pestaña, `Reservas`, que es una tabla hecha para
la máquina. El equipo vende en el calendario de cada salón, y de ahí se sacó una
foto **una sola vez**, a mano, el 2026-09-01. Todo lo vendido después era
invisible: la fecha seguía libre para el agente.

Ahora `workflow-sincronizar-hoja.json` lee las **trece** pestañas cada quince
minutos, por la misma `fn_sincronizar_agenda_desde_hoja`. Detalles en el README,
apartado «Y los calendarios por salón».

### 2. `"GRANADA"` a secas resolvía a Granada Gold

Al quedar una sola Granada en el catálogo, el casado por contenido la resolvía al
Gold. Como el equipo distingue `GRANADA` y `GOLD` en su propia columna, la
primera fila que dijera «GRANADA» habría **bloqueado una fecha buena del Gold**
con una venta del vecino. Ahora se rechaza con el motivo escrito.

### 3. Los nombres del equipo no resolvían

`AVDA 3 NORTE`, `AV 3 NTE`, `LAS PILAS`, `3RA NORTE`, `H. TALISMAN`: los cinco
daban cero sedes. El día que empezaran a usar la hoja, cada una de esas filas
habría salido rechazada. Viven ahora en `sedes_alias`, y quien los traduce es
`fn_resolver_sede` — la misma función para la sincronización y para la auditoría.

### Y tres cierres, no uno

| | |
|---|---|
| Cada 15 minutos | La agenda se pone al día con el libro entero. |
| Al apartar | `separar_fecha_evento` llama a la sincronización y **la espera** antes de insertar. La ventana de quince minutos no existe en el único momento que importa. |
| En el insert | `on conflict (sede_id, fecha_solicitada) do nothing`. Restricción de la base, no comprobación. |

## Los tres fallos que salieron de probar, y que no se veían

Los tres son de la misma familia y conviene tenerlos juntos, porque el patrón se
va a repetir:

1. **n8n colapsa los parámetros de query repetidos.** De los catorce `ranges`
   mandaba uno. La rama leyó una sola pestaña y no se quejó. Van pegados a la URL.
2. **Un nodo con cero items no ejecuta lo que tiene detrás.** Mordió dos veces:
   primero la alarma de «no pude leer esta pestaña», que se tragaba a sí misma; y
   después `Sincronizar Antes de Apartar`, que dejó **una reserva sin hacer
   mientras el agente le decía al cliente que su fecha había quedado apartada**.
   Se cierra con `alwaysOutputData`, y `revisar-workflows.js` ahora lo exige en
   todo nodo que llame a otro workflow.
3. **`desplegar-vps.js` y `verificar-despliegue.js` no comparaban
   `alwaysOutputData` ni `onError`.** El arreglo del punto 2 se subía como «sin
   cambios» y la verificación decía después que no había deriva. Las dos
   mintiendo a la vez.

Y uno de antes, encontrado al ir a usarlo: **`probar-reserva-completa.js` no
compilaba** desde `dfac17b` (dos backticks dentro de un template literal). La
prueba de punta a punta no se había ejecutado nunca.

## Cómo se comprueba hoy

```bash
node --env-file=.env scripts/auditar-fechas-excel.js      # ¿alguna fecha vendida que el agente vea libre?
node --env-file=.env scripts/probar-fechas-ocupadas.js    # tres conversaciones para que venda dos veces
node --env-file=.env scripts/probar-sincronizacion.js --local
node --env-file=.env scripts/probar-reserva-completa.js
node scripts/revisar-workflows.js && node scripts/probar-excel.js
node --env-file=.env scripts/verificar-despliegue.js
```

`auditar-fechas-excel.js` **no repite la lógica, la corre**: los rangos del nodo,
el código del nodo leído del `.json`, y `fn_resolver_sede`. Y avisa de dos cosas
que ninguna otra prueba veía: un calendario del libro que el workflow no pide, y
uno que pidió y no llegó.

## Lo que queda abierto

### 1. La plantilla de Meta sigue en PENDING

`aviso_caso_asesor` no está aprobada (comprobado el 2026-09-03). El nodo
`Caso del Asesor` **sigue apagado**, y así debe seguir hasta que pase a APPROVED:
con la plantilla sin aprobar el aviso falla, el bot se calla en ese chat y el
asesor no se entera. Los pasos para encenderlo están en CONTINUAR-2026-09-02.

```bash
node --env-file=.env scripts/plantilla-asesor.js
```

### 2. Siete filas del libro que necesitan una persona

Están en la pestaña **`Revisar`** del Excel, cada una con su motivo. Desde
`20260903000000` cada rechazo dice además si ese cliente **ya tiene** una fecha
en la agenda (dedazo, nada que perseguir) o **no la tiene** (venta que falta).

La que importa es **`2027`!54, LILIBETH RAMIREZ, sábado 18 de septiembre de
2027, sin salón escrito**. Ojo con la coincidencia: ZORAIDA MARTINEZ, en
Talismán, es ese mismo día. Los valores no cuadran (18.200.000 para 150 personas
contra 20.000.000 para 100), así que probablemente son dos eventos — pero es lo
primero que hay que preguntarles.

### 3. El equipo todavía no usa la hoja nueva

Dicho por el cliente: la van a usar **cuando todo esté probado**. Hasta
entonces, los calendarios del Google Sheets son la copia del 2026-09-02 y no se
mueven. El día que empiecen, esto ya los está leyendo — no hay que tocar nada,
pero conviene mirar `Revisar` la primera semana.

Lo que hay que decirles está en CONTINUAR-2026-09-02, apartado 2, **con una
corrección**: ya no hace falta que copien nada en `Reservas` para que el agente
vea una venta. `Reservas` sigue siendo la única forma de **soltar** una fecha
(columna `cancelada`) y la única donde la respuesta queda al lado de la fila.
