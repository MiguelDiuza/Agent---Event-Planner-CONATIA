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
