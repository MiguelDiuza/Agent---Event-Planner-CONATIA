# Herramientas del AI Agent

Las herramientas que se conectarán al nodo AI Agent en n8n. Las columnas
citadas corresponden a `supabase/migrations/20260812000000_schema.sql`.

La **descripción** de cada herramienta es lo que el LLM lee para decidir
cuándo llamarla — por eso se redacta en términos de la situación de la
conversación, no de la implementación.

> 🛑 **Nunca interpolar `$fromAI()` dentro del SQL.** Los valores del modelo
> van SIEMPRE como `$1`, `$2` en `query` + `options.queryReplacement`.
> Interpolarlos con `{{ }}` es inyección SQL: el valor lo decide el LLM, que
> responde a mensajes de WhatsApp de cualquier desconocido. Un mensaje
> diseñado para ello podría hacer que el modelo produzca
> `0; drop table leads; --` como "cantidad de invitados".

> ⚠️ **El teléfono del lead nunca va por `$fromAI()`.** Las herramientas que
> escriben en `leads` (#5, #6, #7) filtran por teléfono; si el modelo lo
> rellena, se lo inventa. Se conecta desde el webhook igual que el
> `sessionKey` de la memoria. Solo van por `$fromAI()` los datos que el
> agente genuinamente decide: invitados, tipo de evento, fecha, sede,
> nombre y motivo.

---

## 1. `consultar_precios_sedes`

**Descripción para el LLM:**
> Devuelve la lista de sedes disponibles con su precio exacto del paquete
> todo incluido, para una cantidad de invitados. Úsala siempre que el cliente
> te diga cuántos invitados espera y necesites cotizar. Si el número no es
> exacto (ej. 55), llama esta herramienta con el escalón superior (60). Los
> escalones válidos van de 50 a 200, de a 10.

**Parámetro:** `invitados` (number)

`query`:
```sql
select s.nombre_sede, p.precio_total, s.incluye_pista_cristal
from precios_sedes p
join sedes s on s.id_sede = p.sede_id
where p.capacidad_invitados = $1
order by p.precio_total
```

`options.queryReplacement`:
```
={{ $fromAI('invitados', 'Cantidad de invitados. Escalón exacto entre 50 y 200 de a 10 (50, 60, 70...). Si el cliente dice un número intermedio como 55, usa el superior: 60.', 'number') }}
```

---

## 2. `consultar_inclusiones_evento`

**Descripción para el LLM:**
> Devuelve el guion literal de la cotización de un tipo de evento, ya partido en
> globos de WhatsApp y listo para enviar tal cual. El campo `guion_cotizacion`
> se copia palabra por palabra, con sus `|||`: incluye las tres partes de la
> cotización y el globo de obsequios. También sirve para responder qué incluye
> el paquete.

**Parámetro:** `tipo_evento` (string)

`query`:
```sql
select nombre_paquete,
       array_to_string(mensajes_cotizacion || mensaje_obsequio, E'\n|||\n') as guion_cotizacion
from tipos_evento
where nombre_paquete = fn_resolver_tipo_evento($1)
```

`options.queryReplacement`:
```
={{ $fromAI('tipo_evento', 'Tipo de evento del cliente: 15 Años, Matrimonio, Grado, Cumpleaños, Empresa, Primera Comunión o Baby Shower. Puedes escribirlo tal como lo dijo el cliente (boda, graduacion, quinceañera): la herramienta lo traduce.', 'string') }}
```

> **Por qué `fn_resolver_tipo_evento` y no un `ilike`** (2026-08-26). El `ilike`
> anterior fallaba en 12 de 30 variantes reales, y las peores eran `15 Anos`,
> `Cumpleanos` y `Primera Comunion` **sin tilde** — que era justo lo que la
> descripción vieja le pedía escribir al modelo. Para `ILIKE` la `ñ` no es una
> `n`. La función normaliza sin tildes ni signos y consulta
> `tipos_evento.alias`, donde viven los sinónimos del cliente. Ver la migración
> `20260826000006`, que lleva las 30 variantes como autoprueba.

---

## 3. `consultar_servicios_upselling`

**Descripción para el LLM:**
> Devuelve los servicios adicionales (fotografía Focus Art y Pirotecnia Show)
> con precio, detalle y promociones vigentes. Úsala antes de ofrecer
> fotografía o pirotecnia, para no equivocarte en precios ni promociones.

**Parámetro:** ninguno (devuelve el catálogo completo, son 10 filas)

`query`:
```sql
select servicio, precio, detalles, promociones
from servicios_adicionales_upselling
order by precio desc
```

Sin `queryReplacement` — no recibe entrada del modelo, así que no hay
superficie de inyección.

---

## 4. `verificar_disponibilidad_calendario`

**Descripción para el LLM:**
> Revisa si una sede está libre en una fecha concreta. DEBES usarla antes de
> decirle a un cliente que su fecha está disponible — nunca lo afirmes sin
> haberla consultado. Devuelve disponible true o false.

**Parámetros:** `fecha` (string, `YYYY-MM-DD`), `sede` (string)

**Implementación:** nodo Google Calendar, operación *Get Many Events* sobre
el `google_calendar_id` de la sede (lookup previo en `sedes`), rango del día
completo. Sin eventos → disponible.

> ⚠️ `sedes.google_calendar_id` está vacío hasta que se creen los 15
> calendarios en Google Calendar y se registren sus IDs.

---

## 5. `bloquear_fecha_calendario`

**Descripción para el LLM:**
> Separa una fecha para un cliente. Úsala SOLO cuando el cliente haya
> aceptado explícitamente separar la fecha y te haya dado su nombre completo.
> Crea el evento en el calendario de la sede y registra la reserva.

**Parámetros:** `fecha` (string), `sede` (string), `nombre_cliente` (string)

> 🔒 **Requiere aprobación humana** (decisión del negocio, 2026-08-13).
> Separar una fecha ocupa una sede real y revertirlo es costoso, así que la
> herramienta va detrás de un nodo human-in-the-loop por WhatsApp: el equipo
> aprueba antes de que se cree el evento. El mensaje de aprobación debe
> mostrar los parámetros reales con `{{ $tool.parameters.fecha }}` etc., no
> una paráfrasis generada por el modelo.

**Implementación:** sub-workflow (`.toolWorkflow`), tres pasos —
1. Google Calendar *Create Event*: título `SEPARADO - {nombre_cliente}`, todo el día.
2. `insert into agenda_reservas (sede_id, lead_id, fecha_solicitada, nombre_cliente, estado, google_event_id) values (..., 'separado', ...)`
3. `update leads set estado = 'separado' where telefono = <plumbed desde el webhook>`

---

## 6. `enviar_cotizacion_email`

**Descripción para el LLM:**
> Envía por correo la cotización o la confirmación de reserva. Úsala solo
> cuando tengas el correo del cliente y él haya pedido el detalle por escrito,
> o para confirmar una reserva ya separada.

**Parámetros:** `email` (string), `asunto` (string), `contenido` (string)

**Implementación:** nodo Gmail *Send*. También guarda el correo:
`update leads set email = <email> where telefono = <sesión>`

---

## 7. `escalar_a_humano`

**Descripción para el LLM:**
> Pasa la conversación a un asesor humano. Úsala cuando el cliente pida
> descuentos o negociar el precio, presente una queja, o pida algo que no
> puedes resolver con tus otras herramientas. Después de usarla, dile al
> cliente que un asesor lo contactará en breve.

**Parámetro:** `motivo` (string)

**Implementación:** dos pasos —
1. `update leads set requiere_humano = true where telefono = <sesión>`
2. Nodo WhatsApp *Send* al número interno del equipo con teléfono del
   cliente, nombre y motivo.

El flag `requiere_humano` corta las respuestas automáticas en el IF que sigue
al upsert del lead — a partir de ahí ese cliente lo atiende una persona.

---

## 8. `enviar_medios`

**Descripción para el LLM:**
> Envía fotos o videos al cliente por WhatsApp. En la cotización: categoria
> 'sede', referencia 'todas' e invitados — salen juntos los videos de todos los
> salones, ya etiquetados con nombre, tipo de espacio y precio. Para un salón
> concreto: categoria 'sede' y referencia con su nombre exacto. El material
> disponible y el momento de cada pieza están en la sección MATERIAL VISUAL
> DISPONIBLE de tus instrucciones.

**Parámetros:** `categoria`, `referencia`, `tipo_medio` e `invitados` (por
`$fromAI()`) y `telefono`, que **no** va por `$fromAI()`: sale de
`{{ $('Upsert Lead').item.json.telefono }}`.

> `invitados` se sanea en el nodo antes de llegar al SQL:
> `Number.isFinite(n) && n > 0 ? Math.round(n) : null`. El modelo puede mandar
> "unos 80" o nada; un `null` degrada a caption sin precio, que es preferible a
> reventar la llamada.

> El plan original decía tomarlo de `Extraer Mensaje`. No sirve: ese nodo solo
> corre en la ruta de WhatsApp, no en la del chat de prueba. `Upsert Lead` corre
> en las dos.

**El "cuándo enviar" no vive en el prompt.** Vive en la columna
`medios.cuando_usar`, y el nodo `Catálogo de Medios`
(`select fn_catalogo_digest() as digest`) lo inyecta al system message en cada
turno. Agregar un video es un `insert`, nunca editar el prompt.

**Implementación:** sub-workflow `n8n/workflow-enviar-medios.json`, 17 nodos
—cuatro son los envíos archivados de Meta y de Evolution, `disabled` y
desconectados. Usa `fn_medios_para_enviar`, `fn_medios_diagnostico` y
`fn_registrar_envio`.

1. `Seleccionar Medios` — **dos modos**:
   - `categoria` = `sede` con `referencia` vacía o `todas` → la tanda de la
     cotización, `fn_medios_sedes_cotizacion(telefono, invitados)`.
   - cualquier otra referencia → `fn_medios_para_enviar(categoria, referencia, telefono, tipo_medio)`.

   El filtro anti-repetición vive en las dos funciones: nunca devuelven algo que
   ese teléfono ya recibió.
2. `¿Hay medios?` → si no hay, `Diagnóstico` distingue **"ya se lo enviaste
   todo"** de **"esa referencia no existe"** y devuelve la lista de referencias
   válidas. Sin esa distinción el agente le diría a un cliente que no hay fotos
   de una sede de la que acaba de mandarle fotos.
3. `Recorrer Medios` (batch 1) → `¿Es video?` → `Enviar Video` / `Enviar Foto`.
4. `¿Envío exitoso?` → solo la rama buena llega a `Registrar Envío`.
5. `Resumen` — cuenta únicamente lo que el proveedor aceptó.

> 📌 **La tanda de la cotización** (2026-08-25). `fn_medios_sedes_cotizacion`
> devuelve el video de **todas** las sedes con material cargado y le arma el
> caption: `<Salón> <sede> - valor PROMOCIONAL: $<precio> - <N> personas`.
> Estar en la tanda depende de tener un video activo, nada más;
> `sedes.tipo_espacio` solo decide el paréntesis del tipo, y una sede sin
> clasificar manda su video sin él. El
> precio es el del escalón del cliente —redondeado con la misma regla del
> cotizador, 55 → 60— o el del escalón más cercano con la aclaración "hasta N
> invitados". **No filtra por capacidad**: el negocio prefiere mostrar el
> inventario completo. Sin `invitados`, el caption va sin precio.
>
> El caption lo escribe la base y no el agente porque es lo que el cliente
> relee: un precio tecleado por el modelo puede discrepar del que cotizó.

> 📌 **Los videos de sede no viajan solos** (2026-08-25). La query de
> `Seleccionar Medios` les suma el video de promoción la **primera** vez que ese
> cliente ve salones. Está en SQL y no en el prompt a propósito: el agente pide
> los salones y el acompañamiento es automático, así que no depende de que el
> modelo se acuerde. Tres detalles que lo sostienen:
>
> - Solo aplica a `categoria = 'sede'` **y** solo si el pedido devolvió algo. Si
>   no hay material, la salida queda vacía y el flujo cae en `Diagnóstico` igual
>   que antes: la promoción nunca llega suelta.
> - "Primera vez" se decide mirando `envios_medios`, no lo que
>   `fn_medios_para_enviar` deja disponible. Son cosas distintas en cuanto haya
>   más de una pieza institucional en el catálogo.
> - El orden importa y lo fija un `order by`: primero los salones, después la
>   promoción.

> 📌 **Los testimonios salen de circulación** (2026-08-25, migración
> `20260825000002`). Al cliente se le manda la promoción y los salones, nada
> más. Los dos testimonios quedan con `activo = false`, que los saca de las tres
> funciones de una sola vez —incluida `fn_catalogo_digest`—, así que el agente
> ya no los ve en MATERIAL VISUAL DISPONIBLE y no puede ofrecerlos. Reactivarlos
> es un `update`.

> ⚠️ **Por qué hace falta el IF `¿Envío exitoso?`.** Los dos nodos de WhatsApp
> van con `onError: continueRegularOutput`, para que un archivo que Meta
> rechace no tumbe el turno del agente. Pero eso hace que un envío **fallido
> también salga por la salida normal**: sin el IF quedaría registrado como
> enviado, y como el filtro anti-repetición se apoya en ese registro, ese
> archivo quedaría suprimido **para siempre** para ese cliente.

> ⚠️ **`tipo_medio` nunca puede llegar vacío.** Las funciones lanzan excepción
> con un valor inválido, y el `default 'ambos'` solo aplica cuando el argumento
> se **omite**, cosa que una llamada posicional de cuatro placeholders nunca
> hace. Por eso el nodo envuelve el valor: `$json.tipo_medio || 'ambos'`.

> ⚠️ **`fn_registrar_envio` devuelve NULL sin error** si el teléfono no está en
> `leads`. No tratar su resultado como un id garantizado.

**Cómo salen los archivos** (2026-08-23): ya no por el nodo `WhatsApp` de
Meta, sino por dos `httpRequest` contra YCloud —`Enviar Video` y `Enviar Foto`—
con la credencial `FuwQeM17hSh07Wal`:

```
POST https://api.ycloud.com/v2/whatsapp/messages/sendDirectly
{ from: '+573150290928', to|recipient: <teléfono>, type: 'video'|'image',
  video|image: { link: $json.url, caption: $json.caption } }
```

Se manda la **URL pública** del bucket, no el binario: WhatsApp la descarga.
Por eso el bucket `medios` es público. `to` o `recipient` según el teléfono
empiece o no por `+` — el mismo criterio que en el workflow principal.

Los nodos viejos siguen en el archivo con sufijo `(Meta)` y `(Evolution)`,
`disabled` y desconectados. No hay nada que reconstruir para volver a ellos.

> 📌 El catálogo cargado hoy son **sedes** e **institucional** (promoción y
> testimonios, hoy inactivos). No hay material de `categoria = servicio`, así que la prueba de
> Pirotecnia del plan (Task 9) no se puede correr hasta que se cargue.

## 9. `agendar_cita`

**Descripción para el LLM:**
> Agenda una cita con el asesor. Úsala cuando el cliente quiera visitar un
> salón, tomarse medidas para un traje, recibir una llamada o una asesoría.
> `tipo_cita` es exactamente uno de: visita_sede, prueba_traje, llamada,
> asesoria. `fecha` en formato YYYY-MM-DD y `hora` en HH:MM (24h). En
> `detalle` incluye lo que hace falta según el tipo: qué sede y para cuántos
> invitados, qué traje, o el número a llamar. Las citas duran 30 minutos y las
> llamadas 20. Si la herramienta responde que el horario está ocupado, propón
> otro y vuelve a llamarla.

**Parámetros:** `tipo_cita`, `fecha`, `hora`, `detalle`, `nombre` (todos
string, todos por `$fromAI()`) y `telefono`, que **no** va por `$fromAI()`:
se toma de `{{ $('Upsert Lead').item.json.telefono }}`, igual que el
`sessionKey` de la memoria.

**Sin aprobación humana** (decisión del negocio, 2026-08-13): agendar una cita
es de bajo riesgo y revertirlo es barato, al contrario que separar una fecha
(#5).

**Implementación:** sub-workflow `n8n/workflow-agendar-cita.json`, 9 nodos.

Un **solo calendario de empresa**, no uno por sede: atiende una sola persona,
así que no puede haber dos citas en paralelo aunque sean de sedes distintas.

La regla que hace todo lo demás: la cita ocupa `[hora, hora+duración]` y el
negocio exige un colchón a cada lado. Por eso el choque no se mide contra la
cita, sino contra la ventana `[hora-colchón, hora+duración+colchón]` — si hay
cualquier evento ahí dentro, el horario no sirve.

**Duración y colchón por tipo** (2026-08-25) — el mapa `MINUTOS` en
`Calcular Ventana`:

| Tipo | Duración | Colchón | Ventana de choque |
|---|---|---|---|
| `visita_sede`, `prueba_traje`, `asesoria` | 30 min | 30 min | 90 min |
| `llamada` | 20 min | 20 min | 60 min |

Una llamada es más corta y necesita menos aire que recibir a alguien en la sede.
El nodo devuelve `duracion_min` en su salida, así que el agente puede decírselo
al cliente sin suponerlo.

1. `Entrada de la Herramienta` — recibe los 6 campos.
2. `Calcular Ventana` (Code) — valida y calcula la ventana en
   `America/Bogota`.
3. `¿Entrada válida?` (IF) — la rama falsa devuelve el motivo del rechazo
   redactado *como instrucción para el agente*, para que corrija y reintente
   en vez de reventar con un error crudo de la API de Google.
4. `Buscar Choques` — Google Calendar *Get Many Events* sobre la ventana.
5. `¿Hay choque?` (IF) — ocupado → pedir otro horario; libre → seguir.
6. `Crear Cita` — Google Calendar *Create Event*, con el `fin` que calculó
   `Calcular Ventana` (30 min, o 20 si es llamada), título
   `[tipo_cita] Nombre` y descripción con tipo, nombre, teléfono y detalle,
   para que el asesor abra el evento y no tenga que volver al chat.
7. `Cita Confirmada` (Set) — devuelve al agente el resumen a confirmarle al
   cliente.

> ⚠️ Dos detalles que parecen menores y no lo son:
>
> - **`alwaysOutputData: true` en `Buscar Choques`.** Sin él, cero eventos
>   hace que n8n salte los nodos siguientes y la rama de "horario libre"
>   nunca corre — nunca se agendaría nada. Mismo patrón documentado para
>   `enviar_medios`.
> - **`limit: 1` en `Buscar Choques`.** Solo importa *si* hay choque, no
>   cuántos. Con `returnAll` el IF se abriría en un item por evento y
>   `Crear Cita` correría varias veces.

> 🔑 **Pendiente para que funcione:** la credencial *Google Calendar OAuth2
> API* del proyecto en los nodos `Buscar Choques` y `Crear Cita`, y
> reemplazar el `PENDIENTE__ID_CALENDARIO_EMPRESA` de ambos por el Calendar
> ID real. Mientras tanto el nodo `agendar_cita` del workflow principal está
> `disabled` para que el agente no la ofrezca.

**Validaciones del nodo `Calcular Ventana`** — la entrada la escribe un LLM, y
un valor mal formado llegaría a la API de Google como error incomprensible:

| Rechaza | Por qué |
|---|---|
| `tipo_cita` fuera de la lista | evita citas con tipos inventados |
| `nombre` vacío | el asesor necesita saber a quién atiende |
| `fecha`/`hora` que no parsean con formato estricto | el modelo tiende a mandar "mañana" o "3pm" |
| horario ya pasado | el modelo se equivoca de año o de día con facilidad |

---

## Nodos n8n a usar

Verificado contra la instancia real vía `search_nodes` / `get_node`
(2026-08-13, n8n-mcp 2.69.0):

| Pieza | Node type | Nota |
|---|---|---|
| Entrada WhatsApp | `n8n-nodes-base.whatsAppTrigger` | nativo; el flujo anterior usaba webhook genérico |
| Salida WhatsApp | `n8n-nodes-base.whatsApp` | operación `send` |
| Envío de fotos y videos | `n8n-nodes-base.whatsApp` | operación `send`, messageType `image` / `video` |
| **Aprobación humana** | `n8n-nodes-base.whatsApp` | operación **`sendAndWait`** — confirmado disponible |
| Herramientas #1–#3 (consultas) | `n8n-nodes-base.postgresTool` | variante AI Tool; evita 3 sub-workflows |
| Herramientas #4, #5, #7, #8, #9 | `@n8n/n8n-nodes-langchain.toolWorkflow` | multi-paso |
| Agente | `@n8n/n8n-nodes-langchain.agent` | |
| Modelo | `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` | |
| Memoria | `@n8n/n8n-nodes-langchain.memoryPostgresChat` | `sessionKey` = teléfono |

La operación `sendAndWait` del nodo de WhatsApp resuelve la aprobación de
`bloquear_fecha_calendario` sin nodos community: el sub-workflow envía los
parámetros reales al número interno y espera la respuesta antes de crear el
evento en Calendar.

## Nota sobre el conteo

El documento del negocio definía 4 herramientas. Aquí hay 9 porque:
- `consultar_servicios_upselling` (#3) se separó para que el agente no
  invente precios de fotografía ni pirotecnia — la restricción "NUNCA
  inventes precios" del prompt necesita una fuente consultable.
- `enviar_cotizacion_email` (#6) y `escalar_a_humano` (#7) fueron aprobadas
  explícitamente como parte del alcance v1.
- `enviar_medios` (#8) y `agendar_cita` (#9) se agregaron después, en
  2026-08-14 y 2026-08-18: mandar fotos y videos del salón, y agendar la
  visita, son los dos pasos que de verdad cierran la venta y hasta entonces
  quedaban en manos de una persona.

`agendar_cita` (#9) y `bloquear_fecha_calendario` (#5) se parecen pero no son
lo mismo, y conviene no confundirlas: la #9 aparta **30 minutos del asesor**
(20 si es una llamada) en el calendario de la empresa; la #5 aparta **un día
entero de una sede** para un evento. Por eso la #5 pide aprobación humana y la #9 no.
