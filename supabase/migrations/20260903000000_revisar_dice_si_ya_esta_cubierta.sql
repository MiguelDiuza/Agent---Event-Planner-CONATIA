-- La pestaña `Revisar` tiene que distinguir un dedazo de un agujero.
--
-- POR QUE. La primera corrida de verdad dejó siete filas ahí, todas con la
-- misma pinta: "el día de la semana no cuadra con la fecha". Leídas así, las
-- siete parecen igual de graves. No lo son -- se comprobó a mano contra la
-- base:
--
--   seis de las siete YA ESTAN en la agenda. La fecha entró con la carga del
--   2026-09-01 y lo único torcido es cómo está escrita la celda. No hay nada
--   que proteger.
--
--   una NO esta: `2027`!54, LILIBETH RAMIREZ, sin salón escrito. Esa sí es una
--   venta que el agente no ve.
--
-- Esa comprobación la hizo una persona con una consulta a mano, y no se puede
-- pedir eso cada quince minutos. Si la lista no dice cuál es cuál, o se revisan
-- las siete cada vez -- y se dejan de revisar a la tercera semana -- o se pasa
-- por alto la única que importa. Una lista de alarmas donde casi todo es ruido
-- deja de leerse, y entonces no avisa de nada.
--
-- Así que cada rechazo se lleva al lado lo que la base sabe de ese cliente.

create or replace function public.fn_sincronizar_agenda_desde_hoja(p_filas jsonb)
returns table (
    fila       int,
    resultado  text,
    detalle    text,
    sede       text,
    fecha      text,
    cliente    text,
    reserva    text
)
language plpgsql
as $function$
declare
    e           jsonb;
    v_sede_txt  text;
    v_fecha_txt text;
    v_cliente   text;
    v_telefono  text;
    v_cancelar  boolean;
    v_motivo    text;
    v_fecha     date;
    v_sede_id   uuid;
    v_sede_nom  text;
    v_ignorado  text;
    v_estado    text;
    v_actual    agenda_reservas%rowtype;
    v_nueva     uuid;
    v_pista     text;
    v_hoy       date := (now() at time zone 'America/Bogota')::date;
begin
    for e in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb))
    loop
        fila       := nullif(e->>'fila', '')::int;
        v_sede_txt := nullif(btrim(coalesce(e->>'sede', '')), '');
        v_fecha_txt:= nullif(btrim(coalesce(e->>'fecha', '')), '');
        v_cliente  := nullif(btrim(coalesce(e->>'cliente', '')), '');
        v_telefono := nullif(btrim(coalesce(e->>'telefono', '')), '');
        v_cancelar := coalesce((e->>'cancelar')::boolean, false);
        v_motivo   := nullif(btrim(coalesce(e->>'motivo', '')), '');

        sede    := v_sede_txt;
        fecha   := v_fecha_txt;
        cliente := v_cliente;
        reserva := null;
        detalle := null;
        v_sede_id  := null;
        v_sede_nom := null;
        v_ignorado := null;
        v_estado   := null;
        v_pista    := null;

        -- (a) Lo que el workflow ya dio por perdido antes de llegar aqui: una
        --     fecha que no se entiende, una columna `cancelada` con algo raro.
        --
        --     Antes se devolvia el motivo a secas. Ahora se mira si ese cliente
        --     YA tiene una fecha en la agenda: si la tiene, esto es un dedazo
        --     en la celda y no hay nada que perseguir; si no la tiene, puede ser
        --     una venta que falta, y eso es lo unico que hay que mirar hoy.
        if v_motivo is not null then
            if v_cliente is not null then
                select 'ya hay una fecha a nombre de ' || a.nombre_cliente ||
                       ' en ' || s.nombre_sede || ' el ' || to_char(a.fecha_solicitada, 'YYYY-MM-DD') ||
                       ': parece solo un dedazo en la celda'
                  into v_pista
                  from agenda_reservas a
                  join sedes s on s.id_sede = a.sede_id
                 where a.estado in ('separado', 'bloqueado_temporal')
                   and a.fecha_solicitada >= v_hoy
                   -- El nombre viene de una celda que teclea una persona, y en
                   -- un `ilike` los caracteres `%` y `_` NO son letras: son
                   -- comodines. Una celda con "OCUPADO 100%" o "MARIA_" casaría
                   -- con cualquier reserva, y esta pista diría "tranquilo, ya
                   -- está cubierta" sobre una fecha que en realidad falta --
                   -- justo al revés de para lo que existe. Se escapan.
                   and a.nombre_cliente ilike
                       '%' || replace(replace(replace(v_cliente, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                       escape '\'
                 order by a.fecha_solicitada
                 limit 1;

                if v_pista is null then
                    v_pista := 'y NO hay ninguna fecha a nombre de ese cliente: ' ||
                               'puede ser una venta que el agente no está viendo';
                end if;
            end if;

            resultado := 'rechazada';
            detalle   := v_motivo || coalesce(' — ' || v_pista, '');
            return next;
            continue;
        end if;

        -- (b) La fecha.
        begin
            v_fecha := v_fecha_txt::date;
        exception when others then
            v_fecha := null;
        end;
        if v_fecha is null then
            resultado := 'rechazada';
            detalle   := 'no entiendo la fecha ' || coalesce('"' || v_fecha_txt || '"', '(vacía)');
            return next;
            continue;
        end if;

        -- (c) La sede: una sola llamada, con las reglas en un solo sitio.
        select r.sede_id, r.nombre_sede, r.estado, r.detalle
          into v_sede_id, v_sede_nom, v_estado, v_ignorado
          from fn_resolver_sede(v_sede_txt) r;

        if v_estado = 'ignorada' then
            -- No es un fallo de nadie: es un salon que no manejamos. Sale como
            -- omitida y con el motivo, para que quien lea la hoja entienda por
            -- que esa fecha no esta en la agenda.
            resultado := 'omitida';
            detalle   := v_ignorado;
            return next;
            continue;
        elsif v_estado <> 'ok' then
            resultado := 'rechazada';
            detalle   := v_ignorado;
            return next;
            continue;
        end if;

        sede := v_sede_nom;   -- se devuelve el nombre del catalogo, no el tecleado

        select * into v_actual
          from agenda_reservas
         where sede_id = v_sede_id and fecha_solicitada = v_fecha;

        -- (d) Cancelar: la unica forma de liberar una fecha desde la hoja.
        if v_cancelar then
            if v_actual.id_reserva is null then
                resultado := 'omitida';
                detalle   := 'marcada como cancelada, pero no estaba en la agenda';
            elsif v_actual.origen <> 'humano' then
                resultado := 'choque';
                detalle   := 'la apartó el bot' ||
                             coalesce(' para ' || v_actual.nombre_cliente, '') ||
                             ': libérala a mano, tiene evento en Calendar';
                reserva   := v_actual.id_reserva::text;
            elsif v_actual.estado = 'disponible' then
                resultado := 'omitida';
                detalle   := 'ya estaba liberada';
                reserva   := v_actual.id_reserva::text;
            else
                update agenda_reservas
                   set estado = 'disponible'
                 where id_reserva = v_actual.id_reserva;
                resultado := 'liberada';
                detalle   := 'la fecha vuelve a estar a la venta';
                reserva   := v_actual.id_reserva::text;
            end if;
            return next;
            continue;
        end if;

        -- (e) Fechas pasadas.
        if v_fecha < v_hoy then
            resultado := 'omitida';
            detalle   := 'la fecha ya pasó';
            return next;
            continue;
        end if;

        -- (f) El caso normal.
        if v_actual.id_reserva is null then
            insert into agenda_reservas
                   (sede_id, fecha_solicitada, nombre_cliente, telefono_contacto, estado, origen)
            values (v_sede_id, v_fecha, v_cliente, v_telefono, 'separado', 'humano')
            on conflict (sede_id, fecha_solicitada) do nothing
            returning id_reserva into v_nueva;

            if v_nueva is null then
                resultado := 'choque';
                detalle   := 'la apartaron mientras se sincronizaba';
            else
                resultado := 'nueva';
                detalle   := 'queda separada';
                reserva   := v_nueva::text;
            end if;

        elsif v_actual.origen <> 'humano' then
            resultado := 'choque';
            detalle   := 'ya la tenía el bot' ||
                         coalesce(' para ' || v_actual.nombre_cliente, '') ||
                         ' (' || v_actual.estado || '): no se tocó';
            reserva   := v_actual.id_reserva::text;

        elsif v_actual.estado = 'disponible' then
            update agenda_reservas
               set estado = 'separado',
                   nombre_cliente = coalesce(v_cliente, nombre_cliente)
             where id_reserva = v_actual.id_reserva;
            resultado := 'reactivada';
            detalle   := 'vuelve a quedar separada';
            reserva   := v_actual.id_reserva::text;

        else
            resultado := 'ya estaba';
            detalle   := 'la base y la hoja coinciden';
            reserva   := v_actual.id_reserva::text;
        end if;

        return next;
    end loop;
end;
$function$;

comment on function fn_sincronizar_agenda_desde_hoja(jsonb) is
  'Mete en agenda_reservas las fechas que el equipo escribio a mano en el Excel, y devuelve que hizo con cada fila. Los rechazos dicen si ese cliente ya tiene fecha (dedazo) o no (venta que falta). Ver 20260902000001, 20260902000004 y 20260903000000.';
