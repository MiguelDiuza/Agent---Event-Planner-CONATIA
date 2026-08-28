-- Fechas del evento: muy proximas y fechas que ya pasaron (2026-08-28).
--
-- EL PEDIDO DEL NEGOCIO
--
-- `verificar_disponibilidad_evento` (hasta hoy una query inline en el nodo de
-- n8n) cubria dos casos de manera distinta a como el negocio los quiere ahora:
--
--   1. FECHA MUY PROXIMA. La rama `dias_faltantes < 7` ya AFIRMABA
--      "DISPONIBLE PERO FALTAN SOLO N DIAS" y empujaba hacia una llamada antes
--      de confirmar detalles. El negocio quiere un paso ANTES de eso: con
--      menos de 5 dias, Angie no debe afirmar ni negar la fecha pedida --
--      debe encaminar primero hacia la llamada del Turno 6, y solo si el
--      cliente insiste en que sea lo antes posible, ofrecerle una fecha
--      concreta que si este libre, a partir de 5 dias desde hoy.
--   2. FECHA QUE YA PASO. La funcion asumia que el cliente se referia al
--      mismo dia del ano siguiente y se lo preguntaba. El negocio NO quiere
--      esa suposicion: quiere que Angie diga que esa fecha ya paso y ofrezca
--      directamente la fecha disponible mas proxima DE AHI EN ADELANTE,
--      revisando la agenda real de esa sede -- no "el mismo dia del ano que
--      viene" a ciegas.
--
-- Los dos casos comparten la misma pieza que faltaba: una funcion que busque
-- "la proxima fecha libre para esta sede desde tal dia". `agenda_reservas` ya
-- tiene todo lo necesario para calcularlo en SQL puro, sin Google Calendar --
-- es la misma tabla contra la que ya consultaba el nodo.
--
-- QUE CAMBIA AQUI
--
--   1. `fn_proxima_fecha_disponible(sede_id, desde)`: la primera fecha sin
--      fila 'separado' u 'ocupado_temporal' en agenda_reservas para esa sede,
--      buscando dia por dia desde `desde` (tope de 180 dias).
--   2. La query inline del nodo pasa a ser la funcion
--      `fn_verificar_disponibilidad_evento(nombre_sede, fecha)`, para poder
--      tener autoprueba como el resto de funciones del proyecto. El nodo
--      queda en un solo `select * from fn_verificar_disponibilidad_evento($1, $2::date)`.
--   3. La sede se resuelve PRIMERO (antes de mirar la fecha), para tener un
--      sede_id disponible en la rama de fecha pasada y en la de fecha muy
--      proxima. La unica excepcion es el chequeo de "ano tecleado mal" (mas
--      de 3 anos): no depende de la sede, asi que se evalua antes.
--
-- Las branches de "sede no encontrada", "varias sedes", "ocupada" y
-- "disponible" no cambian de fondo, solo se trasladan a la funcion.

-- ---------------------------------------------------------------------------
-- 1. fn_proxima_fecha_disponible
-- ---------------------------------------------------------------------------
create or replace function fn_proxima_fecha_disponible(
    p_sede_id uuid,
    p_desde   date
)
returns date
language sql
stable
as $fn$
    select d::date
    from generate_series(p_desde::timestamp, (p_desde + 180)::timestamp, interval '1 day') as d
    where not exists (
        select 1
        from agenda_reservas r
        where r.sede_id = p_sede_id
          and r.fecha_solicitada = d::date
          and r.estado in ('separado', 'bloqueado_temporal')
    )
    order by d
    limit 1
$fn$;

comment on function fn_proxima_fecha_disponible(uuid, date) is
    'Primera fecha, desde p_desde en adelante (tope 180 dias), sin reserva '
    '''separado'' ni ''bloqueado_temporal'' para esa sede. NULL si no '
    'encuentra ninguna en el rango.';

-- ---------------------------------------------------------------------------
-- 2. fn_verificar_disponibilidad_evento
-- ---------------------------------------------------------------------------
create or replace function fn_verificar_disponibilidad_evento(
    p_nombre_sede text,
    p_fecha       date
)
returns table (resultado text)
language plpgsql
stable
as $fn$
declare
    v_hoy               date := (now() at time zone 'America/Bogota')::date;
    v_dias              int  := p_fecha - v_hoy;
    v_sede_id           uuid;
    v_sedes_encontradas int;
    v_ocupada           boolean;
    v_proxima           date;
begin
    -- Ano claramente mal tecleado (2036 por 2026): no depende de la sede, se
    -- resuelve antes de tocar la tabla de sedes.
    if p_fecha > v_hoy + interval '3 years' then
        return query select
            'OJO CON EL AÑO. El cliente pidió el ' || fn_fecha_en_letras(p_fecha) ||
            ' y hoy es ' || fn_fecha_en_letras(v_hoy) ||
            ': faltan más de tres años, así que lo más probable es que el año se haya tecleado mal. ' ||
            'Pregúntaselo con calidez, sin decirle que se equivocó, y vuelve a consultarme con la fecha que te confirme.';
        return;
    end if;

    select count(distinct s.id_sede) into v_sedes_encontradas
    from sedes s
    where s.nombre_sede ilike '%' || p_nombre_sede || '%';

    if v_sedes_encontradas = 0 then
        return query select
            'No encontré ninguna sede con ese nombre. Reintenta con el nombre_sede exacto que te devolvió consultar_precios_sedes.';
        return;
    end if;

    if v_sedes_encontradas > 1 then
        return query select
            'Ese nombre coincide con varias sedes. Pregúntale al cliente cuál de ellas y vuelve a consultar con el nombre exacto.';
        return;
    end if;

    select s.id_sede into v_sede_id
    from sedes s
    where s.nombre_sede ilike '%' || p_nombre_sede || '%';

    -- Fecha que ya paso. Ya NO se asume "el ano que viene": se ofrece la
    -- proxima fecha libre real de esta sede, revisando agenda_reservas.
    if p_fecha < v_hoy then
        v_proxima := fn_proxima_fecha_disponible(v_sede_id, v_hoy);
        return query select
            'FECHA QUE YA PASÓ. El cliente dijo el ' || fn_fecha_en_letras(p_fecha) ||
            ' y hoy es ' || fn_fecha_en_letras(v_hoy) ||
            ': esa fecha quedó atrás hace ' || (v_hoy - p_fecha)::text || ' días. ' ||
            'NO le confirmes disponibilidad, NO la apartes, y NO asumas ni le digas que se refiere al año que viene: dile con calidez que esa fecha ya pasó. ' ||
            case
                when v_proxima is not null then
                    'Ofrécele la fecha disponible más próxima que sí tenemos en esa sede: ' || fn_fecha_en_letras(v_proxima) || '. ' ||
                    'Si la acepta, vuelve a consultarme con esa fecha exacta para confirmarla. Si prefiere otra fecha, consulta la que te dé.'
                else
                    'No encontré ninguna fecha libre próxima en esa sede: pídele que te dé otra fecha y vuelve a consultarme con ella.'
            end
            as resultado;
        return;
    end if;

    select bool_or(r.estado in ('separado', 'bloqueado_temporal')) into v_ocupada
    from agenda_reservas r
    where r.sede_id = v_sede_id
      and r.fecha_solicitada = p_fecha;

    if coalesce(v_ocupada, false) then
        return query select
            'OCUPADA. Esa fecha ya está tomada en esa sede. Ofrécele el fin de semana anterior o el siguiente, o la misma fecha en otra sede.';
        return;
    end if;

    -- Muy proxima (menos de 5 dias): ya NO se afirma "DISPONIBLE". Se
    -- encamina hacia la llamada del Turno 6, y solo si el cliente insiste en
    -- que sea lo antes posible, se ofrece una fecha alterna que si este
    -- libre, a partir de 5 dias desde hoy.
    if v_dias < 5 then
        v_proxima := fn_proxima_fecha_disponible(v_sede_id, v_hoy + 5);
        return query select
            'MUY PRÓXIMA: el cliente pidió el ' || fn_fecha_en_letras(p_fecha) || ', a ' || v_dias::text ||
            ' día(s) de hoy. NO le confirmes ni le niegues si esa fecha está libre u ocupada en esa sede -- no se lo digas todavía. ' ||
            'En vez de eso, encamina la conversación hacia agendar una llamada o visita con un asesor (Turno 6): con tan poca anticipación hay que cuadrar personal y montaje en persona o por teléfono, eso no se cierra por chat. ' ||
            case
                when v_proxima is not null then
                    'Si el cliente insiste en que sea lo antes posible, puedes ofrecerle como alternativa el ' || fn_fecha_en_letras(v_proxima) ||
                    ', que sí está libre en esa sede. Si la acepta, vuelve a consultarme con esa fecha exacta para confirmarla, y usa separar_fecha_evento si quiere asegurarla desde ya. ' ||
                    'Si no le sirve esa fecha, sigue proponiéndole la llamada, o pregúntale por otra fecha cercana, para no perder la venta.'
                else
                    'No encontré otra fecha libre próxima en esa sede para ofrecerle como alternativa: sigue proponiéndole la llamada.'
            end ||
            ' Habla siempre en primera persona: eres tú quien lo llama y quien lo recibe, no derives a nadie más.'
            as resultado;
        return;
    end if;

    return query select
        'DISPONIBLE. Confírmale que la fecha está libre en esa sede y aprovecha para cerrar: en temporada alta los espacios se llenan rápido.';
end;
$fn$;

comment on function fn_verificar_disponibilidad_evento(text, date) is
    'Disponibilidad de la fecha del EVENTO en una sede. Devuelve un unico '
    'texto ya armado para el agente: sede no encontrada / ambigua, ano mal '
    'tecleado, fecha ya pasada (con la proxima libre real), ocupada, muy '
    'proxima (menos de 5 dias, con alternativa >= 5 dias si hay), o '
    'disponible.';

-- ---------------------------------------------------------------------------
-- Autoprueba. Si algo de esto deja de cumplirse, la migracion no aplica.
-- ---------------------------------------------------------------------------
do $test$
declare
    v_sede_id   uuid;
    v_sede_nombre text := 'ZZZ Autoprueba Fecha Evento ' || substr(gen_random_uuid()::text, 1, 8);
    v_hoy       date := (now() at time zone 'America/Bogota')::date;
    v_msg       text;
    v_proxima   date;
begin
    -- Sede DESECHABLE, propia de esta autoprueba: nunca se toca una sede ni
    -- una reserva real. Se borra completa al final.
    insert into sedes (nombre_sede) values (v_sede_nombre)
    returning id_sede into v_sede_id;

    -- (a) Fecha que ya paso: NO debe mencionar "año que viene", y debe traer
    -- una fecha proxima real (hoy mismo, porque la sede quedo despejada).
    select resultado into v_msg
    from fn_verificar_disponibilidad_evento(v_sede_nombre, v_hoy - 3);
    if v_msg !~ 'FECHA QUE YA PASÓ' then
        raise exception 'Fecha pasada: esperaba "FECHA QUE YA PASÓ", salió: %', v_msg;
    end if;
    if v_msg ~ '¿me estás hablando del' or v_msg ~ 'te estás refiriendo al' then
        raise exception 'Fecha pasada: no debía preguntar si se refería al año siguiente: %', v_msg;
    end if;
    if v_msg !~ fn_fecha_en_letras(v_hoy) then
        raise exception 'Fecha pasada: esperaba la próxima fecha libre real (%) en el mensaje: %', v_hoy, v_msg;
    end if;

    -- (b) Muy proxima (manana, dia 1): NO debe decir DISPONIBLE a secas, y
    -- debe traer una alternativa >= hoy+5 que si este libre.
    select resultado into v_msg
    from fn_verificar_disponibilidad_evento(v_sede_nombre, v_hoy + 1);
    if v_msg !~ 'MUY PRÓXIMA' then
        raise exception 'Muy próxima: esperaba "MUY PRÓXIMA", salió: %', v_msg;
    end if;
    if v_msg ~ '^DISPONIBLE\.' then
        raise exception 'Muy próxima: no debía afirmar DISPONIBLE a secas: %', v_msg;
    end if;
    if v_msg !~ fn_fecha_en_letras(v_hoy + 5) then
        raise exception 'Muy próxima: esperaba la alternativa (%) en el mensaje: %', v_hoy + 5, v_msg;
    end if;

    -- (c) Disponible de verdad (10 dias, libre): sigue diciendo DISPONIBLE.
    select resultado into v_msg
    from fn_verificar_disponibilidad_evento(v_sede_nombre, v_hoy + 10);
    if v_msg !~ '^DISPONIBLE\.' then
        raise exception 'Disponible: esperaba "DISPONIBLE.", salió: %', v_msg;
    end if;

    -- (d) Ocupada: se marca la misma fecha como separada y se vuelve a
    -- consultar.
    insert into agenda_reservas (sede_id, fecha_solicitada, estado)
    values (v_sede_id, v_hoy + 10, 'separado');

    select resultado into v_msg
    from fn_verificar_disponibilidad_evento(v_sede_nombre, v_hoy + 10);
    if v_msg !~ '^OCUPADA\.' then
        raise exception 'Ocupada: esperaba "OCUPADA.", salió: %', v_msg;
    end if;

    -- (e) Ano tecleado mal (mas de 3 anos).
    select resultado into v_msg
    from fn_verificar_disponibilidad_evento(v_sede_nombre, (v_hoy + interval '4 years')::date);
    if v_msg !~ 'OJO CON EL AÑO' then
        raise exception 'Año lejano: esperaba "OJO CON EL AÑO", salió: %', v_msg;
    end if;

    -- (f) Sede inexistente.
    select resultado into v_msg
    from fn_verificar_disponibilidad_evento('Salón Que No Existe Nunca Jamás', v_hoy + 10);
    if v_msg !~ 'No encontré ninguna sede' then
        raise exception 'Sede inexistente: salió: %', v_msg;
    end if;

    -- (g) fn_proxima_fecha_disponible salta los dias ocupados: se ocupan
    -- hoy, hoy+1 y hoy+2, y la proxima libre tiene que caer despues.
    insert into agenda_reservas (sede_id, fecha_solicitada, estado)
    select v_sede_id, d::date, 'separado'
    from generate_series(v_hoy::timestamp, (v_hoy + 2)::timestamp, interval '1 day') as d;

    select fn_proxima_fecha_disponible(v_sede_id, v_hoy) into v_proxima;
    if v_proxima is null or v_proxima <= v_hoy + 2 then
        raise exception 'fn_proxima_fecha_disponible no saltó los días ocupados: devolvió %', v_proxima;
    end if;

    -- Limpieza: la sede era desechable, se borra completa (agenda_reservas
    -- primero, por la referencia).
    delete from agenda_reservas where sede_id = v_sede_id;
    delete from sedes where id_sede = v_sede_id;
end;
$test$;
