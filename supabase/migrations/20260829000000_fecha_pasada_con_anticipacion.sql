-- La fecha alterna que se ofrece cuando la que pidió el cliente ya pasó.
--
-- EL PROBLEMA (chat real, 2026-08-29). El cliente pidió el 20 de agosto y hoy
-- es 29 de agosto. La herramienta le contestó, textual:
--
--     "para el Salón Marquez De Loyola tenemos disponibilidad para hoy mismo,
--      sábado 29 de agosto de 2026, por si quieres aprovecharla"
--
-- Ofrecerle a alguien que celebre los quince de su hija HOY no es una
-- alternativa: es una respuesta que delata que del otro lado no hay nadie
-- pensando. Y la propia función se contradecía dos ramas más abajo: si el
-- cliente aceptaba esa fecha y volvía a consultar, caía en `v_dias < 5` y ahí
-- se le decía que con tan poca anticipación NO se puede confirmar por chat.
-- O sea que la rama de fecha pasada ofrecía justo lo que la de fecha próxima
-- prohíbe.
--
-- La causa es una sola letra de más en el argumento: se buscaba la próxima
-- fecha libre desde `v_hoy`, cuando el resto de la función ya tenía decidido
-- que el mínimo real de anticipación son 5 días. Se alinean las dos.
create or replace function fn_verificar_disponibilidad_evento(p_nombre_sede text, p_fecha date)
returns table (resultado text)
language plpgsql
stable
as $$
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
    -- proxima fecha libre real de esta sede.
    --
    -- Desde `v_hoy + 5` y no desde `v_hoy`: un evento no se monta en menos de
    -- eso, y es el mismo piso que usa la rama de `v_dias < 5`. Ver el
    -- comentario de cabecera.
    if p_fecha < v_hoy then
        v_proxima := fn_proxima_fecha_disponible(v_sede_id, v_hoy + 5);
        return query select
            'FECHA QUE YA PASÓ. El cliente dijo el ' || fn_fecha_en_letras(p_fecha) ||
            ' y hoy es ' || fn_fecha_en_letras(v_hoy) ||
            ': esa fecha quedó atrás hace ' || (v_hoy - p_fecha)::text || ' días. ' ||
            'NO le confirmes disponibilidad, NO la apartes, y NO asumas ni le digas que se refiere al año que viene: dile con calidez que esa fecha ya pasó. ' ||
            'Lo que sí puedes hacer es preguntarle para qué fecha la quiere, que es lo que de verdad necesitas. ' ||
            case
                when v_proxima is not null then
                    'Si te sirve de referencia, la fecha libre más próxima que tenemos en esa sede es el ' || fn_fecha_en_letras(v_proxima) ||
                    ', pero no se la impongas: primero pregúntale a él. ' ||
                    'Cuando te dé una fecha, vuelve a consultarme con esa fecha exacta.'
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
$$;
