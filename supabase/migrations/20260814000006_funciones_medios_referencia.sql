-- SUPERSEDIDO — reemplaza por `create or replace` el cuerpo definido en
-- 20260814000003, y a su vez queda reemplazado por 20260814000008
-- (normalización de parámetros, validación del enum y guard de teléfono), que
-- es la versión vigente de `fn_medios_para_enviar` y `fn_medios_diagnostico`.
--
-- Escaping de metacaracteres LIKE y ordenamiento determinista en funciones de medios.
--
-- El parámetro p_referencia proviene de mensajes WhatsApp relayados por un modelo de LLM,
-- nunca de entrada validada. Sin escaping, caracteres LIKE (% y _) desde el modelo
-- pueden convertir "busca una sede" en "devuelve todas" — por eso escapamos antes de
-- emparejar: backslash primero, luego %, luego _. Eso neutraliza los metacaracteres
-- y permite que la búsqueda ILIKE funcione como se espera.
--
-- El tiebreaker determinista en `order by` asegura que dos resultados con el mismo
-- orden no produzcan diferentes subconjuntos en llamadas repetidas. El orden prefiere
-- coincidencias exactas, luego nombres cortos (más probable que sean registros concretos),
-- luego alfabético.

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
      -- Escape de metacaracteres LIKE para referencias desde LLM.
      and case p_categoria
            when 'sede' then (length(trim(p_referencia)) > 0
                and m.sede_id = (
                    select id_sede from sedes
                    where nombre_sede ilike '%' || replace(replace(replace(p_referencia, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
                    order by (lower(nombre_sede) = lower(trim(p_referencia))) desc, length(nombre_sede), nombre_sede
                    limit 1))
            when 'tipo_evento' then (length(trim(p_referencia)) > 0
                and m.tipo_evento_id = (
                    select id_evento from tipos_evento
                    where nombre_paquete ilike '%' || replace(replace(replace(p_referencia, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
                    order by (lower(nombre_paquete) = lower(trim(p_referencia))) desc, length(nombre_paquete), nombre_paquete
                    limit 1))
            when 'servicio' then (length(trim(p_referencia)) > 0
                and m.servicio_id = (
                    select id from servicios_adicionales_upselling
                    where servicio ilike '%' || replace(replace(replace(p_referencia, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
                    order by (lower(servicio) = lower(trim(p_referencia))) desc, length(servicio), servicio
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
                 when 'sede' then (length(trim(p_referencia)) > 0
                     and m.sede_id = (
                         select id_sede from sedes
                         where nombre_sede ilike '%' || replace(replace(replace(p_referencia, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
                         order by (lower(nombre_sede) = lower(trim(p_referencia))) desc, length(nombre_sede), nombre_sede
                         limit 1))
                 when 'tipo_evento' then (length(trim(p_referencia)) > 0
                     and m.tipo_evento_id = (
                         select id_evento from tipos_evento
                         where nombre_paquete ilike '%' || replace(replace(replace(p_referencia, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
                         order by (lower(nombre_paquete) = lower(trim(p_referencia))) desc, length(nombre_paquete), nombre_paquete
                         limit 1))
                 when 'servicio' then (length(trim(p_referencia)) > 0
                     and m.servicio_id = (
                         select id from servicios_adicionales_upselling
                         where servicio ilike '%' || replace(replace(replace(p_referencia, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
                         order by (lower(servicio) = lower(trim(p_referencia))) desc, length(servicio), servicio
                         limit 1))
                 when 'institucional' then (
                     m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null)
               end),
        (select string_agg(distinct v.referencia, ', ' order by v.referencia)
         from vista_catalogo_medios v
         where v.categoria = p_categoria);
$$;
