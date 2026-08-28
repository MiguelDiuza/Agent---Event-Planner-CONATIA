-- No repetir la descripcion del paquete al recotizar el mismo evento
-- (2026-08-28).
--
-- EL PEDIDO DEL NEGOCIO
--
-- En pruebas reales por WhatsApp, un cliente pidio cotizar Matrimonio para
-- 50, 100 y 130 personas EN EL MISMO CHAT. Angie Otero mando la descripcion
-- completa del paquete (inclusiones + obsequios) TRES VECES -- una por cada
-- cantidad -- cuando esa informacion no depende del aforo.
--
-- La causa: `Guion Cotizacion` (ver 20260826000010_recotizar.sql) solo sabe
-- distinguir "primera vez" de "recotizacion" mirando si a la sede le queda
-- video sin mandar (`fn_medios_sedes_cotizacion` no vacio = primera vez). Ese
-- mecanismo se penso para el Turno 3 BIS -- evento DISTINTO en el mismo chat,
-- donde SI hay que repetir la descripcion porque es un paquete distinto --
-- pero no distingue eso de "mismo evento, otro aforo": cualquier llamada con
-- el mismo tipo_evento dispara de nuevo la antesala completa, porque esa
-- informacion nunca quedo registrada -- solo los videos se recuerdan
-- (`envios_medios`).
--
-- Los salones tampoco son los mismos en todos los aforos (confirmado en el
-- seed: Gran Salon/Valdemoro solo tienen precio desde 100 personas,
-- Orquideorama/Sawa desde 160), asi que la tabla de precios y los videos SI
-- deben variar por aforo -- lo unico que sobraba era repetir la descripcion.
--
-- LA REGLA NUEVA
--
--   1. Se registra, por (lead, tipo_evento), que aforos ya se cotizaron
--      (tabla `cotizaciones_aforos`, nueva).
--   2. La antesala + inclusiones + obsequios del paquete salen UNA sola vez
--      por tipo_evento y lead -- la primera vez que se cotiza, sea con uno o
--      con varios aforos a la vez. Si el tipo de evento ya se habia cotizado
--      antes (mismo evento, aforo nuevo -- o el Turno 3 BIS de un evento
--      realmente distinto que por error se repite), esa parte se omite.
--   3. Por cada aforo NUEVO en la llamada (no cotizado antes para ese
--      lead+evento) sale su propia tabla de precios en texto
--      (`fn_lista_salones_valores`, sin cambios), independientemente de si
--      quedan videos por mandar. Antes esa tabla solo salia si no habia
--      material -- eso era lo que dejaba a la cotizacion de 130 sin ningun
--      precio en texto cuando si habia videos nuevos por mandar.
--   4. `enviar_medios` acepta ahora varios aforos a la vez, separados por
--      coma ("50,100,130"), para cuando el cliente los pide todos juntos en
--      un mismo mensaje. Con UN solo aforo el resultado es identico a hoy.
--      Con varios, el caption de cada salon deja de llevar precio (ya va en
--      las tablas de texto) y pasa a decir para cuales de los aforos PEDIDOS
--      ese salon realmente tiene precio ("Disponible para 100 y 130
--      personas") -- si no tiene fila para NINGUNO de los aforos pedidos, ese
--      salon no se manda.
--
-- Las firmas viejas se DROPEAN antes de recrear, mismo motivo que en
-- 20260826000010_recotizar.sql: agregar parametros con default sin dropear
-- deja dos versiones vivas y una llamada con los parametros de antes queda
-- ambigua en tiempo de ejecucion.

-- ---------------------------------------------------------------------------
-- 1. cotizaciones_aforos: que (lead, tipo_evento, aforo) ya se cotizo.
-- ---------------------------------------------------------------------------
create table cotizaciones_aforos (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references leads(id) on delete cascade,
    tipo_evento_id uuid not null references tipos_evento(id_evento) on delete cascade,
    invitados int not null check (invitados between 50 and 200),
    created_at timestamptz not null default now(),
    unique (lead_id, tipo_evento_id, invitados)
);

create index idx_cotizaciones_aforos_lead_evento
    on cotizaciones_aforos (lead_id, tipo_evento_id);

comment on table cotizaciones_aforos is
    'Registro de que (lead, tipo de evento, aforo) ya recibio la cotizacion '
    'completa. Con esto Guion Cotizacion sabe si repetir la descripcion del '
    'paquete (tipo de evento nuevo para ese lead) o solo la tabla de precios '
    'del aforo nuevo (mismo evento, otro aforo).';

-- ---------------------------------------------------------------------------
-- 2. fn_registrar_cotizacion: side-effect deliberado -- inserta lo nuevo y
--    dice que ya estaba antes de esta llamada, por aforo y para el tipo de
--    evento completo.
-- ---------------------------------------------------------------------------
create or replace function fn_registrar_cotizacion(
    p_telefono    text,
    p_tipo_evento text,
    p_aforos      int[]
)
returns table (tipo_ya_cotizado boolean, aforo int, aforo_ya_cotizado boolean)
language plpgsql
as $fn$
declare
    v_lead_id          uuid;
    v_evento_id        uuid;
    v_tipo_ya_cotizado boolean;
begin
    select l.id into v_lead_id from leads l where l.telefono = p_telefono;
    if v_lead_id is null then
        return;
    end if;

    select te.id_evento into v_evento_id
    from tipos_evento te
    where te.nombre_paquete = fn_resolver_tipo_evento(p_tipo_evento);

    if v_evento_id is null then
        return;
    end if;

    select exists (
        select 1 from cotizaciones_aforos c
        where c.lead_id = v_lead_id and c.tipo_evento_id = v_evento_id
    ) into v_tipo_ya_cotizado;

    return query
    with entrada as (
        select distinct a as aforo
        from unnest(p_aforos) as a
        where a is not null
    ),
    marcado as (
        select e.aforo,
               exists (
                   select 1 from cotizaciones_aforos c
                   where c.lead_id = v_lead_id
                     and c.tipo_evento_id = v_evento_id
                     and c.invitados = e.aforo
               ) as ya_estaba
        from entrada e
    ),
    -- CTE que escribe: se ejecuta siempre, se lea o no su salida (mismo
    -- patron que `marcar` en 20260826000010_recotizar.sql).
    insertado as (
        insert into cotizaciones_aforos (lead_id, tipo_evento_id, invitados)
        select v_lead_id, v_evento_id, m.aforo
        from marcado m
        where not m.ya_estaba
        on conflict (lead_id, tipo_evento_id, invitados) do nothing
        returning 1
    )
    select v_tipo_ya_cotizado, m.aforo, m.ya_estaba
    from marcado m;
end;
$fn$;

comment on function fn_registrar_cotizacion(text, text, int[]) is
    'Registra los aforos nuevos de una cotizacion para (lead, tipo_evento) y '
    'devuelve, por cada aforo pedido, si ya estaba registrado antes de esta '
    'llamada -- y si el tipo de evento tenia CUALQUIER aforo cotizado antes. '
    'Efecto lateral deliberado.';

-- ---------------------------------------------------------------------------
-- 3. fn_medios_sedes_cotizacion: el 2do parametro pasa de int a text (CSV de
--    uno o varios aforos, redondeados a escalon de a 10 cada uno). Con un
--    solo aforo el resultado es identico al de antes. Con varios, el caption
--    cambia: sin precio (ya va en las tablas de texto del guion) y con la
--    lista de aforos pedidos que esa sede realmente tiene en precios_sedes.
-- ---------------------------------------------------------------------------
drop function if exists fn_medios_sedes_cotizacion(text, int, boolean);

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

    -- Escalones de 50 a 200 de a 10, redondeando hacia arriba, uno por cada
    -- numero separado por coma. "100" y "50,100,130" usan el mismo parseo.
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
        -- Una pieza por sede: el video si lo hay, la foto si no. Sin cambios
        -- respecto a la version anterior (20260826000008 / 20260826000010).
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
    -- De los aforos PEDIDOS, cuales tiene realmente cada sede elegida (fila
    -- exacta en precios_sedes -- sin "el mas cercano": si no esta, ese salon
    -- no aplica a ese aforo).
    aforos_sede as (
        select e.id as medio_id, p.capacidad_invitados as aforo, p.precio_total
        from elegido e
        join precios_sedes p
          on p.sede_id = e.sede_id
         and p.capacidad_invitados = any(v_aforos)
    ),
    resumen_multi as (
        select medio_id,
               string_agg(aforo::text, ' y ' order by aforo) as aforos_texto
        from aforos_sede
        group by medio_id
    ),
    -- Precio del unico aforo pedido, o el mas cercano si la sede no lo tiene
    -- exacto -- igual que antes, y solo aplica cuando hay un solo aforo.
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
    -- Con un solo aforo, todas las sedes elegidas entran (como antes: el
    -- precio mas cercano siempre existe). Con varios, solo las que de verdad
    -- tienen fila para al menos uno de los aforos pedidos.
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
    'pedidos ese salon tiene precio real (los precios van en las tablas de '
    'texto del guion). No repite lo que ese telefono ya recibio, salvo con '
    'p_reenviar = true.';

-- ---------------------------------------------------------------------------
-- Autoprueba. Si algo de esto deja de cumplirse, la migracion no aplica.
-- ---------------------------------------------------------------------------
do $test$
declare
    v_tel        text := 'test-multiaforo-' || gen_random_uuid()::text;
    v_lead       uuid;
    v_evento_id  uuid;
    v_n          int;
    v_primera    int;
    v_repetida   int;
    v_multi_row  record;
    v_sede_100_solo text;
    v_caption    text;
begin
    insert into leads (telefono, nombre, estado)
    values (v_tel, 'Prueba Multiaforo', 'nuevo')
    returning id into v_lead;

    select id_evento into v_evento_id from tipos_evento where nombre_paquete = 'Matrimonio';
    if v_evento_id is null then
        raise exception 'La autoprueba necesita el tipo de evento Matrimonio en el seed';
    end if;

    -- (a) Primera llamada, dos aforos nuevos (50 y 100): ninguno estaba
    -- registrado, y el tipo de evento tampoco.
    select count(*) into v_n
    from fn_registrar_cotizacion(v_tel, 'Matrimonio', array[50, 100])
    where not aforo_ya_cotizado;
    if v_n <> 2 then
        raise exception 'Primera llamada: esperaba 2 aforos nuevos, dio %', v_n;
    end if;
    if exists (
        select 1 from fn_registrar_cotizacion(v_tel, 'Matrimonio', array[50])
        where tipo_ya_cotizado is not true
    ) then
        raise exception 'Tras registrar Matrimonio, una nueva llamada deberia decir tipo_ya_cotizado = true';
    end if;

    -- (b) Repetir uno de los aforos ya registrados: no cuenta como nuevo.
    select aforo_ya_cotizado into strict v_multi_row
    from fn_registrar_cotizacion(v_tel, 'Matrimonio', array[50])
    limit 1;
    if not v_multi_row.aforo_ya_cotizado then
        raise exception 'El aforo 50 ya deberia estar registrado para este lead+evento';
    end if;

    -- (c) fn_medios_sedes_cotizacion con un solo aforo: caption con precio,
    -- igual que la version anterior.
    select count(*) into v_primera from fn_medios_sedes_cotizacion(v_tel, '100');
    if v_primera = 0 then
        raise exception 'La autoprueba necesita al menos un salon con material activo';
    end if;
    if exists (select 1 from fn_medios_sedes_cotizacion(v_tel, '100') where caption !~ '\$[0-9]') then
        raise exception 'Con un solo aforo, todos los captions deben llevar precio';
    end if;

    insert into envios_medios (lead_id, medio_id)
    select v_lead, f.id from fn_medios_sedes_cotizacion(v_tel, '100') f;

    select count(*) into v_repetida from fn_medios_sedes_cotizacion(v_tel, '100');
    if v_repetida <> 0 then
        raise exception 'El anti-repeticion se rompio: la segunda tanda devolvio % piezas', v_repetida;
    end if;

    -- (d) Un salon que solo aplica a UNO de dos aforos pedidos juntos: el
    -- caption solo nombra ese aforo, no el otro. Gran Salon solo tiene precio
    -- desde 100 personas (ver seed), asi que pedir 50 y 100 juntos para un
    -- telefono nuevo debe mencionarlo solo con 100.
    select s.nombre_sede into v_sede_100_solo
    from sedes s
    where not exists (select 1 from precios_sedes p where p.sede_id = s.id_sede and p.capacidad_invitados = 50)
      and exists (select 1 from precios_sedes p where p.sede_id = s.id_sede and p.capacidad_invitados = 100)
      and exists (select 1 from medios m where m.activo and m.sede_id = s.id_sede)
    limit 1;

    if v_sede_100_solo is not null then
        select f.caption into v_caption
        from fn_medios_sedes_cotizacion(v_tel || '-multi', '50,100') f
        join medios m on m.id = f.id
        join sedes s on s.id_sede = m.sede_id
        where s.nombre_sede = v_sede_100_solo;

        if v_caption is null then
            raise exception '% deberia salir al pedir 50 y 100 juntos (aplica a 100)', v_sede_100_solo;
        end if;
        if v_caption ~ '\$[0-9]' then
            raise exception 'Con varios aforos el caption no deberia llevar precio: %', v_caption;
        end if;
        if v_caption !~ '100' or v_caption ~ '\y50\y' then
            raise exception '% deberia decir "Disponible para 100 personas" (no 50): %', v_sede_100_solo, v_caption;
        end if;
    end if;

    delete from envios_medios where lead_id = v_lead;
    delete from cotizaciones_aforos where lead_id = v_lead;
    delete from leads where telefono in (v_tel, v_tel || '-multi');
end;
$test$;
