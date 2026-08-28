-- Redaccion en espanol correcto para el caption de varios aforos (2026-08-28).
--
-- fn_medios_sedes_cotizacion (20260828000000_cotizacion_multiaforo.sql) unia
-- los aforos aplicables con " y " entre TODOS los elementos: "50 y 100 y 130
-- personas" en vez de "50, 100 y 130 personas". Se corrige el armado de la
-- lista -- comas entre todos menos los dos ultimos, "y" antes del ultimo --
-- sin tocar nada mas de la funcion.

drop function if exists fn_medios_sedes_cotizacion(text, text, boolean);

create or replace function fn_medios_sedes_cotizacion(
    p_telefono   text,
    p_invitados  text,
    p_reenviar   boolean default false
)
returns table (id uuid, tipo text, url text, caption text, descripcion text)
language plpgsql
stable
as $fn$
declare
    v_reenviar boolean := coalesce(p_reenviar, false);
    v_aforos   int[];
begin
    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    select array_agg(distinct v.aforo order by v.aforo)
      into v_aforos
    from (
        select least(200, greatest(50, (ceil(n.valor / 10.0) * 10)::int)) as aforo
        from unnest(string_to_array(coalesce(p_invitados, ''), ',')) as t(raw)
        cross join lateral (select nullif(btrim(t.raw), '')::numeric as valor) as n
        where n.valor is not null and n.valor > 0
    ) v;

    if v_aforos is null or array_length(v_aforos, 1) = 0 then
        return;
    end if;

    return query
    with elegido as (
        select distinct on (m.sede_id)
               m.id, m.tipo, m.url, m.descripcion, m.sede_id
        from medios m
        where m.activo
          and m.sede_id is not null
          and (v_reenviar or not exists (
                select 1
                from envios_medios e
                join leads  l  on l.id = e.lead_id
                join medios m2 on m2.id = e.medio_id
                where m2.sede_id = m.sede_id
                  and l.telefono = p_telefono
          ))
        order by m.sede_id, (m.tipo = 'video') desc, m.orden, m.created_at
    ),
    aforos_sede as (
        select e.id as medio_id, p.capacidad_invitados as aforo
        from elegido e
        join precios_sedes p
          on p.sede_id = e.sede_id
         and p.capacidad_invitados = any(v_aforos)
    ),
    -- Lista en espanol: comas entre todos menos los dos ultimos, "y" antes
    -- del ultimo. "130" con uno solo, "100 y 130" con dos, "50, 100 y 130"
    -- con tres o mas.
    resumen_multi as (
        select medio_id,
               case
                   when array_length(arr, 1) = 1 then arr[1]::text
                   else array_to_string(arr[1 : array_length(arr, 1) - 1], ', ')
                        || ' y ' || arr[array_length(arr, 1)]::text
               end as aforos_texto
        from (
            select medio_id, array_agg(aforo order by aforo) as arr
            from aforos_sede
            group by medio_id
        ) t
    ),
    precio_unico as (
        select e.id as medio_id, pr.precio_total, pr.capacidad_invitados
        from elegido e
        cross join lateral (
            select p.precio_total, p.capacidad_invitados
            from precios_sedes p
            where p.sede_id = e.sede_id
            order by (p.capacidad_invitados = v_aforos[1]) desc,
                     abs(p.capacidad_invitados - v_aforos[1]),
                     p.capacidad_invitados
            limit 1
        ) pr
        where array_length(v_aforos, 1) = 1
    )
    select e.id,
           e.tipo,
           e.url,
           case
               when array_length(v_aforos, 1) = 1 then
                   fn_nombre_salon(s.nombre_sede)
                   || coalesce(
                          ' - valor PROMOCIONAL: $'
                          || replace(to_char(pu.precio_total, 'FM999,999,999'), ',', '.')
                          || ' - '
                          || case
                                 when pu.capacidad_invitados = v_aforos[1]
                                     then pu.capacidad_invitados || ' personas'
                                 when pu.capacidad_invitados < v_aforos[1]
                                     then 'hasta ' || pu.capacidad_invitados || ' personas'
                                 else 'desde ' || pu.capacidad_invitados || ' personas'
                             end,
                          ''
                      )
               else
                   fn_nombre_salon(s.nombre_sede) || ' - Disponible para ' || rm.aforos_texto || ' personas'
           end as caption,
           e.descripcion
    from elegido e
    join sedes s on s.id_sede = e.sede_id
    left join precio_unico pu on pu.medio_id = e.id
    left join resumen_multi rm on rm.medio_id = e.id
    where array_length(v_aforos, 1) = 1 or rm.medio_id is not null
    order by (case when array_length(v_aforos, 1) = 1 then pu.precio_total end) nulls last,
             s.nombre_sede;
end;
$fn$;

comment on function fn_medios_sedes_cotizacion(text, text, boolean) is
    'Una pieza por salon con material cargado -- el video si lo hay, la foto '
    'si no -- para uno o varios aforos (CSV: "100" o "50,100,130"). Con un '
    'solo aforo el caption lleva nombre, valor PROMOCIONAL y personas, igual '
    'que siempre. Con varios, el caption dice solo para cuales de los aforos '
    'pedidos ese salon tiene precio real, en espanol correcto ("50, 100 y '
    '130 personas"). No repite lo que ese telefono ya recibio, salvo con '
    'p_reenviar = true.';

do $test$
declare
    v_tel     text := 'test-caption-es-' || gen_random_uuid()::text;
    v_caption text;
begin
    select f.caption into v_caption
    from fn_medios_sedes_cotizacion(v_tel, '50,100,130') f
    join medios m on m.id = f.id
    join sedes s on s.id_sede = m.sede_id
    where not exists (select 1 from precios_sedes p where p.sede_id = s.id_sede and p.capacidad_invitados = 50)
      and exists (select 1 from precios_sedes p where p.sede_id = s.id_sede and p.capacidad_invitados = 100)
      and exists (select 1 from precios_sedes p where p.sede_id = s.id_sede and p.capacidad_invitados = 130)
    limit 1;

    if v_caption is not null and v_caption !~ '100 y 130' then
        raise exception 'Se esperaba "100 y 130" en el caption, salio: %', v_caption;
    end if;

    select f.caption into v_caption
    from fn_medios_sedes_cotizacion(v_tel, '50,100,130') f
    join medios m on m.id = f.id
    join sedes s on s.id_sede = m.sede_id
    where exists (select 1 from precios_sedes p where p.sede_id = s.id_sede and p.capacidad_invitados = 50)
      and exists (select 1 from precios_sedes p where p.sede_id = s.id_sede and p.capacidad_invitados = 100)
      and exists (select 1 from precios_sedes p where p.sede_id = s.id_sede and p.capacidad_invitados = 130)
    limit 1;

    if v_caption is not null and v_caption !~ '50, 100 y 130' then
        raise exception 'Se esperaba "50, 100 y 130" en el caption, salio: %', v_caption;
    end if;
end;
$test$;
