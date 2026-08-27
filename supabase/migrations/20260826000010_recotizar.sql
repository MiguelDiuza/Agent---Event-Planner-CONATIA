-- Volver a cotizar en el mismo chat, y reenviar material a pedido (2026-08-27).
--
-- EL PEDIDO DEL NEGOCIO
--
-- Un cliente no siempre trae un solo evento. Pregunta por los 15 de la hija, y
-- tres mensajes despues por la boda del hermano, o vuelve otro dia con algo
-- distinto. Hasta hoy la SEGUNDA cotizacion no salia: `Guion Cotizacion`
-- terminaba en
--
--     and exists (select 1 from fn_medios_sedes_cotizacion($3, null))
--
-- o sea, "solo mando el texto si detras va a salir un video". Como los videos
-- no se repiten -- y esta bien que no se repitan, son 14 archivos pesados que
-- el cliente ya tiene en el hilo -- la condicion se volvia falsa apenas salia
-- la primera tanda, y el cliente se quedaba SIN cotizacion para su segundo
-- evento. La falla era muda: cero filas, ningun error, y el agente contestando
-- de memoria.
--
-- La regla nueva es la que pidio el negocio: **la cotizacion se puede repetir,
-- los videos no**. Cada vez que el cliente pide cotizar algo, la cotizacion
-- sale completa, como si no hubiera una anterior. Los videos salen una sola
-- vez, salvo que el cliente pida expresamente que se los reenvien.
--
-- QUE CAMBIA AQUI
--
--   1. `p_reenviar` en las dos funciones que eligen material. Cuando viene en
--      true se saltan el `not exists` sobre `envios_medios`, que es justo lo
--      que el documento de estado dejaba anotado como "decision implicita que
--      se puede revertir". `envios_medios` nunca tuvo unique (lead_id,
--      medio_id) -- guarda historial, no estado -- asi que un reenvio queda
--      registrado como una fila mas, sin reventar.
--
--   2. `fn_lista_salones_valores`. En una recotizacion no salen videos, y los
--      precios viajaban PEGADOS a los videos: la segunda cotizacion habria
--      salido sin un solo numero. Esta funcion arma la lista de salones con su
--      valor PROMOCIONAL para la cantidad de personas del evento nuevo, ya
--      partida en globos que WhatsApp no colapsa con "Leer mas". Es tambien la
--      lista con la que el cliente elige que salon quiere volver a ver.
--
--   3. Un fallo que ya estaba vivo y que atrapo la autoprueba de aqui abajo: el
--      anti-repeticion de la tanda miraba la PIEZA y no el SALON, asi que una
--      sede con video Y foto -- hoy Pilas Premium -- mandaba el video en la
--      primera tanda y la foto del mismo salon en la segunda. Detalle en el
--      comentario del `not exists` de fn_medios_sedes_cotizacion.
--
-- Las firmas viejas se DROPEAN antes de recrear. Agregar un parametro con
-- default sin dropear deja las dos versiones vivas, y una llamada con los
-- parametros de antes queda ambigua ("function is not unique"): un error en
-- ejecucion, no al aplicar la migracion, que es la peor forma de descubrirlo.

-- ---------------------------------------------------------------------------
-- 1. fn_medios_para_enviar: mismo cuerpo de 20260814000008 + p_reenviar.
-- ---------------------------------------------------------------------------
drop function if exists fn_medios_para_enviar(text, text, text, text);

create or replace function fn_medios_para_enviar(
    p_categoria  text,
    p_referencia text,
    p_telefono   text,
    p_tipo_medio text default 'ambos',
    p_reenviar   boolean default false
)
returns table (id uuid, tipo text, url text, caption text, descripcion text)
language plpgsql
stable
as $$
declare
    v_categoria  text := lower(btrim(coalesce(p_categoria, '')));
    v_tipo_medio text := lower(btrim(coalesce(p_tipo_medio, '')));
    v_referencia text := btrim(coalesce(p_referencia, ''));
    v_reenviar   boolean := coalesce(p_reenviar, false);
    -- Escape de metacaracteres LIKE: la referencia viene de un LLM que relaya
    -- mensajes de desconocidos. Sin esto, un '%' convierte "busca una sede" en
    -- "devuelve todas". Backslash primero, luego % y _.
    v_patron text := '%' ||
        replace(replace(replace(v_referencia, '\', '\\'), '%', '\%'), '_', '\_')
        || '%';
begin
    if v_categoria not in ('sede', 'tipo_evento', 'servicio', 'institucional') then
        raise exception
            'p_categoria invalida: %. Valores aceptados: sede, tipo_evento, servicio, institucional.',
            coalesce(quote_literal(p_categoria), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_para_enviar(categoria, referencia, telefono, tipo_medio, reenviar).';
    end if;

    if v_tipo_medio not in ('imagen', 'video', 'ambos') then
        raise exception
            'p_tipo_medio invalido: %. Valores aceptados: imagen, video, ambos.',
            coalesce(quote_literal(p_tipo_medio), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_para_enviar(categoria, referencia, telefono, tipo_medio, reenviar).';
    end if;

    -- Sin telefono utilizable no hay forma de saber que vio ya este cliente.
    -- Devolver material seria reenviarlo a ciegas; se devuelve nada. Vale
    -- tambien con p_reenviar: sin telefono `fn_registrar_envio` no inserta y
    -- el envio quedaria fuera de la bitacora.
    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    return query
    select m.id, m.tipo, m.url, m.caption, m.descripcion
    from medios m
    where m.activo
      and (v_tipo_medio = 'ambos' or m.tipo = v_tipo_medio)
      -- Si la referencia no existe, la subconsulta da NULL, la comparacion da
      -- NULL y no sale ninguna fila: el caso de error se resuelve sin logica
      -- adicional. El orden prefiere coincidencias exactas, luego nombres
      -- cortos (mas probable que sean el registro concreto), luego alfabetico.
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
      -- El anti-repeticion. Es la regla por defecto, y solo la levanta un
      -- pedido explicito del cliente que el agente traduce en p_reenviar.
      and (v_reenviar or not exists (
            select 1 from envios_medios e
            join leads l on l.id = e.lead_id
            where e.medio_id = m.id and l.telefono = p_telefono
      ))
    order by m.orden, m.created_at, m.id
    limit 3;
end;
$$;

comment on function fn_medios_para_enviar(text, text, text, text, boolean) is
    'Material activo de esa referencia que este telefono todavia no recibio, '
    'maximo 3 piezas. Con p_reenviar = true devuelve tambien lo ya enviado: es '
    'para cuando el cliente pide expresamente que le reenvien algo.';

-- ---------------------------------------------------------------------------
-- 2. fn_medios_sedes_cotizacion: mismo cuerpo de 20260826000008 + p_reenviar.
-- ---------------------------------------------------------------------------
drop function if exists fn_medios_sedes_cotizacion(text, int);

create or replace function fn_medios_sedes_cotizacion(
    p_telefono  text,
    p_invitados int default null,
    p_reenviar  boolean default false
)
returns table (id uuid, tipo text, url text, caption text, descripcion text)
language plpgsql
stable
as $fn$
declare
    -- Escalones de 50 a 200 de a 10, redondeando hacia arriba: 55 -> 60. Fuera
    -- de rango se pega al extremo, que es lo que hace el agente a mano hoy.
    v_escalon int := case
        when p_invitados is null or p_invitados <= 0 then null
        else least(200, greatest(50, (ceil(p_invitados / 10.0) * 10)::int))
    end;
    v_reenviar boolean := coalesce(p_reenviar, false);
begin
    -- Sin telefono no hay a quien enviarle ni con que filtrar lo ya enviado.
    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    return query
    with elegido as (
        -- Una pieza por sede: el video si lo hay, la foto si no.
        select distinct on (m.sede_id)
               m.id, m.tipo, m.url, m.descripcion, m.sede_id
        from medios m
        where m.activo
          and m.sede_id is not null
          -- Anti-repeticion POR SALON, no por pieza. Lo atrapo la autoprueba de
          -- esta misma migracion, y es un fallo que ya estaba vivo: desde
          -- 20260826000008 la tanda elige `distinct on (sede_id)` el video y,
          -- si no hay, la foto. Filtrando por PIEZA, una sede con video Y foto
          -- -- hoy Pilas Premium -- mandaba el video en la primera tanda y la
          -- FOTO DEL MISMO SALON en la segunda, porque esa foto no figuraba
          -- como enviada. La tanda manda una pieza por salon: si el cliente ya
          -- vio ese salon, el salon entero queda fuera.
          and (v_reenviar or not exists (
                select 1
                from envios_medios e
                join leads  l  on l.id = e.lead_id
                join medios m2 on m2.id = e.medio_id
                where m2.sede_id = m.sede_id
                  and l.telefono = p_telefono
          ))
        order by m.sede_id, (m.tipo = 'video') desc, m.orden, m.created_at
    )
    select e.id,
           e.tipo,
           e.url,
           fn_nombre_salon(s.nombre_sede)
             || coalesce(
                    ' - valor PROMOCIONAL: $'
                    || replace(to_char(pr.precio_total, 'FM999,999,999'), ',', '.')
                    || ' - '
                    -- Cuando la sede no tiene ese escalon, el precio es el del
                    -- escalon mas cercano y la linea lo dice. Callarlo seria
                    -- cotizar un salon que no le cabe.
                    || case
                           when pr.capacidad_invitados = v_escalon
                               then pr.capacidad_invitados || ' personas'
                           when pr.capacidad_invitados < v_escalon
                               then 'hasta ' || pr.capacidad_invitados || ' personas'
                           else 'desde ' || pr.capacidad_invitados || ' personas'
                       end,
                    ''
                ) as caption,
           e.descripcion
    from elegido e
    join sedes s on s.id_sede = e.sede_id
    -- Precio del escalon del cliente; si la sede no lo tiene, el mas cercano.
    left join lateral (
        select p.precio_total, p.capacidad_invitados
        from precios_sedes p
        where p.sede_id = s.id_sede
          and v_escalon is not null
        order by (p.capacidad_invitados = v_escalon) desc,
                 abs(p.capacidad_invitados - v_escalon),
                 p.capacidad_invitados
        limit 1
    ) pr on true
    -- De la mas economica a la mas cara: es como se lee una lista de precios, y
    -- es como se presenta a mano. Sin precio (sin invitados) van al final.
    order by pr.precio_total nulls last, s.nombre_sede;
end;
$fn$;

comment on function fn_medios_sedes_cotizacion(text, int, boolean) is
    'Una pieza por salon con material cargado -- el video si lo hay, la foto si '
    'no -- con el nombre del salon, el valor PROMOCIONAL y la cantidad de '
    'personas ya escritos en el caption. No repite lo que ese telefono ya '
    'recibio, salvo con p_reenviar = true.';

-- ---------------------------------------------------------------------------
-- 3. fn_lista_salones_valores: los precios cuando no hay videos que los lleven.
-- ---------------------------------------------------------------------------
-- En la primera tanda el precio de cada salon viaja en el caption de su video.
-- En una recotizacion no salen videos, asi que el precio tiene que ir en texto
-- o la cotizacion sale sin un solo numero.
--
-- Sirve para dos cosas a la vez, y por eso lista solo salones CON material:
--   * decirle al cliente cuanto vale cada salon para la cantidad de personas
--     del evento nuevo;
--   * ser la lista de la que elige cual quiere volver a ver cuando pide videos.
--     Ofrecerle un salon del que no hay archivo seria prometer algo que no se
--     puede cumplir (hoy es el caso de Casa 5).
--
-- Devuelve globos, no un ladrillo: WhatsApp le pone "Leer mas" a un mensaje
-- largo y esconde justo la mitad de los precios. El corte cae siempre entre
-- lineas enteras, nunca dentro de una.

-- Reparte lineas en globos sin partir ninguna, con la cabecera ya dentro del
-- primero. NULL si alguna linea suelta -- o la cabecera -- no cabe en el limite.
-- Es el mismo empaquetado que hace scripts/guion-cotizacion.js con el guion del
-- paquete, y esta aparte para poder buscar el limite mas bajo por biseccion.
create or replace function fn_empaquetar_globos(
    p_cabecera text,
    p_lineas   text[],
    p_limite   int
)
returns text[]
language plpgsql
immutable
as $fn$
declare
    v_out   text[] := array[p_cabecera];
    v_linea text;
    v_ult   int;
begin
    if length(p_cabecera) > p_limite then
        return null;
    end if;

    foreach v_linea in array p_lineas loop
        v_ult := array_length(v_out, 1);
        if length(v_out[v_ult]) + 1 + length(v_linea) <= p_limite then
            v_out[v_ult] := v_out[v_ult] || E'\n' || v_linea;
        elsif length(v_linea) <= p_limite then
            v_out := v_out || v_linea;
        else
            return null;
        end if;
    end loop;

    return v_out;
end;
$fn$;

comment on function fn_empaquetar_globos(text, text[], int) is
    'Reparte lineas en globos de WhatsApp sin partir ninguna. NULL si alguna no '
    'cabe en el limite.';

create or replace function fn_lista_salones_valores(p_invitados int)
returns setof text
language plpgsql
stable
as $fn$
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
               || ' - $' || replace(to_char(pr.precio_total, 'FM999,999,999'), ',', '.')
               || case
                      when pr.capacidad_invitados = v_escalon then ''
                      when pr.capacidad_invitados < v_escalon
                          then ' (hasta ' || pr.capacidad_invitados || ' personas)'
                      else ' (desde ' || pr.capacidad_invitados || ' personas)'
                  end as linea,
               pr.precio_total as precio,
               s.nombre_sede   as sede
        from sedes s
        join lateral (
            select p.precio_total, p.capacidad_invitados
            from precios_sedes p
            where p.sede_id = s.id_sede
            order by (p.capacidad_invitados = v_escalon) desc,
                     abs(p.capacidad_invitados - v_escalon),
                     p.capacidad_invitados
            limit 1
        ) pr on true
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
$fn$;

comment on function fn_lista_salones_valores(int) is
    'Los valores PROMOCIONALES de cada salon CON material, para la cantidad de '
    'personas dada, ya partidos en globos de WhatsApp. Reemplaza a los captions '
    'cuando la cotizacion sale sin videos, y es la lista de la que el cliente '
    'elige que salon quiere volver a ver.';

-- ---------------------------------------------------------------------------
-- Autoprueba. Si algo de esto deja de cumplirse, la migracion no aplica.
-- ---------------------------------------------------------------------------
do $test$
declare
    v_tel      text := 'test-recotizar-' || gen_random_uuid()::text;
    v_lead     uuid;
    v_primera  int;
    v_segunda  int;
    v_forzada  int;
    v_globos   int;
    v_largo    int;
    v_sin_prec int;
    v_sede     text;
    v_min_lineas int;
begin
    insert into leads (telefono, nombre, estado)
    values (v_tel, 'Prueba Recotizar', 'nuevo')
    returning id into v_lead;

    -- Primera tanda: sale todo el material de salones que haya.
    select count(*) into v_primera from fn_medios_sedes_cotizacion(v_tel, 100);
    if v_primera = 0 then
        raise exception 'La autoprueba necesita al menos un salon con material activo';
    end if;

    insert into envios_medios (lead_id, medio_id)
    select v_lead, f.id from fn_medios_sedes_cotizacion(v_tel, 100) f;

    -- Segunda vuelta sin forzar: nada. Es la regla que NO cambia.
    select count(*) into v_segunda from fn_medios_sedes_cotizacion(v_tel, 100);
    if v_segunda <> 0 then
        raise exception 'El anti-repeticion se rompio: la segunda tanda devolvio % piezas', v_segunda;
    end if;

    -- Y con p_reenviar = true vuelve todo. Es lo que hace posible el reenvio.
    select count(*) into v_forzada from fn_medios_sedes_cotizacion(v_tel, 100, true);
    if v_forzada <> v_primera then
        raise exception 'p_reenviar no devolvio la tanda completa: % de %', v_forzada, v_primera;
    end if;

    -- Lo mismo para el envio suelto, que es el "mandame solo ese salon". Se
    -- elige una sede con UNA sola pieza activa: de esa, la tanda ya mando todo
    -- lo que hay, asi que sin p_reenviar tiene que dar cero.
    select s.nombre_sede into v_sede
      from sedes s
     where (select count(*) from medios m where m.activo and m.sede_id = s.id_sede) = 1
     order by s.nombre_sede
     limit 1;

    if v_sede is not null then
        if exists (select 1 from fn_medios_para_enviar('sede', v_sede, v_tel, 'ambos')) then
            raise exception 'fn_medios_para_enviar repitio material ya enviado de %', v_sede;
        end if;
        if not exists (select 1 from fn_medios_para_enviar('sede', v_sede, v_tel, 'ambos', true)) then
            raise exception 'fn_medios_para_enviar con p_reenviar no devolvio el material de %', v_sede;
        end if;
    end if;

    -- La lista de valores: al menos un globo, ninguno pasado de 600, y todas
    -- las lineas con precio (un globo sin cifra es una cotizacion muda).
    select count(*), max(length(x)) into v_globos, v_largo
      from fn_lista_salones_valores(100) x;
    if v_globos = 0 then
        raise exception 'fn_lista_salones_valores(100) no devolvio ningun globo';
    end if;
    if v_largo > 600 then
        raise exception 'fn_lista_salones_valores devolvio un globo de % caracteres', v_largo;
    end if;
    select count(*) into v_sin_prec
      from fn_lista_salones_valores(100) x
      where x !~ '\$[0-9]';
    if v_sin_prec > 0 then
        raise exception 'fn_lista_salones_valores devolvio % globos sin ningun precio', v_sin_prec;
    end if;

    -- Y el reparto tiene que quedar parejo. Con 200 personas la lista pasa de
    -- 600 y va en dos globos: si el segundo trae un solo renglon, el
    -- empaquetado volvio a repartir a ojo.
    select min(n_lineas) into v_min_lineas
      from (select length(x) - length(replace(x, E'\n', '')) + 1 as n_lineas
              from fn_lista_salones_valores(200) x) t;
    select count(*) into v_globos from fn_lista_salones_valores(200) x;
    if v_globos > 1 and v_min_lineas < 2 then
        raise exception 'fn_lista_salones_valores dejo un globo de un solo renglon';
    end if;

    -- Sin cantidad de personas no hay lista: es preferible callar a inventar un
    -- escalon.
    if exists (select 1 from fn_lista_salones_valores(null)) then
        raise exception 'fn_lista_salones_valores(null) deberia devolver cero globos';
    end if;

    delete from envios_medios where lead_id = v_lead;
    delete from leads where id = v_lead;
end;
$test$;
