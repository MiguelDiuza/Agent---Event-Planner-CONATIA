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
