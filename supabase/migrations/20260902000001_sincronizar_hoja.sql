-- La vuelta que faltaba: del Excel del equipo a `agenda_reservas`.
--
-- Hasta hoy el reflejo era de una sola direccion. La base escribe en la hoja
-- -- `Anotar en Excel` en separar_fecha_evento -- y nadie lee de vuelta. Pero
-- la disponibilidad que consulta el agente sale de la BASE:
--
--     select bool_or(r.estado in ('separado','bloqueado_temporal'))
--     from agenda_reservas r
--     where r.sede_id = v_sede_id and r.fecha_solicitada = p_fecha;
--
-- ...asi que una fecha que una persona del equipo vendio y anoto a mano en el
-- Sheets, para el agente sigue LIBRE. Se la puede confirmar a otro cliente, y
-- eso no se descubre hasta que el asesor llama.
--
-- Esta funcion es el otro sentido: recibe las filas de la pestana `Reservas`
-- tal como estan escritas -- con sus dedazos -- y devuelve UNA LINEA POR FILA
-- diciendo que hizo con cada una. El workflow `sincronizar_hoja` la llama cada
-- 15 minutos y escribe esas lineas de vuelta en la columna `sincronizado` de
-- la hoja, al lado de la fila que las provoco.
--
-- Las cuatro decisiones que estaban abiertas, y como quedaron:
--
--   CHOQUES. Si `(sede, fecha)` ya lo tiene el bot, la fila de la hoja NO lo
--   pisa. La del bot tiene lead_id y google_event_id; la de la hoja no tendria
--   ninguno de los dos, y sobrescribirla dejaria un evento huerfano en Calendar
--   y un cliente al que se le prometio una fecha que ya no es suya. Se reporta
--   como 'choque' y lo resuelve una persona.
--
--   FILAS MAL ESCRITAS. Ninguna tumba la corrida: cada fila se resuelve sola y
--   la que no se entiende sale 'rechazada' con el motivo. Entrar en silencio
--   seria peor que no entrar -- una fecha "cargada" que en realidad se perdio
--   es exactamente el fallo que esto viene a cerrar.
--
--   BORRADOS. Borrar una fila de la hoja NO libera la fecha. Un borrado
--   accidental -- o un filtro mal puesto, o un Ctrl+Z de mas -- pondria a la
--   venta un sabado ya vendido, y el bot lo vendria dos veces sin que nadie
--   lo note. Para liberar hay que decirlo: la columna `cancelada` de la hoja.
--   Y solo se libera lo que aparto una persona; lo del bot se reporta.
--
--   LIBERAR NO ES BORRAR. La fila se queda con estado 'disponible' en vez de
--   desaparecer: `fn_verificar_disponibilidad_evento` solo mira 'separado' y
--   'bloqueado_temporal', asi que la fecha vuelve a estar a la venta, pero
--   queda el rastro de que estuvo vendida y de quien la tenia.

-- ---------------------------------------------------------------------------
-- 1. El nombre de la sede, como lo escribe una persona
-- ---------------------------------------------------------------------------
-- El resto del proyecto casa las sedes con `nombre_sede ilike '%' || x || '%'`,
-- y eso alcanza cuando quien escribe es el modelo, que copia del catalogo.
-- Aqui quien escribe es una persona con prisa en una celda: "sede norte",
-- "Casa Christians Ciudad Jardin", "GRANADA GOLD". Un ilike no salva ninguna
-- de las tres -- la tilde de Jardin y el apostrofo de Christian's bastan para
-- que no case -- y el resultado seria una fila rechazada por algo que en la
-- practica esta bien escrito.
--
-- La clave tira todo lo que no distingue: mayusculas, tildes, apostrofos,
-- espacios, guiones. 'Casa Christian''s Ciudad Jardín' y
-- 'casa christians ciudad jardin' dan la misma.
create or replace function public.fn_clave_sede(p_nombre text)
returns text
language sql
immutable
as $function$
    select regexp_replace(
             lower(translate(coalesce(p_nombre, ''),
                             'áàäâéèëêíìïîóòöôúùüûñçÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ',
                             'aaaaeeeeiiiioooouuuuncAAAAEEEEIIIIOOOOUUUUNC')),
             '[^a-z0-9]+', '', 'g');
$function$;

comment on function fn_clave_sede(text) is
  'El nombre de una sede sin tildes, mayusculas ni signos, para casarlo con lo que escribe una persona a mano. Ver 20260902000001.';


-- ---------------------------------------------------------------------------
-- 2. La sincronizacion
-- ---------------------------------------------------------------------------
-- Entra un array de objetos, uno por fila de la hoja:
--
--   [{"fila": 5, "sede": "Sede Norte", "fecha": "2026-11-21",
--     "cliente": "MARIA RUIZ", "telefono": "+573001234567",
--     "cancelar": false, "motivo": null}, ...]
--
-- `fila` es el numero de fila en el Sheets y no se usa para nada aqui: viaja
-- de ida y vuelta para que el workflow sepa en que celda escribir la
-- respuesta. `motivo`, si viene, es un rechazo que el propio workflow ya
-- detecto (una fecha que no parsea, una columna `cancelada` con algo raro):
-- se devuelve tal cual para que TODOS los rechazos salgan por el mismo sitio y
-- ninguno se quede sin escribir en la hoja.
--
-- Sale una fila por cada una que entro, con un `resultado` de este juego:
--
--   nueva       la fecha no estaba y quedo separada
--   reactivada  estaba liberada y la hoja la vuelve a dar por vendida
--   ya estaba   nada que hacer, la base y la hoja coinciden
--   liberada    la hoja la marco cancelada y la fecha vuelve a estar libre
--   choque      la ocupa una fila del bot: no se toca, lo mira una persona
--   omitida     valida, pero no habia nada que hacer (fecha pasada, ya libre)
--   rechazada   no se pudo leer: sede que no existe, fecha ilegible
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
    v_clave     text;
    v_fecha_txt text;
    v_cliente   text;
    v_telefono  text;
    v_cancelar  boolean;
    v_motivo    text;
    v_fecha     date;
    v_sede_id   uuid;
    v_sede_nom  text;
    v_n         int;
    v_actual    agenda_reservas%rowtype;
    v_nueva     uuid;
    -- Hoy en Bogota, no en UTC: a las 7 de la tarde de aca ya es manana en UTC,
    -- y una fecha de manana no puede contar como pasada.
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

        -- (a) Lo que el workflow ya dio por perdido antes de llegar aqui.
        if v_motivo is not null then
            resultado := 'rechazada';
            detalle   := v_motivo;
            return next;
            continue;
        end if;

        -- (b) La fecha. Llega ya normalizada a YYYY-MM-DD, pero se vuelve a
        --     intentar aqui: esta funcion tambien se llama desde las pruebas y
        --     desde psql, y una fecha imposible no puede reventar la corrida
        --     entera por las 112 filas que si estaban bien.
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

        -- (c) La sede. Primero por clave exacta; si no, por contenido, y solo
        --     si hay UNA coincidencia. "Granada" casa con Gold y con Premium:
        --     dos sedes distintas, con precios distintos y con calendarios
        --     distintos. Adivinar cual seria peor que preguntar.
        if v_sede_txt is null then
            resultado := 'rechazada';
            detalle   := 'falta la sede';
            return next;
            continue;
        end if;

        v_clave := fn_clave_sede(v_sede_txt);
        select count(*), (array_agg(id_sede))[1], (array_agg(nombre_sede))[1]
          into v_n, v_sede_id, v_sede_nom
          from sedes where fn_clave_sede(nombre_sede) = v_clave;

        -- El contenido solo se intenta con algo lo bastante largo como para
        -- distinguir: "s" casaria con las dieciseis.
        if v_n = 0 and length(v_clave) >= 4 then
            select count(*), (array_agg(id_sede))[1], (array_agg(nombre_sede))[1]
              into v_n, v_sede_id, v_sede_nom
              from sedes where fn_clave_sede(nombre_sede) like '%' || v_clave || '%';
        end if;

        if v_n = 0 then
            resultado := 'rechazada';
            detalle   := 'no existe la sede "' || v_sede_txt || '"';
            return next;
            continue;
        elsif v_n > 1 then
            resultado := 'rechazada';
            detalle   := '"' || v_sede_txt || '" casa con ' || v_n || ' sedes: escríbela completa';
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
                -- La aparto el bot: tiene lead y evento en Calendar, y
                -- liberarla desde aqui dejaria las dos cosas colgando.
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

        -- (e) Fechas pasadas. No hay nada que proteger, y
        --     `fn_verificar_disponibilidad_evento` las rechaza por su cuenta
        --     antes de mirar la agenda. Es el mismo criterio con el que se
        --     cargaron las 113 de la migracion 20260901000000.
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
                -- Entre el select y el insert entro otra: el bot apartando esa
                -- misma fecha en el mismo instante. La unicidad es el candado.
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
            -- Estuvo cancelada y la hoja la vuelve a dar por vendida.
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
  'Mete en agenda_reservas las fechas que el equipo escribio a mano en el Excel, y devuelve que hizo con cada fila. Ver 20260902000001.';
