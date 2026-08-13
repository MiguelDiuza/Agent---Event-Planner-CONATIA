# Herramientas del AI Agent

Las 6 herramientas que se conectarán al nodo AI Agent en n8n. Las columnas
citadas corresponden a `supabase/migrations/20260812000000_schema.sql`.

La **descripción** de cada herramienta es lo que el LLM lee para decidir
cuándo llamarla — por eso se redacta en términos de la situación de la
conversación, no de la implementación.

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

```sql
select s.nombre_sede,
       p.precio_total,
       s.incluye_pista_cristal
from precios_sedes p
join sedes s on s.id_sede = p.sede_id
where p.capacidad_invitados = {{ $fromAI('invitados') }}
order by p.precio_total;
```

---

## 2. `consultar_inclusiones_evento`

**Descripción para el LLM:**
> Devuelve qué incluye el paquete de un tipo de evento y qué obsequios trae.
> Úsala cuando el cliente pregunte qué incluye, o cuando presentes un paquete
> y necesites detallar inclusiones y obsequios. Tipos válidos: 15 Años,
> Matrimonio, Grado, Cumpleaños, Empresa, Primera Comunión, Baby Shower.

**Parámetro:** `tipo_evento` (string)

```sql
select nombre_paquete, inclusiones_base, obsequios, excepciones
from tipos_evento
where nombre_paquete ilike '%' || {{ $fromAI('tipo_evento') }} || '%';
```

---

## 3. `consultar_servicios_upselling`

**Descripción para el LLM:**
> Devuelve los servicios adicionales (fotografía Focus Art y Pirotecnia Show)
> con precio, detalle y promociones vigentes. Úsala antes de ofrecer
> fotografía o pirotecnia, para no equivocarte en precios ni promociones.

**Parámetro:** ninguno (devuelve el catálogo completo, son 10 filas)

```sql
select servicio, precio, detalles, promociones
from servicios_adicionales_upselling
order by precio desc;
```

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

## Nota sobre el conteo

El documento del negocio definía 4 herramientas. Aquí hay 7 porque:
- `consultar_servicios_upselling` (#3) se separó para que el agente no
  invente precios de fotografía ni pirotecnia — la restricción "NUNCA
  inventes precios" del prompt necesita una fuente consultable.
- `enviar_cotizacion_email` (#6) y `escalar_a_humano` (#7) fueron aprobadas
  explícitamente como parte del alcance v1.
