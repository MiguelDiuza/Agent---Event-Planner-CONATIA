# Envío de fotos y videos por WhatsApp — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Brian Otero envíe fotos y videos por WhatsApp en el momento adecuado, y que agregar material nuevo sea un `insert` — sin tocar el prompt ni el workflow.

**Architecture:** Un catálogo en Supabase (`medios`) donde cada pieza declara en qué momento de la conversación conviene enviarla. Una vista agrega ese catálogo en un resumen de texto que un nodo Postgres inyecta al system message del agente en cada turno, así que el agente siempre sabe qué tiene disponible. Una única herramienta `enviar_medios(categoria, referencia, tipo_medio)`, implementada como sub-workflow, consulta funciones SQL, envía por WhatsApp usando la URL pública del bucket, y registra el envío para no repetir material.

**Tech Stack:** Supabase (Postgres 15 + Storage), pgTAP para las pruebas de base de datos, n8n (nodos `postgres`, `postgresTool`, `toolWorkflow`, `whatsApp`), Gemini vía `lmChatGoogleGemini`.

**Spec:** [`docs/superpowers/specs/2026-08-14-envio-medios-whatsapp-design.md`](../specs/2026-08-14-envio-medios-whatsapp-design.md)

## Global Constraints

- **Nunca interpolar `$fromAI()` dentro de SQL.** Los valores del modelo van siempre como `$1`, `$2`… en `query` + `options.queryReplacement`. Interpolar con `{{ }}` es inyección SQL.
- **El teléfono del lead nunca va por `$fromAI()`.** Se conecta desde el webhook, igual que el `sessionKey` de la memoria.
- **Límites duros de WhatsApp Cloud API:** imagen ≤ 5242880 bytes (5MB), video ≤ 16777216 bytes (16MB), video en H.264 + AAC.
- **Máximo 3 medios por llamada a la herramienta.**
- **Idioma:** documentación, comentarios SQL y descripciones para el LLM en español. **Mensajes de commit en inglés**, sujeto en imperativo, cuerpo explicando el porqué, y trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (convención observada en el repo).
- **Migraciones:** nunca editar una migración ya aplicada; agregar una nueva.

## Refinamientos respecto al spec

Dos ajustes de implementación, ambos al servicio de lo mismo — poder probar la lógica sin n8n de por medio:

1. **Las consultas de la herramienta viven en funciones SQL**, no como texto dentro de los nodos de n8n. El nodo pasa a ser `select * from fn_medios_para_enviar($1,$2,$3,$4)`. Se prueban con pgTAP, siguen igual de parametrizadas, y corregir un filtro es una migración en vez de editar un nodo a mano.
2. **La numeración de migraciones** se abre en seis archivos (pgTAP, tablas, vista, funciones de consulta, funciones de registro, seed) en vez de dos, para que cada tarea cierre con su propia migración y su propio commit.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260814000000_pgtap.sql` | Habilita la extensión pgTAP (arnés de pruebas) |
| `supabase/migrations/20260814000001_medios.sql` | Tablas `medios` y `envios_medios`, índices, bucket de Storage |
| `supabase/migrations/20260814000002_vista_catalogo.sql` | Vista `vista_catalogo_medios` |
| `supabase/migrations/20260814000003_funciones_medios.sql` | Funciones de selección y diagnóstico |
| `supabase/migrations/20260814000004_funciones_registro.sql` | Funciones de registro de envío y de resumen del catálogo |
| `supabase/migrations/20260814000009_seed_medios.sql` | Carga inicial del contenido real |
| `supabase/tests/medios_esquema_test.sql` | Pruebas de tablas, constraints y bucket |
| `supabase/tests/medios_catalogo_test.sql` | Pruebas de la vista de resumen |
| `supabase/tests/medios_funciones_test.sql` | Pruebas de selección, diagnóstico, registro y digest |
| `n8n/workflow-enviar-medios.json` | Sub-workflow de la herramienta (exportado de n8n) |
| `n8n/workflow-brian-otero.json` | *(modificar)* nodo de catálogo + herramienta conectada |
| `n8n/system-prompt-brian-otero.md` | *(modificar)* bloque de material visual y sus reglas |
| `n8n/herramientas.md` | *(modificar)* documentar la herramienta #8 |
| `README.md` | *(modificar)* tablas nuevas y bucket |

---

### Task 1: Tablas, índices y bucket de Storage

**Files:**
- Create: `supabase/migrations/20260814000000_pgtap.sql`
- Create: `supabase/migrations/20260814000001_medios.sql`
- Test: `supabase/tests/medios_esquema_test.sql`

**Interfaces:**
- Consumes: tablas existentes `sedes`, `tipos_evento`, `servicios_adicionales_upselling`, `leads`.
- Produces: tablas `medios` (columnas `id, tipo, url, caption, descripcion, cuando_usar, sede_id, tipo_evento_id, servicio_id, orden, activo, peso_bytes, meta_media_id, created_at`) y `envios_medios` (`id, lead_id, medio_id, enviado_at`); bucket público `medios`.

- [ ] **Step 1: Crear la rama de trabajo**

```bash
git checkout -b feature/envio-medios
```

- [ ] **Step 2: Habilitar pgTAP**

Crear `supabase/migrations/20260814000000_pgtap.sql`:

```sql
-- pgTAP: arnés de pruebas de base de datos. Lo usa `supabase test db` para
-- correr los archivos de supabase/tests/. Se instala en el esquema
-- extensions para no ensuciar public.
create extension if not exists pgtap with schema extensions;
```

- [ ] **Step 3: Escribir la prueba que falla**

Crear `supabase/tests/medios_esquema_test.sql`:

```sql
-- Esquema del catálogo de medios.
-- Correr con: supabase test db
begin;
select plan(9);

select has_table('public', 'medios', 'existe la tabla medios');
select has_table('public', 'envios_medios', 'existe la tabla envios_medios');

select col_not_null('public', 'medios', 'cuando_usar',
    'cuando_usar es obligatorio: un medio sin momento de uso nunca se enviaría');
select col_is_null('public', 'medios', 'sede_id',
    'sede_id es opcional: un medio institucional no cuelga de ninguna sede');

insert into sedes (id_sede, nombre_sede)
values ('11111111-1111-1111-1111-111111111111', 'Salón Prueba Alfa');
insert into tipos_evento (id_evento, nombre_paquete, inclusiones_base, obsequios, excepciones)
values ('11111111-1111-1111-1111-111111111112', 'Prueba Quince', '-', '-', '-');

select lives_ok($$
    insert into medios (tipo, url, descripcion, cuando_usar, sede_id, tipo_evento_id, peso_bytes)
    values ('imagen', 'https://ejemplo.test/a.jpg', 'Montaje del salón',
            'cuando el cliente pregunta cómo se ve el salón montado',
            '11111111-1111-1111-1111-111111111111',
            '11111111-1111-1111-1111-111111111112', 400000)
$$, 'una foto puede colgar de una sede y de un tipo de evento a la vez');

select throws_ok($$
    insert into medios (tipo, url, descripcion, cuando_usar, peso_bytes)
    values ('video', 'https://ejemplo.test/b.mp4', 'Promo', 'al cerrar', 20971520)
$$, '23514', null, 'un video de 20MB excede el límite de WhatsApp y se rechaza');

select throws_ok($$
    insert into medios (tipo, url, descripcion, cuando_usar, peso_bytes)
    values ('imagen', 'https://ejemplo.test/c.jpg', 'Fachada', 'al abrir', 6291456)
$$, '23514', null, 'una imagen de 6MB excede el límite de WhatsApp y se rechaza');

select throws_ok($$
    insert into medios (tipo, url, descripcion, cuando_usar)
    values ('gif', 'https://ejemplo.test/d.gif', 'X', 'nunca')
$$, '23514', null, 'solo se aceptan los tipos imagen y video');

select results_eq($$
    select public from storage.buckets where id = 'medios'
$$, $$ values (true) $$, 'el bucket medios existe y es público');

select * from finish();
rollback;
```

- [ ] **Step 4: Correr la prueba y verificar que falla**

```bash
supabase db reset
supabase test db
```

Esperado: falla con `relation "medios" does not exist`.

> Si en cambio falla con `function plan(integer) does not exist`, el problema es el arnés, no el código: pgTAP no quedó instalado. Revisar que la migración del Step 2 se haya aplicado (`supabase db reset` la aplica) antes de seguir.

- [ ] **Step 5: Escribir la migración**

Crear `supabase/migrations/20260814000001_medios.sql`:

```sql
-- Catálogo de fotos y videos que el agente puede enviar por WhatsApp.
-- Ver docs/superpowers/specs/2026-08-14-envio-medios-whatsapp-design.md
--
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
    -- entre dos sedes"). Es lo que el agente lee para decidir: hace las
    -- veces de descripción de herramienta, pero por fila y editable sin
    -- tocar n8n. Obligatorio, porque un medio sin momento de uso es
    -- material que el agente nunca enviaría.
    cuando_usar text not null,

    sede_id uuid references sedes(id_sede) on delete cascade,
    tipo_evento_id uuid references tipos_evento(id_evento) on delete cascade,
    servicio_id uuid references servicios_adicionales_upselling(id) on delete cascade,
    orden int not null default 100,
    activo boolean not null default true,
    peso_bytes bigint,

    -- Reservado para cachear el media ID de Meta y ahorrar egress si el
    -- volumen crece. Sin uso en v1.
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

-- Qué se le envió a quién. Guarda historial, no estado: no lleva unique
-- (lead_id, medio_id) para que un reenvío deliberado quede registrado en
-- vez de reventar.
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

-- Bucket público de Storage. Público porque Meta descarga el archivo desde
-- sus servidores al enviarlo: no hay forma de autenticar esa descarga. Es
-- material de marketing destinado a difundirse; no subir aquí nada que no
-- sea publicable.
insert into storage.buckets (id, name, public)
values ('medios', 'medios', true)
on conflict (id) do nothing;
```

- [ ] **Step 6: Correr la prueba y verificar que pasa**

```bash
supabase db reset
supabase test db
```

Esperado: `medios_esquema_test.sql .. ok` y todas las aserciones en verde.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260814000000_pgtap.sql supabase/migrations/20260814000001_medios.sql supabase/tests/medios_esquema_test.sql
git commit -m "$(cat <<'EOF'
Add media catalog tables and public storage bucket

Each row declares when it should be sent (cuando_usar), so adding a video
later is an insert rather than a prompt edit. The three association columns
are deliberately non-exclusive: a photo of a venue dressed for a quinceañera
belongs to both the venue and the event type, and a client can ask for it
either way.

The size constraint encodes WhatsApp Cloud API's hard limits so an oversized
file fails when the catalog is loaded instead of in front of a client.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Vista de resumen del catálogo

**Files:**
- Create: `supabase/migrations/20260814000002_vista_catalogo.sql`
- Test: `supabase/tests/medios_catalogo_test.sql`

**Interfaces:**
- Consumes: `medios`, `sedes`, `tipos_evento`, `servicios_adicionales_upselling` (Task 1).
- Produces: vista `vista_catalogo_medios` con columnas `categoria text, referencia text, tipo text, cantidad bigint, cuando_usar text`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `supabase/tests/medios_catalogo_test.sql`:

```sql
-- Vista de resumen del catálogo: es lo que el agente lee para saber qué
-- material existe y cuándo usarlo.
-- Correr con: supabase test db
begin;
select plan(4);

insert into sedes (id_sede, nombre_sede)
values ('11111111-1111-1111-1111-111111111111', 'Salón Prueba Alfa');
insert into tipos_evento (id_evento, nombre_paquete, inclusiones_base, obsequios, excepciones)
values ('11111111-1111-1111-1111-111111111112', 'Prueba Quince', '-', '-', '-');

-- Foto que cuelga de la sede Y del tipo de evento.
insert into medios (id, tipo, url, descripcion, cuando_usar, sede_id, tipo_evento_id)
values ('11111111-1111-1111-1111-111111111113', 'imagen', 'https://ejemplo.test/a.jpg',
        'Montaje de quince', 'cuando el cliente compara sedes',
        '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111112');

-- Video de la misma sede: mismo lugar, otro momento de uso.
insert into medios (id, tipo, url, descripcion, cuando_usar, sede_id)
values ('11111111-1111-1111-1111-111111111114', 'video', 'https://ejemplo.test/b.mp4',
        'Recorrido del salón', 'cuando el cliente duda antes de cerrar',
        '11111111-1111-1111-1111-111111111111');

-- Medio dado de baja.
insert into medios (id, tipo, url, descripcion, cuando_usar, sede_id, activo)
values ('11111111-1111-1111-1111-111111111115', 'imagen', 'https://ejemplo.test/c.jpg',
        'Montaje viejo', 'ya no se usa',
        '11111111-1111-1111-1111-111111111111', false);

select results_eq($$
    select cantidad::int from vista_catalogo_medios
    where categoria = 'sede' and referencia = 'Salón Prueba Alfa' and tipo = 'imagen'
$$, $$ values (1) $$, 'el medio inactivo no aparece en el resumen');

select results_eq($$
    select cantidad::int from vista_catalogo_medios
    where categoria = 'tipo_evento' and referencia = 'Prueba Quince' and tipo = 'imagen'
$$, $$ values (1) $$, 'la misma foto aparece también bajo su tipo de evento');

select results_eq($$
    select cuando_usar from vista_catalogo_medios
    where categoria = 'sede' and referencia = 'Salón Prueba Alfa' and tipo = 'video'
$$, $$ values ('cuando el cliente duda antes de cerrar') $$,
   'fotos y videos se resumen por separado, cada uno con su momento de uso');

select ok(
    (select count(*) from vista_catalogo_medios where categoria = 'institucional') = 0,
    'sin medios institucionales cargados, la categoría no aparece en el resumen'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

```bash
supabase test db
```

Esperado: falla con `relation "vista_catalogo_medios" does not exist`.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20260814000002_vista_catalogo.sql`:

```sql
-- Resumen del catálogo que se inyecta al system message del agente.
--
-- Una fila por (categoría, referencia, tipo de medio). La granularidad es
-- deliberada: coincide exactamente con los parámetros que recibe la
-- herramienta enviar_medios, así que todo lo que el agente lee en el
-- resumen lo puede pedir, y nada de lo que lee es más fino que lo que
-- puede pedir.
--
-- Es un UNION ALL y no un CASE sobre una sola columna porque un medio
-- puede colgar de una sede y de un tipo de evento a la vez, y debe
-- aparecer bajo ambas referencias.
create view vista_catalogo_medios as
select 'sede' as categoria, s.nombre_sede as referencia, m.tipo,
       count(*) as cantidad,
       string_agg(distinct m.cuando_usar, '; ') as cuando_usar
from medios m
join sedes s on s.id_sede = m.sede_id
where m.activo
group by s.nombre_sede, m.tipo
union all
select 'tipo_evento', te.nombre_paquete, m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ')
from medios m
join tipos_evento te on te.id_evento = m.tipo_evento_id
where m.activo
group by te.nombre_paquete, m.tipo
union all
select 'servicio', sv.servicio, m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ')
from medios m
join servicios_adicionales_upselling sv on sv.id = m.servicio_id
where m.activo
group by sv.servicio, m.tipo
union all
select 'institucional', 'Institucional', m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ')
from medios m
where m.activo
  and m.sede_id is null
  and m.tipo_evento_id is null
  and m.servicio_id is null
group by m.tipo;
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

```bash
supabase db reset
supabase test db
```

Esperado: los dos archivos de prueba en verde.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814000002_vista_catalogo.sql supabase/tests/medios_catalogo_test.sql
git commit -m "$(cat <<'EOF'
Add catalog summary view for system message injection

The view is what makes adding media a data operation: the agent reads this
summary each turn instead of relying on moments hardcoded in its prompt.

Grouping is by (category, reference, media type) to match the tool's
parameters exactly, so everything the agent can read it can also request.
It is a UNION ALL rather than a CASE because one row can belong to both a
venue and an event type and must surface under both.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Funciones de selección y diagnóstico

Es el corazón de la herramienta: qué se envía, y qué se le dice al agente cuando no hay nada que enviar.

**Files:**
- Create: `supabase/migrations/20260814000003_funciones_medios.sql`
- Test: `supabase/tests/medios_funciones_test.sql`

**Interfaces:**
- Consumes: `medios`, `envios_medios`, `leads`, `vista_catalogo_medios` (Tasks 1-2).
- Produces:
  - `fn_medios_para_enviar(p_categoria text, p_referencia text, p_telefono text, p_tipo_medio text) returns table (id uuid, tipo text, url text, caption text, descripcion text)`
  - `fn_medios_diagnostico(p_categoria text, p_referencia text, p_tipo_medio text) returns table (total_existentes bigint, referencias_disponibles text)`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `supabase/tests/medios_funciones_test.sql`:

```sql
-- Funciones que consume el sub-workflow enviar_medios.
-- Correr con: supabase test db
begin;
select plan(8);

insert into sedes (id_sede, nombre_sede)
values ('11111111-1111-1111-1111-111111111111', 'Salón Prueba Alfa'),
       ('11111111-1111-1111-1111-111111111116', 'Salón Prueba Beta');
insert into leads (id, telefono)
values ('11111111-1111-1111-1111-111111111117', '573001112233');

insert into medios (id, tipo, url, descripcion, cuando_usar, sede_id, orden)
values ('11111111-1111-1111-1111-111111111113', 'imagen', 'https://ejemplo.test/a.jpg',
        'Fachada', 'cuando el cliente compara sedes',
        '11111111-1111-1111-1111-111111111111', 1),
       ('11111111-1111-1111-1111-111111111114', 'video', 'https://ejemplo.test/b.mp4',
        'Recorrido', 'cuando el cliente duda antes de cerrar',
        '11111111-1111-1111-1111-111111111111', 2);

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (2) $$, 'devuelve todo el material de la sede');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (2) $$, 'una referencia parcial encuentra la sede completa');

select results_eq($$
    select tipo from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'video')
$$, $$ values ('video') $$, 'tipo_medio filtra: fotos y videos sirven en momentos distintos');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Sede Inexistente', '573001112233', 'ambos')
$$, $$ values (0) $$, 'una referencia que no existe devuelve cero filas, sin error');

-- Anti-repetición: se marca la foto como ya enviada a este lead.
insert into envios_medios (lead_id, medio_id)
values ('11111111-1111-1111-1111-111111111117', '11111111-1111-1111-1111-111111111113');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (1) $$, 'no reenvía material que ese lead ya recibió');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573009998877', 'ambos')
$$, $$ values (2) $$, 'el filtro de repetición es por lead, no global');

-- Las dos ramas sin resultados deben decir cosas distintas: confundirlas
-- hace que el agente diga "no tengo fotos" a quien acaba de recibirlas.
select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('sede', 'Salón Prueba Alfa', 'imagen')
$$, $$ values (1) $$, 'diagnóstico: la referencia existe, el material ya se envió');

select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('sede', 'Sede Inexistente', 'ambos')
$$, $$ values (0) $$, 'diagnóstico: la referencia no existe, el agente eligió mal');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

```bash
supabase test db
```

Esperado: falla con `function fn_medios_para_enviar(...) does not exist`.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20260814000003_funciones_medios.sql`:

```sql
-- Funciones que consume el sub-workflow enviar_medios en n8n.
--
-- La lógica vive aquí y no como texto dentro de los nodos para poder
-- probarla con pgTAP sin n8n de por medio. Los nodos quedan en
-- `select * from fn_...($1, $2, ...)`, con los valores del modelo siempre
-- como parámetros — nunca interpolados.

-- Qué enviarle a este cliente ahora: material activo de la referencia
-- pedida, del tipo pedido, que este lead todavía no haya recibido.
-- El tope de 3 acota el daño de una elección equivocada del modelo y hace
-- imposible el spam.
create or replace function fn_medios_para_enviar(
    p_categoria  text,
    p_referencia text,
    p_telefono   text,
    p_tipo_medio text default 'ambos'
)
returns table (id uuid, tipo text, url text, caption text, descripcion text)
language sql
stable
as $$
    select m.id, m.tipo, m.url, m.caption, m.descripcion
    from medios m
    where m.activo
      and (p_tipo_medio = 'ambos' or m.tipo = p_tipo_medio)
      -- Si la referencia no existe, la subconsulta da NULL, la comparación
      -- da NULL y no sale ninguna fila: el caso de error se resuelve sin
      -- lógica adicional.
      and case p_categoria
            when 'sede' then m.sede_id = (
                select id_sede from sedes
                where nombre_sede ilike '%' || p_referencia || '%' limit 1)
            when 'tipo_evento' then m.tipo_evento_id = (
                select id_evento from tipos_evento
                where nombre_paquete ilike '%' || p_referencia || '%' limit 1)
            when 'servicio' then m.servicio_id = (
                select id from servicios_adicionales_upselling
                where servicio ilike '%' || p_referencia || '%' limit 1)
            when 'institucional' then (
                m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null)
          end
      and not exists (
            select 1 from envios_medios e
            join leads l on l.id = e.lead_id
            where e.medio_id = m.id and l.telefono = p_telefono
      )
    order by m.orden, m.created_at
    limit 3;
$$;

-- Por qué no salió nada. Cero filas tiene dos causas y el agente debe
-- decir cosas distintas: que la referencia no existe (eligió mal, y la
-- lista de referencias disponibles le permite autocorregirse), o que a ese
-- cliente ya se le envió todo (no debe repetir, debe referirse a lo que ya
-- vio con él).
create or replace function fn_medios_diagnostico(
    p_categoria  text,
    p_referencia text,
    p_tipo_medio text default 'ambos'
)
returns table (total_existentes bigint, referencias_disponibles text)
language sql
stable
as $$
    select
        (select count(*)
         from medios m
         where m.activo
           and (p_tipo_medio = 'ambos' or m.tipo = p_tipo_medio)
           and case p_categoria
                 when 'sede' then m.sede_id = (
                     select id_sede from sedes
                     where nombre_sede ilike '%' || p_referencia || '%' limit 1)
                 when 'tipo_evento' then m.tipo_evento_id = (
                     select id_evento from tipos_evento
                     where nombre_paquete ilike '%' || p_referencia || '%' limit 1)
                 when 'servicio' then m.servicio_id = (
                     select id from servicios_adicionales_upselling
                     where servicio ilike '%' || p_referencia || '%' limit 1)
                 when 'institucional' then (
                     m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null)
               end),
        (select string_agg(distinct v.referencia, ', ' order by v.referencia)
         from vista_catalogo_medios v
         where v.categoria = p_categoria);
$$;
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

```bash
supabase db reset
supabase test db
```

Esperado: los tres archivos de prueba en verde.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814000003_funciones_medios.sql supabase/tests/medios_funciones_test.sql
git commit -m "$(cat <<'EOF'
Add media selection and diagnostic functions

Keeping the logic in SQL functions instead of node text lets pgTAP exercise
it without n8n in the way, and leaves the nodes as a single parameterized
call.

The diagnostic function exists because zero rows has two causes that need
different answers: a reference the model got wrong, where returning the
valid references lets it self-correct within the same turn, versus material
this lead already received, where the agent must not repeat itself.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Registro de envíos y resumen para el prompt

**Files:**
- Create: `supabase/migrations/20260814000004_funciones_registro.sql`
- Modify: `supabase/tests/medios_funciones_test.sql`

> Estas dos funciones van en una migración nueva y no dentro de la de la Task 3: una migración no se edita una vez aplicada.

**Interfaces:**
- Consumes: `envios_medios`, `leads`, `vista_catalogo_medios`.
- Produces:
  - `fn_registrar_envio(p_medio_id uuid, p_telefono text) returns uuid`
  - `fn_catalogo_digest() returns text`

- [ ] **Step 1: Agregar las pruebas que fallan**

En `supabase/tests/medios_funciones_test.sql`, cambiar `select plan(8);` por `select plan(11);` y agregar antes de `select * from finish();`:

```sql
select results_eq($$
    select count(*)::int from (
        select fn_registrar_envio('11111111-1111-1111-1111-111111111114', '573001112233')
    ) t
$$, $$ values (1) $$, 'registrar un envío devuelve el id de la fila creada');

select results_eq($$
    select count(*)::int from envios_medios e
    join leads l on l.id = e.lead_id
    where l.telefono = '573001112233'
$$, $$ values (2) $$, 'el envío queda asociado al lead por su teléfono');

select matches(
    fn_catalogo_digest(),
    'Salón Prueba Alfa',
    'el resumen del catálogo menciona la referencia y llega al system message'
);
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

```bash
supabase test db
```

Esperado: falla con `function fn_registrar_envio(...) does not exist`.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20260814000004_funciones_registro.sql`:

```sql
-- Registro de envíos y resumen del catálogo.

-- Deja constancia de que un medio ya se le envió a un cliente. Resuelve el
-- lead por teléfono porque ese es el identificador que llega del webhook;
-- el modelo nunca lo provee.
create or replace function fn_registrar_envio(
    p_medio_id uuid,
    p_telefono text
)
returns uuid
language sql
volatile
as $$
    insert into envios_medios (lead_id, medio_id)
    select l.id, p_medio_id
    from leads l
    where l.telefono = p_telefono
    returning id;
$$;

-- Resumen que el nodo "Catálogo de Medios" inyecta al system message en
-- cada turno. Con 15 sedes, 7 tipos de evento y un puñado de servicios son
-- ~30 líneas: costo de tokens despreciable frente a que el agente sepa
-- exactamente qué tiene y cuándo usarlo.
create or replace function fn_catalogo_digest()
returns text
language sql
stable
as $$
    select coalesce(
        string_agg(
            format('- %s | %s | %s x%s → %s',
                   categoria, referencia, tipo, cantidad, cuando_usar),
            E'\n' order by categoria, referencia, tipo
        ),
        'Sin material cargado.'
    )
    from vista_catalogo_medios;
$$;
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

```bash
supabase db reset
supabase test db
```

Esperado: 11 aserciones en verde en `medios_funciones_test.sql`.

- [ ] **Step 5: Verificar el caso de catálogo vacío**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select fn_catalogo_digest();"
```

Esperado: `Sin material cargado.` — texto, no NULL. Un NULL rompería la expresión del system message.

> Si `psql` no está instalado, correr la misma consulta desde Studio (http://127.0.0.1:54323 → SQL Editor).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260814000005_funciones_registro.sql supabase/tests/medios_funciones_test.sql
git commit -m "$(cat <<'EOF'
Add send logging and catalog digest functions

The digest is the piece that keeps the design scalable: the agent learns
what material exists from the database each turn, so adding a video is an
insert rather than a prompt edit and a redeploy.

It coalesces to a literal string because a NULL would break the system
message expression on an empty catalog.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Preparar, subir y catalogar el contenido real

Trabajo manual sobre el material del negocio. Sin esto, la herramienta funciona pero no tiene nada que enviar.

**Files:**
- Create: `supabase/migrations/20260814000009_seed_medios.sql`
- Modify: `README.md`

**Interfaces:**
- Consumes: `medios`, bucket `medios`.
- Produces: filas de catálogo con URLs públicas reales.

- [ ] **Step 1: Comprimir los videos al límite de WhatsApp**

Para cada video, clip de 15-40s, H.264 + AAC, bajo 16MB:

```bash
ffmpeg -i entrada.mp4 -t 40 -vf "scale=-2:720" \
  -c:v libx264 -profile:v main -crf 28 -preset slow \
  -c:a aac -b:a 96k -movflags +faststart salida.mp4
```

Verificar el peso: debe dar menos de 16777216 bytes.

```bash
ls -l salida.mp4
```

Si se pasa, subir `-crf` a 30-32 y repetir. `+faststart` importa: mueve el índice al inicio para que reproduzca sin descargar todo.

- [ ] **Step 2: Comprimir las imágenes**

```bash
ffmpeg -i entrada.jpg -vf "scale='min(1600,iw)':-2" -q:v 4 salida.jpg
```

Verificar que cada una quede bajo 5242880 bytes.

- [ ] **Step 3: Subir al bucket**

Studio (http://127.0.0.1:54323) → Storage → bucket `medios` → crear las carpetas `sedes/`, `eventos/`, `servicios/`, `institucional/` y subir cada archivo a la que corresponda.

La URL pública local de un objeto queda así:

```
http://127.0.0.1:54321/storage/v1/object/public/medios/sedes/salon-cristal-01.jpg
```

- [ ] **Step 4: Escribir el seed**

Crear `supabase/migrations/20260814000009_seed_medios.sql`. Una fila por archivo; `cuando_usar` se redacta en términos de la conversación, no del archivo — es lo que el agente lee para decidir:

```sql
-- Carga inicial del catálogo de medios.
--
-- cuando_usar describe el MOMENTO de la conversación, no el contenido del
-- archivo: es lo que el agente lee para decidir cuándo enviarlo.
--
-- Las URLs apuntan al Supabase local. Al migrar a cloud, después de
-- `supabase db push` y de resubir los archivos al bucket del proyecto:
--   update medios set url = replace(url,
--       'http://127.0.0.1:54321', 'https://<proyecto>.supabase.co');

insert into medios (tipo, url, descripcion, caption, cuando_usar, sede_id, orden, peso_bytes)
select 'imagen',
       'http://127.0.0.1:54321/storage/v1/object/public/medios/sedes/salon-cristal-01.jpg',
       'Salón Cristal con montaje de gala y pista de cristal iluminada',
       'Así se ve el Salón Cristal montado ✨',
       'cuando el cliente pregunta cómo se ve el salón o está comparando sedes',
       id_sede, 1, 412000
from sedes where nombre_sede = 'Salón Cristal';

insert into medios (tipo, url, descripcion, caption, cuando_usar, servicio_id, orden, peso_bytes)
select 'video',
       'http://127.0.0.1:54321/storage/v1/object/public/medios/servicios/pirotecnia-show.mp4',
       'Show de pirotecnia fría con hora loca y bailarines',
       'Este es el Pirotecnia Show 🎆',
       'cuando estés ofreciendo el Pirotecnia Show, antes de decir el precio',
       id, 1, 12800000
from servicios_adicionales_upselling where servicio ilike '%pirotecnia%';
```

> Los `select ... from sedes where nombre_sede = ...` resuelven la FK por nombre en vez de pegar un uuid: el seed sigue siendo válido después de un `db reset`, que regenera los uuid.
>
> Repetir el patrón para cada archivo subido. Los pesos deben ser los reales (`ls -l`), no aproximados: son lo que la constraint valida.

- [ ] **Step 5: Aplicar y verificar**

```bash
supabase migration up
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select fn_catalogo_digest();"
```

> **`supabase migration up`, no `supabase db reset`.** Desde el Step 3 hay
> archivos subidos, y los metadatos del Storage viven en la tabla
> `storage.objects` de la misma base: un `db reset` la vacía y **todas las
> URLs del catálogo pasan a devolver 404** aunque los archivos sigan en el
> volumen de Docker. A partir de esta tarea, un `db reset` obliga a resubir
> el contenido al bucket.

Esperado: una línea por cada combinación cargada, con su `cuando_usar`. Si alguna fila falta, el `select ... from` no encontró la sede o el servicio: revisar que el nombre coincida con el seed del catálogo.

- [ ] **Step 6: Verificar que las URLs sirven**

```bash
curl -sI "http://127.0.0.1:54321/storage/v1/object/public/medios/servicios/pirotecnia-show.mp4" | head -3
```

Esperado: `HTTP/2 200` (o `HTTP/1.1 200 OK`) y `content-type: video/mp4`. Un 400/404 aquí significa que Meta tampoco podrá descargarlo.

- [ ] **Step 7: Documentar en el README**

En la tabla "Estructura de datos" de `README.md`, agregar:

```markdown
| `medios` | Fotos y videos del catálogo, cada uno con el momento de la conversación en que conviene enviarlo |
| `envios_medios` | Qué material se le envió a cada lead, para no repetirlo |
```

Y una sección nueva después de "Estructura de datos":

```markdown
## Material visual

Los archivos viven en el bucket público `medios` de Supabase Storage
(`sedes/`, `eventos/`, `servicios/`, `institucional/`) y se catalogan en la
tabla `medios`. Cada fila declara en `cuando_usar` en qué momento de la
conversación conviene enviarla: el agente lee ese resumen en cada turno, así
que **agregar un video nuevo es un insert — no requiere tocar el prompt ni
el workflow**.

Límites de WhatsApp, validados por la base de datos: imagen ≤ 5MB,
video ≤ 16MB en H.264 + AAC.
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260814000004_seed_medios.sql README.md
git commit -m "$(cat <<'EOF'
Seed the media catalog with the first batch of content

Foreign keys resolve by name rather than hardcoded uuids so the seed
survives a db reset, which regenerates them.

URLs point at the local Supabase; the migration header records the one-line
update needed when the project moves to cloud.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Verificar los parámetros de media del nodo WhatsApp

El nodo `n8n-nodes-base.whatsApp` es la única pieza cuyos nombres de campo no se pueden deducir del repo. Se confirman contra la instancia real antes de construir, igual que se verificaron los node types el 2026-08-13.

**Files:**
- Modify: `n8n/herramientas.md`

**Interfaces:**
- Produces: los nombres exactos de los campos de envío de imagen y video, que consume la Task 7.

- [ ] **Step 1: Levantar n8n**

```bash
n8n start
```

Abrir http://localhost:5678.

- [ ] **Step 2: Inspeccionar el nodo**

Crear un workflow en blanco → agregar un nodo **WhatsApp Business Cloud** → *Resource*: Message, *Operation*: Send, *Message Type*: **Image**. Anotar los campos que aparecen (cómo se indica la URL, si hay campo de caption, cómo se llama el selector entre enlace e ID de media).

Repetir con *Message Type*: **Video**.

- [ ] **Step 3: Capturar el JSON real**

Seleccionar el nodo → `Ctrl+C` → pegar en un archivo temporal. Ese JSON tiene los nombres de parámetro exactos, que son la autoridad para la Task 7.

- [ ] **Step 4: Registrar los hallazgos**

En `n8n/herramientas.md`, en la tabla "Nodos n8n a usar", agregar la fila:

```markdown
| Envío de fotos y videos | `n8n-nodes-base.whatsApp` | operación `send`, messageType `image` / `video` |
```

Y debajo de la tabla, una nota con los nombres de campo exactos observados, para que quien construya el sub-workflow no tenga que volver a la UI.

- [ ] **Step 5: Commit**

```bash
git add n8n/herramientas.md
git commit -m "$(cat <<'EOF'
Record verified WhatsApp media parameters

Field names for image and video sending were read off the live node rather
than assumed, the same way the node types were verified before.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Sub-workflow `enviar_medios`

Se construye en la UI de n8n y se exporta al repo. Escribir el JSON a mano obligaría a adivinar los campos de media; la UI los pone correctos por construcción.

**Files:**
- Create: `n8n/workflow-enviar-medios.json`

**Interfaces:**
- Consumes: `fn_medios_para_enviar`, `fn_medios_diagnostico`, `fn_registrar_envio` (Tasks 3-4); campos de media verificados (Task 6).
- Produces: workflow con Execute Workflow Trigger que recibe `categoria`, `referencia`, `tipo_medio`, `telefono` y devuelve un campo `resultado` (texto) para el agente.

- [ ] **Step 1: Crear el workflow y su trigger**

Nuevo workflow llamado `enviar_medios`. Nodo **Execute Workflow Trigger** con cuatro entradas de workflow: `categoria`, `referencia`, `tipo_medio`, `telefono`.

- [ ] **Step 2: Nodo Postgres "Seleccionar Medios"**

Operación *Execute Query*, credencial Postgres de Supabase.

```sql
select * from fn_medios_para_enviar($1, $2, $3, $4)
```

*Options → Query Parameters*:

```
={{ $json.categoria }},{{ $json.referencia }},{{ $json.telefono }},{{ $json.tipo_medio }}
```

> El orden importa: la función recibe `(categoria, referencia, telefono, tipo_medio)`.

En *Settings* de este nodo, activar **Always Output Data**. Sin eso, cuando no
hay medios que enviar el nodo no emite ítems y n8n salta el resto del
sub-workflow, así que la rama de diagnóstico del Step 4 nunca se ejecutaría y
el agente se quedaría sin respuesta.

> ⚠️ **`tipo_medio` nunca puede llegar como cadena vacía.** Las funciones ahora
> validan ese parámetro y lanzan excepción con un valor inválido — es lo que
> convierte un error de orden de parámetros en un fallo ruidoso durante la
> construcción en vez de una mentira silenciosa a un cliente. Pero n8n suele
> materializar un parámetro de herramienta sin rellenar como `''`, y el
> `default 'ambos'` solo aplica cuando el argumento se **omite**, cosa que una
> llamada posicional de cuatro placeholders nunca hace. Envuelve el valor:
> `{{ $json.tipo_medio || 'ambos' }}`.

- [ ] **Step 3: Nodo IF "¿Hay medios?"**

Condición: *String* → `{{ $json.id }}` → **is not empty**.

> **Gotcha de n8n que hay que resolver aquí:** si un nodo no devuelve ítems,
> n8n **salta todos los nodos siguientes** — el IF ni siquiera se evalúa y la
> rama de diagnóstico nunca correría. Por eso el nodo "Seleccionar Medios"
> lleva *Always Output Data* activado (Step 2): emite un ítem vacío cuando no
> hay filas, y ese ítem vacío es el que toma la rama falsa.

- [ ] **Step 4: Rama falsa — nodo Postgres "Diagnóstico"**

```sql
select
    case
        when d.total_existentes > 0
            then 'Ya le enviaste todo el material disponible de esa referencia a este cliente. No lo repitas: refiérete a lo que ya vio contigo.'
        else 'No hay medios para esa referencia. Con material disponible: ' || coalesce(d.referencias_disponibles, 'ninguna') || '. Vuelve a intentarlo con una de esas, o continúa la conversación sin enviar material.'
    end as resultado
from fn_medios_diagnostico($1, $2, $3) d
```

*Query Parameters*:

```
={{ $('Execute Workflow Trigger').first().json.categoria }},{{ $('Execute Workflow Trigger').first().json.referencia }},{{ $('Execute Workflow Trigger').first().json.tipo_medio }}
```

Este nodo es la salida de la rama falsa: su campo `resultado` vuelve al agente.

- [ ] **Step 5: Rama verdadera — Loop Over Items**

Nodo **Loop Over Items** (batch size 1) sobre los medios seleccionados.

- [ ] **Step 6: IF "¿Es video?" y los dos nodos de envío**

Dentro del loop, IF *String* → `{{ $json.tipo }}` → **equals** → `video`.

- Rama verdadera → nodo **WhatsApp** con *Message Type* **Video**.
- Rama falsa → nodo **WhatsApp** con *Message Type* **Image**.

En ambos, con los nombres de campo verificados en la Task 6:
- destinatario: `={{ $('Execute Workflow Trigger').first().json.telefono }}`
- URL del medio: `={{ $json.url }}`
- caption: `={{ $json.caption }}`

En ambos nodos, *Settings* → **On Error** → **Continue (using regular output)**. Si Meta rechaza un archivo, el turno del agente no se cae.

- [ ] **Step 7: Nodo Postgres "Registrar Envío"**

Después de los nodos de WhatsApp, dentro del loop:

```sql
select fn_registrar_envio($1, $2)
```

*Query Parameters*:

```
={{ $('Loop Over Items').first().json.id }},{{ $('Execute Workflow Trigger').first().json.telefono }}
```

Conectar de vuelta al Loop Over Items para la siguiente iteración.

> ⚠️ **No asumas que devolvió algo.** `fn_registrar_envio` devuelve NULL sin
> error si el teléfono no existe en `leads` — inserta cero filas y calla. En el
> flujo real el lead se hace upsert al inicio de cada ejecución, así que no
> debería pasar; pero el nodo no debe tratar el resultado como un id garantizado.
>
> ⚠️ **Los nodos de WhatsApp van con `continueRegularOutput`, así que un envío
> fallido también emite un ítem por la salida normal** y llegaría hasta aquí,
> quedando registrado como enviado. Eso contradice la prueba del spec ("con una
> URL inválida no se registra el envío") y es peor de lo que parece: el filtro
> anti-repetición suprimiría para siempre cualquier archivo que Meta haya
> rechazado. Hace falta un IF sobre el campo de error del nodo de WhatsApp antes
> de registrar.

- [ ] **Step 8: Nodo Set "Resumen" a la salida del loop**

Campo `resultado` (string):

```
=Enviaste al cliente: {{ $('Seleccionar Medios').all().map(m => m.json.descripcion).join('; ') }}. Ya los está viendo en el chat: coméntalos con naturalidad en tu respuesta, no anuncies que vas a enviarlos.
```

- [ ] **Step 9: Probar el sub-workflow aislado**

Ejecutarlo manualmente con datos de prueba: `categoria` = `servicio`, `referencia` = `Pirotecnia`, `tipo_medio` = `video`, `telefono` = un número de WhatsApp real de prueba.

Esperado: el video llega al chat; `envios_medios` tiene una fila nueva; el nodo Set devuelve el resumen.

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) from envios_medios;"
```

- [ ] **Step 10: Probar la rama de error**

Volver a ejecutarlo con los mismos parámetros. Esperado: no reenvía nada y devuelve el mensaje de "ya le enviaste todo el material disponible".

Ejecutarlo con `referencia` = `Sede Que No Existe`. Esperado: el mensaje con la lista de referencias válidas.

- [ ] **Step 11: Exportar al repo**

Menú del workflow → Download → guardar como `n8n/workflow-enviar-medios.json`.

- [ ] **Step 12: Commit**

```bash
git add n8n/workflow-enviar-medios.json
git commit -m "$(cat <<'EOF'
Add enviar_medios sub-workflow

Sends catalog media over WhatsApp and logs it, so the same client never
receives the same photo twice.

The WhatsApp nodes continue on error: a file Meta rejects must not take down
the agent's turn, and only successful sends get logged.

The empty branch returns two different messages depending on why nothing
matched, so the agent can self-correct a wrong reference without telling a
client it has no photos of a venue it just sent photos of.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Integrar en el workflow principal

**Files:**
- Modify: `n8n/system-prompt-brian-otero.md`
- Modify: `n8n/workflow-brian-otero.json`
- Modify: `n8n/herramientas.md`

**Interfaces:**
- Consumes: sub-workflow `enviar_medios` (Task 7), `fn_catalogo_digest` (Task 4).
- Produces: agente con 4 herramientas conectadas (las 3 de consulta + `enviar_medios`) y el catálogo en su system message.

- [ ] **Step 1: Nodo Postgres "Catálogo de Medios"**

En el workflow `Brian Otero`, insertar entre el IF **¿Bot activo?** (rama verdadera) y el nodo **Brian Otero**:

```sql
select fn_catalogo_digest() as digest
```

Sin parámetros. Nombre exacto del nodo: `Catálogo de Medios` — el system message lo referencia por ese nombre.

- [ ] **Step 2: Actualizar el system prompt en el repo**

En `n8n/system-prompt-brian-otero.md`, dentro del bloque ```text, insertar antes de `# RESTRICCIONES`:

```text
# MATERIAL VISUAL DISPONIBLE
Cada línea es: categoría | referencia | tipo | cantidad | en qué momento conviene enviarla.
{{ $('Catálogo de Medios').first().json.digest }}

Usa enviar_medios cuando la conversación llegue al momento que describe la línea. Vender un salón o un show sin mostrarlo desperdicia tu mejor argumento.
- Usa como `referencia` el nombre exacto que aparece arriba, o el nombre_sede exacto que te devolvió consultar_precios_sedes. No lo abrevies ni lo cambies.
- Máximo un envío de medios por turno. Si presentaste varias sedes, envía material de UNA sola: la que el cliente señale.
- Nunca envíes material que el cliente no haya pedido y cuyo momento aún no haya llegado.
- El material llega al chat antes de tu mensaje. Coméntalo con naturalidad ("como ves en el video..."), no anuncies que lo vas a mandar.
```

Y agregar al final de la lista de `# RESTRICCIONES`:

```text
- NUNCA describas material visual que no aparezca en MATERIAL VISUAL DISPONIBLE, ni prometas fotos o videos que no tengas.
```

- [ ] **Step 3: Copiar el prompt al nodo del agente**

Pegar el texto actualizado completo en el campo *System Message* del nodo **Brian Otero**. El repo y el nodo deben quedar idénticos.

- [ ] **Step 4: Conectar la herramienta al agente**

Agregar un nodo **Call n8n Workflow Tool** (`@n8n/n8n-nodes-langchain.toolWorkflow`) llamado `enviar_medios`, apuntando al workflow de la Task 7.

*Description* (lo que lee el modelo para decidir cuándo llamarla):

```
Envía fotos o videos al cliente por WhatsApp. El material disponible y el momento en que conviene usar cada pieza están en la sección MATERIAL VISUAL DISPONIBLE de tus instrucciones. Envía máximo un grupo de medios por turno.
```

*Workflow Inputs*:

```
categoria:   ={{ $fromAI('categoria', 'Exactamente uno de: sede, tipo_evento, servicio, institucional.', 'string') }}
referencia:  ={{ $fromAI('referencia', 'El nombre concreto tal como aparece en MATERIAL VISUAL DISPONIBLE, por ejemplo "Salón Cristal", "15 Años", "Pirotecnia Show". Déjala vacía solo si categoria es institucional.', 'string') }}
tipo_medio:  ={{ $fromAI('tipo_medio', 'Uno de: imagen, video, ambos. Usa video cuando quieras impacto antes de cerrar, imagen cuando el cliente está comparando.', 'string') }}
telefono:    ={{ $('Extraer Mensaje').first().json.telefono }}
```

> El teléfono se conecta desde el flujo, **nunca** por `$fromAI()`. Verificar el nombre exacto del campo en el nodo `Extraer Mensaje`; si difiere, usar el real.

- [ ] **Step 5: Documentar la herramienta #8**

En `n8n/herramientas.md`, agregar una sección `## 8. enviar_medios` con la descripción para el LLM, los parámetros, la nota de que el teléfono va conectado desde el flujo, y las tres funciones SQL que usa.

- [ ] **Step 6: Exportar el workflow actualizado**

Menú → Download → sobrescribir `n8n/workflow-brian-otero.json`.

- [ ] **Step 7: Commit**

```bash
git add n8n/workflow-brian-otero.json n8n/system-prompt-brian-otero.md n8n/herramientas.md
git commit -m "$(cat <<'EOF'
Wire the media tool into the sales agent

The catalog node injects what material exists, and when each piece is worth
sending, into the system message on every turn. That is what keeps the
prompt stable as content grows: new videos change the agent's behavior
through a database row, not an edit here.

The phone number is plumbed from the flow rather than $fromAI, like the
other tools that write per-lead rows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Pruebas end-to-end y de escalabilidad

**Files:**
- Ninguno nuevo. Verificación sobre lo construido.

- [ ] **Step 1: Conversación completa desde WhatsApp**

Escribirle al número del negocio desde un WhatsApp de prueba y recorrer el embudo hasta pedir ver un salón.

Esperado: las fotos llegan **antes** del mensaje de texto del agente, y el texto las comenta en vez de anunciarlas.

- [ ] **Step 2: Verificar el registro**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
select l.telefono, m.descripcion, e.enviado_at
from envios_medios e
join leads l on l.id = e.lead_id
join medios m on m.id = e.medio_id
order by e.enviado_at desc limit 10;"
```

Esperado: una fila por medio efectivamente entregado.

- [ ] **Step 3: Verificar la anti-repetición en vivo**

En la misma conversación, volver a pedir fotos del mismo salón.

Esperado: el agente no repite material; responde refiriéndose a lo que ya envió.

- [ ] **Step 4: La prueba de escalabilidad — el requisito rector del spec**

Primero subir al bucket un video corto adicional (mismo procedimiento de la
Tarea 5, Steps 1 y 3) y anotar su URL pública real. La prueba no sirve con
una URL inventada: el agente sí ofrecería el video, pero Meta rechazaría la
descarga y no se distinguiría un fallo de catálogo de uno de archivo.

Después, sin tocar el prompt, el workflow ni ningún archivo del repo,
insertar el medio — reemplazando la URL por la real:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
insert into medios (tipo, url, descripcion, caption, cuando_usar, sede_id, peso_bytes)
select 'video',
       'http://127.0.0.1:54321/storage/v1/object/public/medios/sedes/<archivo-real>.mp4',
       'Recorrido completo del Salón Cristal',
       'Te dejo el recorrido completo 🎥',
       'cuando el cliente ya vio las fotos y sigue dudando entre dos sedes',
       id_sede, <peso-real>
from sedes where nombre_sede = 'Salón Cristal';"
```

Iniciar una conversación nueva y llevarla a ese momento.

Esperado: el agente ofrece el video sin que nadie haya tocado n8n. **Si esto falla, el diseño no cumplió su objetivo principal** y hay que revisar que el nodo Catálogo de Medios corra en cada turno y que su salida llegue al system message.

- [ ] **Step 5: Verificar el manejo de fallo de Meta**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
insert into medios (tipo, url, descripcion, cuando_usar, sede_id)
select 'imagen', 'http://127.0.0.1:54321/storage/v1/object/public/medios/no-existe.jpg',
       'Archivo roto a propósito', 'prueba de fallo', id_sede
from sedes where nombre_sede = 'Salón Cristal';"
```

Pedir ese material en una conversación de prueba.

Esperado: el agente responde con normalidad, sin caerse, y `envios_medios` **no** registra el archivo roto.

Limpiar después:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
delete from medios where descripcion = 'Archivo roto a propósito';"
```

- [ ] **Step 6: Suite completa de base de datos**

```bash
supabase test db
```

Esperado: los tres archivos de prueba en verde, sin fallos.

> **Sin `supabase db reset` aquí.** Los archivos ya están subidos y un reset
> vaciaría `storage.objects`, dejando todas las URLs del catálogo en 404. Las
> pruebas pgTAP corren dentro de transacciones con `rollback`, así que no
> ensucian los datos. Si alguna vez hace falta un reset, hay que resubir el
> contenido al bucket después.

- [ ] **Step 7: Commit final y merge**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Verify media sending end to end

Covers delivery order, the no-repeat filter, and Meta rejecting a file
without taking down the agent's turn.

The scalability check is the one that matters: a video added straight to the
database changes what the agent offers, with no edit to the prompt or the
workflow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git checkout main
git merge --no-ff feature/envio-medios
```

---

## Notas de despliegue a cloud

Cuando el proyecto migre de local a Supabase cloud y n8n Cloud:

1. `supabase db push` aplica las seis migraciones sin cambios.
2. Resubir los archivos al bucket `medios` del proyecto cloud (el bucket lo crea la migración; los archivos no viajan solos).
3. Reescribir las URLs:
   ```sql
   update medios set url = replace(url, 'http://127.0.0.1:54321', 'https://<proyecto>.supabase.co');
   ```
4. Vigilar el egress de Storage. Si crece, la salida documentada en el spec es cachear el `media_id` de Meta en `medios.meta_media_id`.
