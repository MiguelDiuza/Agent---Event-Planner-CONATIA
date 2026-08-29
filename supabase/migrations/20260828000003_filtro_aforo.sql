-- El filtro de aforo vuelve a estar activo (2026-08-28).
--
-- EL PEDIDO DEL NEGOCIO, literal: "si dice que para x personas solo se le
-- envian los videos y la cotizacion de los salones con aforo para esas
-- personas".
--
-- QUE HACIA ANTES Y POR QUE ESTABA MAL
--
-- Ni `fn_medios_sedes_cotizacion` (un solo aforo) ni `fn_lista_salones_valores`
-- filtraban nada: las dos buscaban el escalon MAS CERCANO de cada sede con un
--
--     order by (capacidad = escalon) desc, abs(capacidad - escalon) limit 1
--
-- y despues disimulaban el desajuste en el rotulo, con un "(hasta 150
-- personas)" o un "(desde 100 personas)" pegado al precio. O sea que a un
-- cliente que pedia 180 personas le llegaban los quince videos, y siete de
-- ellos eran de salones donde no cabe: Casa 5, Casa 74, Mansion Vallano,
-- Marquez De Loyola, Sede Granada Gold, Sede Norte y Sede Sur 66 llegan hasta
-- 150. El cliente elegia uno de esos, y el problema aparecia en la cita.
--
-- Curiosamente el modo MULTI-AFORO (20260828000000) si filtraba, con un join
-- exacto contra precios_sedes. Las dos mitades del mismo nodo se comportaban
-- distinto segun el cliente pidiera "para 180" o "para 100 y 180".
--
-- LA REGLA NUEVA: EL FILTRO ES EXACTO
--
-- Un salon entra si tiene fila en `precios_sedes` para ESE escalon, y no entra
-- si no la tiene. Como los escalones de cada sede son continuos de a 10 entre
-- su minimo y su maximo, eso es lo mismo que decir "el aforo pedido cae dentro
-- del rango del salon". Los tres tramos que existen hoy:
--
--     50 - 90 personas   13 salones (todos menos Gran Salon y Valdemoro)
--   100 - 150 personas   15 salones (todos)
--   160 - 200 personas    8 salones (Casa 4, Casa Christian's, Hacienda El
--                                    Talisman, Orquideorama, Pilas Premium,
--                                    Sawa, Gran Salon y Valdemoro)
--
-- Con el filtro exacto, `capacidad_invitados` SIEMPRE es igual al escalon
-- pedido, asi que los rotulos "(hasta N)" y "(desde N)" quedan sin caso
-- posible: se van del codigo en vez de quedar como ramas muertas.
--
-- Y UNA TERCERA COSA QUE HABIA QUE MOVER CON ELLAS
--
-- `Guion Cotizacion` decide si la antesala promete videos ("...con los videos
-- de cada salon disponible...") mirando si queda material sin mandar. Ese
-- calculo ignoraba el aforo. Con el filtro puesto eso se rompe solo: un
-- cliente que ya vio los 8 salones grandes y ahora pide 60 personas tiene
-- material pendiente (los 7 chicos) y esta bien prometerlo; pero al reves --
-- ya vio los chicos y pide 180 -- la antesala prometia videos que no iban a
-- salir. Por eso el calculo pasa a ser una funcion, `fn_hay_material_sedes`,
-- que si mira el aforo, y el nodo la llama en vez de repetir el predicado a
-- mano.

-- ---------------------------------------------------------------------------
-- 1. fn_hay_material_sedes: hay video/foto sin mandar de algun salon que SI
--    aplique a alguno de los aforos pedidos.
-- ---------------------------------------------------------------------------
create or replace function fn_hay_material_sedes(
    p_telefono  text,
    p_aforos    int[],
    p_reenviar  boolean default false
) returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from medios m
        join precios_sedes p
          on p.sede_id = m.sede_id
         and p.capacidad_invitados = any(coalesce(p_aforos, '{}'::int[]))
        where m.activo
          and m.sede_id is not null
          and (coalesce(p_reenviar, false) or not exists (
                select 1
                from envios_medios e
                join leads  l  on l.id = e.lead_id
                join medios m2 on m2.id = e.medio_id
                where m2.sede_id = m.sede_id
                  and l.telefono = p_telefono
          ))
    );
$$;

comment on function fn_hay_material_sedes(text, int[], boolean) is
    'true si a este cliente le queda por recibir el video o la foto de algun '
    'salon que tenga precio para alguno de los aforos pedidos. Es la condicion '
    'que usa Guion Cotizacion para decidir si la antesala promete videos.';

-- ---------------------------------------------------------------------------
-- 2. fn_medios_sedes_cotizacion: el filtro exacto tambien con un solo aforo.
-- ---------------------------------------------------------------------------
create or replace function fn_medios_sedes_cotizacion(
    p_telefono  text,
    p_invitados text,
    p_reenviar  boolean default false
) returns table (
    id          uuid,
    tipo        text,
    url         text,
    caption     text,
    descripcion text
)
language plpgsql
stable
as $$
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
    -- EL FILTRO. Un join, no un `order by ... limit 1`: el salon que no tiene
    -- fila para el aforo pedido se cae aqui y no llega al select final.
    aforos_sede as (
        select e.id as medio_id, p.capacidad_invitados as aforo, p.precio_total
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
    -- Con un solo aforo el precio sale del mismo join filtrado: ya no hay
    -- "el escalon mas cercano", solo el escalon pedido.
    precio_unico as (
        select a.medio_id, a.precio_total, a.aforo
        from aforos_sede a
        where array_length(v_aforos, 1) = 1
    )
    select e.id,
           e.tipo,
           e.url,
           case
               when array_length(v_aforos, 1) = 1 then
                   fn_nombre_salon(s.nombre_sede)
                   || ' - valor PROMOCIONAL: $'
                   || replace(to_char(pu.precio_total, 'FM999,999,999'), ',', '.')
                   || ' - ' || pu.aforo || ' personas'
               else
                   fn_nombre_salon(s.nombre_sede) || ' - Disponible para ' || rm.aforos_texto || ' personas'
           end as caption,
           e.descripcion
    from elegido e
    join sedes s on s.id_sede = e.sede_id
    left join precio_unico  pu on pu.medio_id = e.id
    left join resumen_multi rm on rm.medio_id = e.id
    -- Con un aforo manda precio_unico; con varios, resumen_multi. En los dos
    -- casos, no estar ahi significa que el salon no aplica a lo que pidieron.
    where case when array_length(v_aforos, 1) = 1
               then pu.medio_id is not null
               else rm.medio_id is not null
          end
    order by (case when array_length(v_aforos, 1) = 1 then pu.precio_total end) nulls last,
             s.nombre_sede;
end;
$$;

comment on function fn_medios_sedes_cotizacion(text, text, boolean) is
    'Tanda de videos de la cotizacion. Solo devuelve los salones que tienen '
    'precio para el/los aforo(s) pedido(s): un salon que llega hasta 150 no '
    'sale en una cotizacion de 180. Con un aforo el caption lleva el precio; '
    'con varios, para cuales de los pedidos aplica.';

-- ---------------------------------------------------------------------------
-- 3. fn_lista_salones_valores: la misma regla en la tabla de precios en texto.
-- ---------------------------------------------------------------------------
create or replace function fn_lista_salones_valores(p_invitados int)
returns setof text
language plpgsql
stable
as $$
declare
    -- El MISMO redondeo que usa fn_medios_sedes_cotizacion. Si las dos reglas
    -- se separan, el precio del texto y el del caption discrepan para el mismo
    -- salon y el cliente ve dos verdades.
    v_escalon int := case
        when p_invitados is null or p_invitados <= 0 then null
        else least(200, greatest(50, (ceil(p_invitados / 10.0) * 10)::int))
    end;
    -- 600 caracteres: por debajo del "Leer mas" de WhatsApp y en linea con lo
    -- que ya mide el globo mas largo del guion del paquete (~480).
    c_tope constant int := 600;
    v_cabecera text;
    v_lineas   text[];
    v_intento  text[];
    v_mejor    text[];
    v_n        int;
    v_lo int; v_hi int; v_medio int;
begin
    if v_escalon is null then
        return;
    end if;

    v_cabecera := 'Estos son nuestros valores PROMOCIONALES para ' || v_escalon || ' personas ✨';

    select array_agg(t.linea order by t.precio, t.sede) into v_lineas
    from (
        select fn_nombre_salon(s.nombre_sede)
               || ' - $' || replace(to_char(pr.precio_total, 'FM999,999,999'), ',', '.') as linea,
               pr.precio_total as precio,
               s.nombre_sede   as sede
        from sedes s
        -- EL FILTRO, igual que arriba: join exacto contra el escalon pedido.
        -- El salon sin fila para ese aforo no aparece en la lista.
        join precios_sedes pr
          on pr.sede_id = s.id_sede
         and pr.capacidad_invitados = v_escalon
        -- Solo salones con material: de esta lista sale tambien el "escoge cual
        -- quieres volver a ver".
        where exists (
            select 1 from medios m where m.activo and m.sede_id = s.id_sede
        )
    ) t;

    if v_lineas is null then
        return;
    end if;

    -- Cuantos globos hacen falta como minimo...
    v_intento := fn_empaquetar_globos(v_cabecera, v_lineas, c_tope);
    if v_intento is null then
        -- Ninguna linea de precio se acerca a 600, asi que esto solo pasaria si
        -- alguien alarga muchisimo un nombre de sede. Mejor mandar el ladrillo
        -- que no mandar precios.
        return next v_cabecera || E'\n' || array_to_string(v_lineas, E'\n');
        return;
    end if;
    v_n := array_length(v_intento, 1);
    v_mejor := v_intento;

    -- ...y con ese numero fijo, el limite mas bajo que todavia los llena. Sin
    -- esta segunda vuelta el reparto sale a ojo y el ultimo globo queda con un
    -- renglon suelto: para 200 personas daba 593 caracteres y despues 24.
    v_lo := 1; v_hi := c_tope;
    while v_lo <= v_hi loop
        v_medio := (v_lo + v_hi) / 2;
        v_intento := fn_empaquetar_globos(v_cabecera, v_lineas, v_medio);
        if v_intento is not null and array_length(v_intento, 1) <= v_n then
            v_mejor := v_intento;
            v_hi := v_medio - 1;
        else
            v_lo := v_medio + 1;
        end if;
    end loop;

    return query select unnest(v_mejor);
end;
$$;

comment on function fn_lista_salones_valores(int) is
    'Tabla de precios en texto, ya partida en globos de WhatsApp. Solo lista '
    'los salones que tienen precio para ese aforo exacto.';
