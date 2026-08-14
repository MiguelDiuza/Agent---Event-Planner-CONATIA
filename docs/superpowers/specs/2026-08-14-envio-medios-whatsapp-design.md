# Envío de fotos y videos por WhatsApp — Brian Otero

Extiende el agente descrito en
`2026-08-12-n8n-event-planner-agent-design.md` con una octava herramienta:
enviar material visual (fotos de sedes, montajes por tipo de evento,
portafolio de fotografía, video de pirotecnia) durante la conversación.

## Motivación

El guion de ventas ancla valor con texto: precios, inclusiones, obsequios.
Vender un salón de eventos y un show de pirotecnia sin mostrarlos deja fuera
el argumento más fuerte que tiene el negocio. El cliente que ve la pista de
cristal montada decide distinto al que la lee.

## Requisito rector: agregar contenido no debe requerir tocar código

El catálogo va a crecer con videos que hoy no existen, cada uno con su
propio momento de uso. Si el momento de envío vive en el system prompt,
cada video nuevo obliga a editar el prompt dentro de n8n, redesplegar y
volver a probar el agente — el contenido quedaría rehén del workflow.

**El catálogo se describe a sí mismo.** Cada medio declara en qué momento de
la conversación conviene enviarlo (`cuando_usar`), y un nodo previo al agente
inyecta un resumen del catálogo en su system message. Agregar un video es un
`insert`: el agente se entera solo, en la siguiente conversación, sin tocar
prompt ni workflow ni código.

Esto atraviesa todo el diseño de abajo y es el criterio con el que se
resuelve cualquier duda de implementación.

## Decisiones tomadas (2026-08-14)

| Decisión | Elegida | Descartada |
|---|---|---|
| Almacenamiento | Supabase Storage, bucket público, envío por URL | Google Drive con descarga binaria en n8n |
| Quién decide enviar | El agente, vía herramienta | Puntos fijos del flujo; esquema mixto |
| Dónde vive el "cuándo" | En el catálogo, inyectado al system message | Escrito a mano en el system prompt |
| Asociación de medios | Sede, tipo de evento, servicio e institucional (las cuatro) | Una sola dimensión |
| Material que excede los límites | Comprimir/recortar antes de subir | Enviar enlace externo |
| Repetición | Registro en BD, no se repite material | Confiar en la memoria del agente |
| Forma de la herramienta | Una sola, con `categoria` + `referencia` + `tipo_medio` | Consultar-luego-enviar; una tool por categoría |

### Por qué Supabase Storage y no Drive

Drive no expone URLs de descarga directa que Meta pueda leer, así que obliga
a un nodo *Download* que trae el archivo a la memoria de n8n y lo vuelve a
subir en cada envío: el archivo viaja dos veces, con riesgo de timeout y de
límite de payload en videos de 16MB. Con un bucket público, n8n solo pasa un
string y los servidores de Meta descargan el archivo. Cero ancho de banda en
n8n, cero credenciales adicionales, y el mismo sistema que ya guarda el
catálogo.

El costo asociado es *egress* de Supabase: Meta descarga el archivo en cada
envío. Un video de 10MB enviado 300 veces al mes son ~3GB. Si ese número
crece, la salida es subir el archivo una vez a Meta (`POST /media`) y
reutilizar su `media_id`, que Meta conserva unos 30 días. **Fuera de alcance
en v1**; la columna `medios.meta_media_id` queda creada para no rediseñar
después.

## Modelo de datos

Migración `supabase/migrations/20260814000001_medios.sql`. El plan de
implementación abre el trabajo en seis migraciones (pgTAP, tablas, vista,
funciones de consulta, funciones de registro, seed) para que cada tarea
cierre con su propio commit.

```sql
-- Catálogo de fotos y videos que el agente puede enviar por WhatsApp.
-- Las tres FK son opcionales y NO son excluyentes: una foto del Salón
-- Cristal montado para 15 años cuelga de la sede y del tipo de evento a la
-- vez, y debe aparecer tanto si el cliente pide fotos del salón como si
-- pide ver montajes de quince. Un medio institucional tiene las tres nulas.
create table medios (
    id uuid primary key default gen_random_uuid(),
    tipo text not null check (tipo in ('imagen', 'video')),
    url text not null,
    caption text,
    descripcion text not null,

    -- En qué momento de la conversación conviene enviarlo, redactado en
    -- términos de la situación y no del archivo ("cuando el cliente duda
    -- entre dos sedes", "cuando pregunta qué incluye la hora loca"). Es lo
    -- que el agente lee para decidir; hace las veces de descripción de
    -- herramienta, pero por fila y editable sin tocar n8n.
    cuando_usar text not null,

    sede_id uuid references sedes(id_sede) on delete cascade,
    tipo_evento_id uuid references tipos_evento(id_evento) on delete cascade,
    servicio_id uuid references servicios_adicionales_upselling(id) on delete cascade,
    orden int not null default 100,
    activo boolean not null default true,
    peso_bytes bigint,
    meta_media_id text,
    created_at timestamptz not null default now(),

    -- Límites duros de WhatsApp Cloud API. Se validan aquí para que un
    -- archivo demasiado pesado falle al cargar el catálogo y no frente a
    -- un cliente.
    constraint medios_peso_whatsapp check (
        peso_bytes is null
        or (tipo = 'imagen' and peso_bytes <= 5242880)
        or (tipo = 'video'  and peso_bytes <= 16777216)
    )
);

-- Qué se le envió a quién: evita repetir material y deja ver qué sede y qué
-- servicio piden más los clientes.
create table envios_medios (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references leads(id) on delete cascade,
    medio_id uuid not null references medios(id) on delete cascade,
    enviado_at timestamptz not null default now()
);

create index idx_medios_sede on medios (sede_id) where activo;
create index idx_medios_tipo_evento on medios (tipo_evento_id) where activo;
create index idx_medios_servicio on medios (servicio_id) where activo;
create index idx_envios_medios_lead on envios_medios (lead_id);
```

`medios` no tiene columna `categoria`. Tenerla obligaría a declarar si una
foto "es de sede" o "es de 15 años" cuando es de las dos, y el cliente puede
llegar a ella por cualquiera de los dos caminos. La categoría vive en el
parámetro de la herramienta — indica qué columna filtrar —, no en la fila.

`envios_medios` no lleva `unique (lead_id, medio_id)`: guarda historial, no
estado. Un reenvío deliberado queda registrado en vez de reventar.

`cuando_usar` es `not null` a propósito: subir un medio sin decir cuándo
usarlo produce material que el agente nunca envía. La restricción convierte
ese olvido en un error visible al cargarlo.

### Almacenamiento

Bucket público `medios` en Supabase Storage, con carpetas `sedes/`,
`eventos/`, `servicios/` e `institucional/`. La URL pública del objeto se
guarda en `medios.url`.

Un bucket público implica que cualquiera con la URL puede ver el archivo. Es
material de marketing destinado a difundirse, así que se acepta; no debe
subirse a este bucket nada que no sea publicable.

## Catálogo autodescriptivo

Es la pieza que hace escalable el sistema. Sin ella, el agente solo sabe qué
material existe si alguien se lo escribió en el prompt.

### Vista de resumen

```sql
-- Una fila por (categoría, referencia, tipo de medio), con el cuándo-usar
-- consolidado. La granularidad es deliberada: coincide exactamente con los
-- parámetros que recibe la herramienta, así que todo lo que el agente lee
-- en el resumen lo puede pedir, y nada de lo que lee es más fino que lo que
-- puede pedir.
create view vista_catalogo_medios as
select 'sede' as categoria, s.nombre_sede as referencia, m.tipo,
       count(*) as cantidad,
       string_agg(distinct m.cuando_usar, '; ') as cuando_usar
from medios m join sedes s on s.id_sede = m.sede_id
where m.activo group by s.nombre_sede, m.tipo
union all
select 'tipo_evento', te.nombre_paquete, m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ')
from medios m join tipos_evento te on te.id_evento = m.tipo_evento_id
where m.activo group by te.nombre_paquete, m.tipo
union all
select 'servicio', sv.servicio, m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ')
from medios m join servicios_adicionales_upselling sv on sv.id = m.servicio_id
where m.activo group by sv.servicio, m.tipo
union all
select 'institucional', 'Institucional', m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ')
from medios m
where m.activo and m.sede_id is null and m.tipo_evento_id is null
  and m.servicio_id is null
group by m.tipo;
```

### Inyección en el system message

Un nodo Postgres llamado **Catálogo de Medios**, entre el IF de bot-activo y
el agente, arma el resumen en un solo campo de texto:

```sql
select coalesce(string_agg(
    format('- %s | %s | %s x%s → %s', categoria, referencia, tipo, cantidad, cuando_usar),
    E'\n' order by categoria, referencia, tipo
), 'Sin material cargado.') as digest
from vista_catalogo_medios
```

El System Message del agente lo referencia por nombre de nodo, no por
`$json` — el agente recibe su input del nodo anterior y `$json` no
contendría el resumen:

```
{{ $('Catálogo de Medios').first().json.digest }}
```

Con 15 sedes, 7 tipos de evento y un puñado de servicios, el resumen ronda
las 30 líneas: costo de tokens despreciable frente a que el agente sepa
exactamente qué tiene y cuándo usarlo.

**Consecuencia operativa:** cargar un video nuevo con su `cuando_usar` basta
para que el agente empiece a ofrecerlo. Desactivarlo (`activo = false`) basta
para que deje de hacerlo. Ninguna de las dos cosas toca n8n.

## Herramienta `enviar_medios`

Octava herramienta del agente. Sub-workflow
(`@n8n/n8n-nodes-langchain.toolWorkflow`), como las otras multi-paso.

**Descripción para el LLM:**
> Envía fotos o videos al cliente por WhatsApp. El catálogo de material
> disponible, con el momento en que conviene usar cada pieza, está en tu
> contexto. `categoria` debe ser exactamente uno de: `sede`, `tipo_evento`,
> `servicio`, `institucional`. `referencia` es el nombre concreto tal como
> aparece en el catálogo (por ejemplo "Salón Cristal", "15 Años", "Pirotecnia
> Show"); déjala vacía solo para `institucional`. `tipo_medio` es `imagen`,
> `video` o `ambos`. Envía máximo un grupo de medios por turno.

**Parámetros del modelo:** `categoria`, `referencia`, `tipo_medio`.

**Parámetro conectado desde el webhook, nunca por `$fromAI()`:** `telefono`
del lead. Igual que en las herramientas #5, #6 y #7 — el modelo lo
fabricaría.

`tipo_medio` existe porque fotos y videos de una misma referencia sirven en
momentos distintos: las fotos del salón cuando el cliente está comparando, el
video cuando duda antes de cerrar. Sin ese parámetro el agente pediría la
referencia completa y el `orden` decidiría por él.

### Consulta

Vive en una función SQL (`fn_medios_para_enviar`), no como texto dentro del
nodo: así se prueba con pgTAP sin n8n de por medio, y el nodo queda en
`select * from fn_medios_para_enviar($1, $2, $3, $4)`. Los valores del modelo
siguen yendo como `$1`…`$4` en `options.queryReplacement`, nunca
interpolados con `{{ }}`.

```sql
select m.id, m.tipo, m.url, m.caption, m.descripcion
from medios m
where m.activo
  and (($4)::text = 'ambos' or m.tipo = ($4)::text)
  and case ($1)::text
        when 'sede'          then m.sede_id        = (select id_sede   from sedes                           where nombre_sede    ilike '%' || $2 || '%' limit 1)
        when 'tipo_evento'   then m.tipo_evento_id = (select id_evento from tipos_evento                    where nombre_paquete ilike '%' || $2 || '%' limit 1)
        when 'servicio'      then m.servicio_id    = (select id        from servicios_adicionales_upselling where servicio      ilike '%' || $2 || '%' limit 1)
        when 'institucional' then (m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null)
      end
  and not exists (
        select 1 from envios_medios e join leads l on l.id = e.lead_id
        where e.medio_id = m.id and l.telefono = $3
      )
order by m.orden, m.created_at
limit 3
```

Si la referencia no existe, la subconsulta devuelve NULL, la comparación
devuelve NULL y no sale ninguna fila: el caso de error se resuelve sin
lógica adicional.

### Consulta de diagnóstico (rama sin resultados)

Cero filas tiene dos causas distintas y el agente debe decir cosas
distintas: que la referencia no existe, o que a ese cliente ya se le envió
todo el material de esa referencia. Confundirlas hace que Brian le diga "no
tengo fotos del Salón Cristal" a alguien a quien acaba de mandarle tres.

```sql
select count(*) as total_existentes
from medios m
where m.activo
  and (($4)::text = 'ambos' or m.tipo = ($4)::text)
  and case ($1)::text
        when 'sede'          then m.sede_id        = (select id_sede   from sedes                           where nombre_sede    ilike '%' || $2 || '%' limit 1)
        when 'tipo_evento'   then m.tipo_evento_id = (select id_evento from tipos_evento                    where nombre_paquete ilike '%' || $2 || '%' limit 1)
        when 'servicio'      then m.servicio_id    = (select id        from servicios_adicionales_upselling where servicio      ilike '%' || $2 || '%' limit 1)
        when 'institucional' then (m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null)
      end
```

- `total_existentes > 0` → *"Ya le enviaste todo el material disponible de
  'X' a este cliente. No repitas; refiérete a lo que ya viste con él."*
- `total_existentes = 0` → devolver las referencias con material de esa
  categoría, tomadas de `vista_catalogo_medios`: *"No hay medios para 'X'.
  Con material disponible: A, B, C."*

Solo el segundo caso es un error de elección del modelo, y es el que se
autocorrige con la lista.

### Pasos del sub-workflow

1. **Postgres** — la consulta de selección.
2. **IF ¿hay resultados?**
   - **No** → consulta de diagnóstico y mensaje correspondiente.
   - **Sí** → continúa.
3. **Loop** sobre los medios → **IF `tipo`** → nodo WhatsApp `image` o nodo
   WhatsApp `video`, con la URL y el `caption`. Ambos con
   `onError: continueRegularOutput`.
4. **Postgres** — `insert into envios_medios (lead_id, medio_id)` para cada
   envío exitoso, resolviendo `lead_id` por teléfono.
5. **Devolver al agente** un resumen en texto de lo enviado, para que pueda
   referirse a ello ("como ves en el video, la hora loca incluye...").

Los medios llegan *antes* del mensaje final del agente: la herramienta corre
durante su turno y el nodo `Enviar WhatsApp` cierra el flujo. En el chat se
lee natural — fotos, luego "¿Qué te parece? ☺️".

### Cómo se logra que el agente elija bien

Es el riesgo principal del enfoque de herramienta única, y se ataca en seis
puntos:

1. **El resumen del catálogo en su contexto**: no adivina qué existe ni
   cuándo usarlo, lo lee. Es la mitigación más fuerte y la que escala sola.
2. **Enum cerrado** de `categoria`, con los cuatro valores literales en la
   descripción del `$fromAI`.
3. **Anclaje a strings que ya están en su contexto**: las referencias del
   resumen y el `nombre_sede` que le devolvió `consultar_precios_sedes`.
4. **`ilike '%…%'`** absorbe la variación restante ("Cristal" encuentra
   "Salón Cristal").
5. **Error que enseña**: sin match, la herramienta devuelve las referencias
   válidas en vez de un vacío. El agente se autocorrige en la siguiente
   iteración del mismo turno y el cliente no ve nada raro.
6. **Tope de 3 medios por llamada y filtro anti-repetición**: acotan el daño
   de una elección equivocada y hacen imposible el spam.

## Cambios en el system prompt

El prompt recibe **reglas generales y permanentes**, nunca la lista de
material ni sus momentos — eso vive en el catálogo. Cuatro añadidos a
`n8n/system-prompt-brian-otero.md`:

1. **El bloque de catálogo inyectado**, con un encabezado que explique qué
   es: *"MATERIAL VISUAL DISPONIBLE — cada línea indica categoría,
   referencia, tipo, cantidad y en qué momento conviene enviarla. Usa
   `enviar_medios` cuando la conversación llegue a ese momento."*
2. **Restricción de nombres** — usar como `referencia` el nombre exacto tal
   como aparece en el catálogo o como lo devolvió `consultar_precios_sedes`.
3. **Restricción de volumen** — máximo un envío de medios por turno; al
   presentar varias sedes, mandar material **de una sola**, la que el cliente
   señale. Mandar las tres son nueve archivos y un cliente molesto.
4. **Restricción de pertinencia** — nunca enviar material que el cliente no
   haya pedido y cuyo momento (según el catálogo) no haya llegado.

Cuando el negocio defina momentos nuevos para videos nuevos, se editan en la
columna `cuando_usar`, no aquí.

## Preparación y carga del contenido

Trabajo manual, previo a que la herramienta sirva de algo:

1. **Comprimir**: video a ≤16MB con H.264 + AAC, clips de 15-40s; imágenes a
   ≤5MB. Meta rechaza lo que exceda esos límites.
2. **Subir** al bucket `medios`, en la carpeta que corresponda.
3. **Catalogar**: la carga inicial va en una migración semilla
   `20260814000005_seed_medios.sql`, siguiendo el precedente del catálogo.
   El contenido posterior se inserta desde Supabase Studio.

**La "gestión" del catálogo en v1 es Supabase Studio.** No se construye panel
de administración propio: son decenas de filas que cambian pocas veces al
mes, Studio ya da altas, bajas y edición, y el campo `cuando_usar` hace que
editar una fila baste para cambiar el comportamiento del agente. Queda dicho
de forma explícita para que la ausencia sea una decisión y no un olvido.

## Alcance

**Dentro:** las dos tablas y la vista, el bucket, el nodo de inyección del
catálogo, la herramienta `enviar_medios`, los cambios de prompt, la carga
inicial de contenido.

**Fuera:** cache de `meta_media_id`, envío tipo álbum o carrusel, generación
dinámica de medios, panel de administración, medios personalizados por
cliente, segmentación del catálogo por perfil de lead.

## Verificación previa a construir

Los nombres exactos de los parámetros de media del nodo
`n8n-nodes-base.whatsApp` (URL vs binario, campo de caption, valores de
`messageType`) se confirman contra la instancia real antes de escribir el
sub-workflow, igual que se verificaron los node types el 2026-08-13. Es el
primer paso del plan de implementación.

## Pruebas

- **SQL de la herramienta**, con lead y catálogo de prueba: referencia
  exacta; referencia parcial (`Cristal`); `institucional`; `tipo_medio` en
  sus tres valores.
- **Las dos ramas sin resultados dan mensajes distintos**: referencia
  inexistente devuelve la lista de referencias válidas; material ya enviado
  por completo devuelve "ya se le envió todo". Confundirlas es el modo de
  falla que hace quedar mal al agente.
- **Vista y resumen**: un medio con sede y tipo de evento a la vez aparece
  bajo ambas referencias; un medio inactivo no aparece; catálogo vacío
  produce "Sin material cargado." y no un campo nulo.
- **Escalabilidad, la prueba que valida el requisito rector**: insertar un
  video nuevo con su `cuando_usar` y verificar que aparece en el resumen y
  que el agente lo envía, **sin haber tocado el prompt ni el workflow**.
- **Constraint de peso**: un insert de video de 20MB debe fallar.
- **Anti-repetición**: dos llamadas seguidas con la misma referencia no
  repiten material.
- **End-to-end en n8n** con un número de prueba: llegada de imagen y de
  video, orden respecto al mensaje de texto, y registro en `envios_medios`.
- **Fallo de Meta**: con una URL inválida, el turno del agente no se cae y no
  se registra el envío.
