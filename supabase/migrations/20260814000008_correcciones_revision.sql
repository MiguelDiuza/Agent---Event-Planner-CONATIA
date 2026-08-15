-- Correcciones de la revisión final del catálogo de medios.
--
-- Las migraciones ya aplicadas no se editan: todo lo de aquí va por
-- `create or replace` (funciones y vista) y `alter table` (RLS).

-- ---------------------------------------------------------------------------
-- C1. RLS en las dos tablas del catálogo de medios.
-- ---------------------------------------------------------------------------
-- Los grants por defecto de Supabase le dan a `anon` SELECT/INSERT/UPDATE/
-- DELETE sobre toda tabla nueva de `public`, y la clave anon es pública por
-- diseño: viaja en cualquier bundle de cliente. Para el resto del esquema eso
-- ya era malo; para estas dos tablas es distinto en especie, y por eso llevan
-- RLS aunque `leads`, `sedes` y `precios_sedes` todavía no la tengan:
--
--   * `medios.cuando_usar` se concatena literal dentro del system message del
--     agente (fn_catalogo_digest). Una fila insertada por un desconocido es
--     texto que Gemini lee como instrucción.
--   * `medios.url` se le entrega al nodo de WhatsApp: el número del negocio
--     terminaría enviando a clientes reales archivos elegidos por ese mismo
--     desconocido.
--   * `envios_medios` es la bitácora anti-repetición. Borrarla o falsearla
--     convierte al agente en un spammer o lo hace callar.
--
-- Se habilita RLS sin crear ninguna política: sin políticas, `anon` y
-- `authenticated` no ven ni escriben nada. `postgres` y `service_role` tienen
-- BYPASSRLS, y son los roles con los que entran n8n (credencial Postgres del
-- stack local) y Supabase Studio, así que ninguna ruta legítima se rompe.
alter table medios enable row level security;
alter table envios_medios enable row level security;

-- ---------------------------------------------------------------------------
-- M5. Orden explícito dentro de cada string_agg de la vista.
-- ---------------------------------------------------------------------------
-- El texto de esta vista termina dentro del system message en cada turno. Que
-- el orden de los `cuando_usar` dependa del plan que elija el planificador es
-- inaceptable ahí: el prompt cambiaría sin que cambie ningún dato, rompiendo
-- el cacheo de prompt y ensuciando los diffs entre turnos. Hoy el `distinct`
-- ordena de forma incidental; el `order by` lo vuelve una garantía escrita.
create or replace view vista_catalogo_medios as
select 'sede' as categoria, s.nombre_sede as referencia, m.tipo,
       count(*) as cantidad,
       string_agg(distinct m.cuando_usar, '; ' order by m.cuando_usar) as cuando_usar
from medios m
join sedes s on s.id_sede = m.sede_id
where m.activo
group by s.nombre_sede, m.tipo
union all
select 'tipo_evento', te.nombre_paquete, m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ' order by m.cuando_usar)
from medios m
join tipos_evento te on te.id_evento = m.tipo_evento_id
where m.activo
group by te.nombre_paquete, m.tipo
union all
select 'servicio', sv.servicio, m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ' order by m.cuando_usar)
from medios m
join servicios_adicionales_upselling sv on sv.id = m.servicio_id
where m.activo
group by sv.servicio, m.tipo
union all
select 'institucional', 'Institucional', m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ' order by m.cuando_usar)
from medios m
where m.activo
  and m.sede_id is null
  and m.tipo_evento_id is null
  and m.servicio_id is null
group by m.tipo;

