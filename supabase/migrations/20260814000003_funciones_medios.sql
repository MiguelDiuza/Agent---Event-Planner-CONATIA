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
