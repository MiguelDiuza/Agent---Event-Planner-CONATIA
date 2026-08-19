-- Etiqueta liviana para distinguir sub-propósitos dentro de "institucional".
--
-- El catálogo real ya tiene tres piezas institucionales con disparadores
-- distintos: un video de promoción ("cuando el cliente pregunta por
-- promociones") y dos testimonios ("cuando el cliente duda o pide
-- referencias"). Sin nada que las distinga, fn_medios_para_enviar('institucional',
-- '', telefono, 'video') las trae las tres juntas en una sola llamada — un
-- cliente que pregunta por testimonios también recibiría el promo.
--
-- No es el rediseño completo de "múltiples piezas por referencia" que se
-- discutió para sede/tipo_evento/servicio (ahí sigue valiendo una sola pieza
-- por ahora). Institucional es distinto: no tiene FK que ya lo distinga, así
-- que necesita algo, y hoy mismo, no como trabajo futuro.
--
-- Se resuelve reutilizando `p_referencia` en vez de agregar un quinto
-- parámetro: para institucional, esa columna ya se ignoraba por completo.
-- Las firmas de ambas funciones quedan exactamente iguales.
alter table medios add column etiqueta text;

comment on column medios.etiqueta is
    'Solo tiene sentido en medios institucionales (sede_id, tipo_evento_id y '
    'servicio_id nulos): sub-propósito libre (''promocion'', ''testimonio'') '
    'para que enviar_medios pueda pedir uno en concreto pasándolo como '
    'referencia. Sin uso en medios de sede/tipo_evento/servicio, que ya se '
    'distinguen por su FK.';

-- La vista pasa a agrupar institucional por etiqueta (o 'Institucional' si no
-- tiene) en vez de colapsar todo en una sola fila. Así el resumen que lee el
-- agente muestra cada sub-propósito por separado, con su propio cuando_usar,
-- y el nombre que debe usar como referencia para pedir justo ese.
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
select 'institucional', coalesce(m.etiqueta, 'Institucional'), m.tipo, count(*),
       string_agg(distinct m.cuando_usar, '; ' order by m.cuando_usar)
from medios m
where m.activo
  and m.sede_id is null
  and m.tipo_evento_id is null
  and m.servicio_id is null
group by coalesce(m.etiqueta, 'Institucional'), m.tipo;

-- Las dos funciones: la rama institucional gana un filtro opcional por
-- etiqueta. Referencia en blanco sigue significando "cualquier institucional"
-- (comportamiento previo, intacto); referencia no vacía ahora filtra por
-- etiqueta con el mismo patrón escapado que ya usan sede/tipo_evento/servicio
-- — el mismo LLM que puede mandar un '%' en el nombre de una sede puede
-- mandarlo aquí.
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

    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    return query
    select m.id, m.tipo, m.url, m.caption, m.descripcion
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
                m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null
                and (length(v_referencia) = 0 or m.etiqueta ilike v_patron escape '\'))
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
                     m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null
                     and (length(v_referencia) = 0 or m.etiqueta ilike v_patron escape '\'))
               end),
        (select string_agg(distinct v.referencia, ', ' order by v.referencia)
         from vista_catalogo_medios v
         where v.categoria = v_categoria);
end;
$$;
