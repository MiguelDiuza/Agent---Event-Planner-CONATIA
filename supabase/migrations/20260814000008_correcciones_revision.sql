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

-- ---------------------------------------------------------------------------
-- I2 + I3 + I4 + M4. Selección de medios.
-- ---------------------------------------------------------------------------
-- Desde aquí queda la versión vigente de `fn_medios_para_enviar` y
-- `fn_medios_diagnostico`; 20260814000003 y 20260814000006 quedan como
-- historia.
--
-- Las firmas NO cambian: n8n llama estas funciones posicionalmente
-- (`select * from fn_...($1, $2, $3, $4)`), así que nombres, tipos, orden,
-- valores por defecto y tipo de retorno son idénticos a los de 000006. Lo
-- único que cambia es el lenguaje (`sql` -> `plpgsql`), necesario porque
-- `language sql` no puede hacer `raise`.
--
-- Qué enviarle a este cliente ahora: material activo de la referencia pedida,
-- del tipo pedido, que este lead todavía no haya recibido. El tope de 3 acota
-- el daño de una elección equivocada del modelo y hace imposible el spam.
--
-- Cambios respecto de 000006:
--
--   I4+M4. `p_categoria` y `p_tipo_medio` se normalizan con lower(trim(...))
--   y luego se validan contra su enum. Normalizar absorbe la variación normal
--   del LLM ('Sede', 'Video', 'ambos '), que antes devolvía cero filas en
--   silencio. Validar es lo que atrapa el error de verdad caro: las dos
--   funciones se invocan posicionalmente desde nodos n8n adyacentes y su
--   tercer parámetro significa cosas distintas (teléfono aquí, tipo de medio
--   en el diagnóstico); como todos los parámetros son `text`, una llamada mal
--   ordenada pasaba el chequeo de tipos y devolvía cero filas para siempre.
--   Un teléfono no normaliza a ningún valor del enum, así que ahora revienta
--   ruidosamente al construir el workflow en vez de mentirle a un cliente.
--
--   I3. `p_telefono` nulo o vacío hacía vacuamente verdadero el `not exists`
--   del anti-repetición: el filtro desaparecía y todos los clientes recibían
--   el mismo material una y otra vez. Peor, `fn_registrar_envio` con ese
--   mismo teléfono inserta cero filas, así que la bitácora quedaba vacía y
--   parecía que nunca se había enviado nada: dos fallas que se tapan entre
--   sí. El invariante "sin teléfono no hay anti-repetición" lo conoce esta
--   capa, así que lo impone esta capa: teléfono inválido -> cero filas.
--
--   I2. La referencia recortada se usa también en el patrón ILIKE. Antes el
--   guard y la preferencia por coincidencia exacta usaban `trim(...)` pero el
--   patrón usaba el valor crudo, así que un espacio final —cosa rutinaria en
--   la salida de un LLM— volvía inencontrable una referencia válida.
create or replace function fn_medios_para_enviar(
    p_categoria  text,
    p_referencia text,
    p_telefono   text,
    p_tipo_medio text default 'ambos'
)
returns table (id uuid, tipo text, url text, caption text, descripcion text)
language plpgsql
stable
as $$
declare
    v_categoria  text := lower(btrim(coalesce(p_categoria, '')));
    v_tipo_medio text := lower(btrim(coalesce(p_tipo_medio, '')));
    v_referencia text := btrim(coalesce(p_referencia, ''));
    -- Escape de metacaracteres LIKE: la referencia viene de un LLM que relaya
    -- mensajes de desconocidos. Sin esto, un '%' convierte "busca una sede"
    -- en "devuelve todas". Backslash primero, luego % y _.
    v_patron text := '%' ||
        replace(replace(replace(v_referencia, '\', '\\'), '%', '\%'), '_', '\_')
        || '%';
begin
    if v_categoria not in ('sede', 'tipo_evento', 'servicio', 'institucional') then
        raise exception
            'p_categoria invalida: %. Valores aceptados: sede, tipo_evento, servicio, institucional.',
            coalesce(quote_literal(p_categoria), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_para_enviar(categoria, referencia, telefono, tipo_medio).';
    end if;

    if v_tipo_medio not in ('imagen', 'video', 'ambos') then
        raise exception
            'p_tipo_medio invalido: %. Valores aceptados: imagen, video, ambos.',
            coalesce(quote_literal(p_tipo_medio), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_para_enviar(categoria, referencia, telefono, tipo_medio).';
    end if;

    -- Sin teléfono utilizable no hay forma de saber qué vio ya este cliente.
    -- Devolver material sería reenviarlo a ciegas; se devuelve nada.
    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    return query
    select m.id, m.tipo, m.url, m.caption, m.descripcion
    from medios m
    where m.activo
      and (v_tipo_medio = 'ambos' or m.tipo = v_tipo_medio)
      -- Si la referencia no existe, la subconsulta da NULL, la comparación da
      -- NULL y no sale ninguna fila: el caso de error se resuelve sin lógica
      -- adicional. El orden prefiere coincidencias exactas, luego nombres
      -- cortos (más probable que sean el registro concreto), luego alfabético.
      and case v_categoria
            when 'sede' then (length(v_referencia) > 0
                and m.sede_id = (
                    select s.id_sede from sedes s
                    where s.nombre_sede ilike v_patron escape '\'
                    order by (lower(s.nombre_sede) = lower(v_referencia)) desc,
                             length(s.nombre_sede), s.nombre_sede
                    limit 1))
            when 'tipo_evento' then (length(v_referencia) > 0
                and m.tipo_evento_id = (
                    select te.id_evento from tipos_evento te
                    where te.nombre_paquete ilike v_patron escape '\'
                    order by (lower(te.nombre_paquete) = lower(v_referencia)) desc,
                             length(te.nombre_paquete), te.nombre_paquete
                    limit 1))
            when 'servicio' then (length(v_referencia) > 0
                and m.servicio_id = (
                    select sv.id from servicios_adicionales_upselling sv
                    where sv.servicio ilike v_patron escape '\'
                    order by (lower(sv.servicio) = lower(v_referencia)) desc,
                             length(sv.servicio), sv.servicio
                    limit 1))
            when 'institucional' then (
                m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null)
          end
      and not exists (
            select 1 from envios_medios e
            join leads l on l.id = e.lead_id
            where e.medio_id = m.id and l.telefono = p_telefono
      )
    order by m.orden, m.created_at, m.id
    limit 3;
end;
$$;

-- ---------------------------------------------------------------------------
-- I2 + I4 + M4. Diagnóstico de la rama sin resultados.
-- ---------------------------------------------------------------------------
-- Por qué no salió nada. Cero filas tiene dos causas y el agente debe decir
-- cosas distintas: que la referencia no existe (eligió mal, y la lista de
-- referencias disponibles le permite autocorregirse), o que a ese cliente ya
-- se le envió todo (no debe repetir, debe referirse a lo que ya vio con él).
--
-- Recibe el mismo tratamiento que fn_medios_para_enviar y por la misma razón:
-- normalizar + validar + recortar la referencia. Aquí la normalización de
-- `p_categoria` importa doble, porque `referencias_disponibles` se consulta
-- contra la vista con ese mismo valor: con 'Sede' en vez de 'sede' devolvía
-- NULL, y el agente leía "no hay material en toda la categoría" justo en la
-- rama diseñada para entregarle la lista de corrección.
create or replace function fn_medios_diagnostico(
    p_categoria  text,
    p_referencia text,
    p_tipo_medio text default 'ambos'
)
returns table (total_existentes bigint, referencias_disponibles text)
language plpgsql
stable
as $$
declare
    v_categoria  text := lower(btrim(coalesce(p_categoria, '')));
    v_tipo_medio text := lower(btrim(coalesce(p_tipo_medio, '')));
    v_referencia text := btrim(coalesce(p_referencia, ''));
    v_patron text := '%' ||
        replace(replace(replace(v_referencia, '\', '\\'), '%', '\%'), '_', '\_')
        || '%';
begin
    if v_categoria not in ('sede', 'tipo_evento', 'servicio', 'institucional') then
        raise exception
            'p_categoria invalida: %. Valores aceptados: sede, tipo_evento, servicio, institucional.',
            coalesce(quote_literal(p_categoria), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_diagnostico(categoria, referencia, tipo_medio) NO recibe telefono.';
    end if;

    if v_tipo_medio not in ('imagen', 'video', 'ambos') then
        raise exception
            'p_tipo_medio invalido: %. Valores aceptados: imagen, video, ambos.',
            coalesce(quote_literal(p_tipo_medio), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_diagnostico(categoria, referencia, tipo_medio) NO recibe telefono.';
    end if;

    return query
    select
        (select count(*)
         from medios m
         where m.activo
           and (v_tipo_medio = 'ambos' or m.tipo = v_tipo_medio)
           and case v_categoria
                 when 'sede' then (length(v_referencia) > 0
                     and m.sede_id = (
                         select s.id_sede from sedes s
                         where s.nombre_sede ilike v_patron escape '\'
                         order by (lower(s.nombre_sede) = lower(v_referencia)) desc,
                                  length(s.nombre_sede), s.nombre_sede
                         limit 1))
                 when 'tipo_evento' then (length(v_referencia) > 0
                     and m.tipo_evento_id = (
                         select te.id_evento from tipos_evento te
                         where te.nombre_paquete ilike v_patron escape '\'
                         order by (lower(te.nombre_paquete) = lower(v_referencia)) desc,
                                  length(te.nombre_paquete), te.nombre_paquete
                         limit 1))
                 when 'servicio' then (length(v_referencia) > 0
                     and m.servicio_id = (
                         select sv.id from servicios_adicionales_upselling sv
                         where sv.servicio ilike v_patron escape '\'
                         order by (lower(sv.servicio) = lower(v_referencia)) desc,
                                  length(sv.servicio), sv.servicio
                         limit 1))
                 when 'institucional' then (
                     m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null)
               end),
        (select string_agg(distinct v.referencia, ', ' order by v.referencia)
         from vista_catalogo_medios v
         where v.categoria = v_categoria);
end;
$$;
