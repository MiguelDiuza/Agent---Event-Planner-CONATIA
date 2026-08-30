-- Migración: Clasificación de sedes propias (Christian Sierra) vs sedes aliadas/externas
--
-- Sedes Propias (4 sedes):
--   - Casa Christian's Ciudad Jardín
--   - Sede Sur 66 Mundo Foto
--   - Sede Norte
--   - Sede Granada Gold
--
-- Sedes Aliadas / Externas (11 sedes restantes):
--   - Pilas Premium, Casa 4, Casa 5, Casa 74, Mansión Vallano,
--     Hacienda El Talismán, Marquez De Loyola, Sawa, Gran Salón,
--     Valdemoro, Orquideorama.
--
-- Para las sedes externas, el agente no confirma disponibilidad directa ni aparta
-- fecha en el calendario desde el chat; en su lugar, encamina la conversación
-- a la llamada o cita con el asesor (Turno 6) para que el asesor valide la fecha
-- directamente con la sede y le brinde la información.

-- 1. Agregar columna es_propia a la tabla sedes
alter table public.sedes add column if not exists es_propia boolean not null default false;

-- 2. Marcar las 4 sedes de Christian Sierra
update public.sedes set es_propia = false;

update public.sedes set es_propia = true
where nombre_sede in (
    'Casa Christian''s Ciudad Jardín',
    'Sede Sur 66 Mundo Foto',
    'Sede Norte',
    'Sede Granada Gold'
);

-- 3. Actualizar fn_verificar_disponibilidad_evento
create or replace function public.fn_verificar_disponibilidad_evento(p_nombre_sede text, p_fecha date)
returns table (resultado text)
language plpgsql
stable
as $$
declare
    v_hoy               date := (now() at time zone 'America/Bogota')::date;
    v_dias              int  := p_fecha - v_hoy;
    v_sede_id           uuid;
    v_sedes_encontradas int;
    v_es_propia         boolean;
    v_nombre_real       text;
    v_ocupada           boolean;
    v_proxima           date;
begin
    -- Año claramente mal tecleado (2036 por 2026): no depende de la sede
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

    select s.id_sede, s.es_propia, s.nombre_sede
      into v_sede_id, v_es_propia, v_nombre_real
    from sedes s
    where s.nombre_sede ilike '%' || p_nombre_sede || '%';

    -- Fecha que ya pasó
    if p_fecha < v_hoy then
        v_proxima := fn_proxima_fecha_disponible(v_sede_id, v_hoy + 5);
        return query select
            'FECHA QUE YA PASÓ. El cliente dijo el ' || fn_fecha_en_letras(p_fecha) ||
            ' y hoy es ' || fn_fecha_en_letras(v_hoy) ||
            ': esa fecha quedó atrás hace ' || (v_hoy - p_fecha)::text || ' días. ' ||
            'NO le confirmes disponibilidad, NO la apartes, y NO asumas ni le digas que se refiere al año que viene: dile con calidez que esa fecha ya pasó. ' ||
            'Lo que sí puedes hacer es preguntarle para qué fecha la quiere, que es lo que de verdad necesitas. ' ||
            case
                when v_proxima is not null and v_es_propia then
                    'Si te sirve de referencia, la fecha libre más próxima que tenemos en esa sede es el ' || fn_fecha_en_letras(v_proxima) ||
                    ', pero no se la impongas: primero pregúntale a él. ' ||
                    'Cuando te dé una fecha, vuelve a consultarme con esa fecha exacta.'
                else
                    'Pídele que te dé otra fecha y vuelve a consultarme con ella.'
            end
            as resultado;
        return;
    end if;

    -- SEDE EXTERNA / ALIADA (No es propia de Christian Sierra)
    if not coalesce(v_es_propia, false) then
        return query select
            'SEDE EXTERNA / ALIADA: ' || v_nombre_real || ' es un salón aliado (de terceros). ' ||
            'NO le des disponibilidad como segura ni ofrezcas separarla directamente por chat. ' ||
            'Explícale con calidez que como es un espacio exclusivo con agenda compartida, la disponibilidad exacta de su fecha (' || fn_fecha_en_letras(p_fecha) || ') y todos los detalles los confirma directamente el asesor en la llamada o cita. ' ||
            'Encamina de inmediato la conversación a agendar la llamada o cita (Turno 6) con el asesor para coordinar con la sede.';
        return;
    end if;

    -- SEDE PROPIA: Consultar agenda de reservas
    select bool_or(r.estado in ('separado', 'bloqueado_temporal')) into v_ocupada
    from agenda_reservas r
    where r.sede_id = v_sede_id
      and r.fecha_solicitada = p_fecha;

    if coalesce(v_ocupada, false) then
        return query select
            'OCUPADA. Esa fecha ya está tomada en esa sede. Ofrécele el fin de semana anterior o el siguiente, o la misma fecha en otra sede.';
        return;
    end if;

    -- Muy próxima (menos de 5 días)
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

comment on function fn_verificar_disponibilidad_evento(text, date) is
  'Verifica disponibilidad de una sede. Para sedes propias valida agenda; para sedes aliadas externas deriva la confirmación de fecha a la llamada/cita con el asesor.';
