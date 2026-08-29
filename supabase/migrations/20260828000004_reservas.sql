-- RECONSTRUIDA EL 2026-08-29 DESDE LA BASE DE PRODUCCIÓN.
--
-- Esta migración se aplicó el 2026-08-28 sin que su archivo llegara al repo, y
-- `supabase_migrations.schema_migrations` la registró con `statements` vacío,
-- así que el SQL original no existe en ninguna parte. Lo que hay aquí se sacó
-- de la base con `pg_get_functiondef` y de `information_schema`: reproduce el
-- estado que corre hoy, no necesariamente el texto que se escribió entonces.
--
-- Se reconstruye porque sin ella un `supabase db reset` daba una base DISTINTA
-- de producción, en silencio: faltarían la tabla `reservas` y sus tres funciones, y
-- el agente se quedaría sin ficha: no sabría el nombre, el aforo ni la fecha.
--
-- Todo va en `create or replace` / `if not exists`, así que volver a aplicarla
-- sobre la base actual no cambia nada.

-- La FICHA del cliente: lo que el agente ya sabe de él.
--
-- Antes esto vivía disperso en columnas de `leads`, y tenía un límite duro: un
-- lead es UNA persona, así que un cliente que cotizaba los quince de la hija y
-- en el mismo chat el matrimonio del hermano se pisaba a sí mismo. Una fila por
-- RESERVA -- una por evento -- es lo que permite las dos cosas a la vez.
--
-- `estado`: 'abierta' es la que se está cotizando ahora mismo; 'pausada' es una
-- que quedó a medias cuando el cliente cambió de tema. Solo hay una abierta a la
-- vez, y es la que alimenta la ficha.
create table if not exists reservas (
    id                uuid primary key default gen_random_uuid(),
    lead_id           uuid not null references leads(id) on delete cascade,
    tipo_evento_id    uuid references tipos_evento(id_evento) on delete set null,

    -- Los escalones del catálogo: de 50 a 200. Un número fuera de ahí no es un
    -- aforo, es un dedazo, y vale más que reviente al anotarlo que cotizar un
    -- precio que no existe.
    num_invitados     int check (num_invitados >= 50 and num_invitados <= 200),
    fecha_evento      date,
    sede_id           uuid references sedes(id_sede) on delete set null,
    nombre_cliente    text,
    telefono_contacto text,
    estado            text not null default 'abierta'
                      check (estado in ('abierta', 'pausada')),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

comment on table reservas is
  'Una fila por evento que el cliente esta cotizando. La abierta es la ficha que ve el agente. Ver 20260828000004.';

-- "La reserva abierta de este lead, la más reciente": es la consulta que hace
-- la ficha en cada turno.
create index if not exists idx_reservas_lead
    on reservas (lead_id, estado, updated_at desc);

-- Y "la reserva de este lead para este tipo de evento", que es como
-- `fn_reserva_anotar` decide si retomar una pausada o abrir una nueva.
create index if not exists idx_reservas_lead_evento
    on reservas (lead_id, tipo_evento_id);

alter table reservas enable row level security;


-- La ficha, en el texto que le llega al agente en cada turno.
--
-- Va redactada como instrucciones y no como datos ("TODAVÍA NO LO SABES --
-- pregúntaselo" en vez de un null) porque lo que la lee es un modelo: un campo
-- vacío lo invita a inventarlo, y una frase en imperativo no.
CREATE OR REPLACE FUNCTION public.fn_reserva_ficha(p_telefono text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    v_lead_id  uuid;
    v_r        reservas%rowtype;
    v_evento   text;
    v_sede     text;
    v_aforos   text;
    v_pausadas text;
    v_out      text;
    c_falta constant text := 'TODAVÍA NO LO SABES — pregúntaselo';
begin
    select id into v_lead_id from leads where telefono = p_telefono;
    if v_lead_id is null then
        return 'Cliente nuevo: todavía no sabes nada de él.';
    end if;

    select * into v_r
    from reservas
    where lead_id = v_lead_id and estado = 'abierta'
    order by updated_at desc
    limit 1;

    if v_r.id is null then
        return 'Todavía no sabes nada de este cliente: ni el evento, ni para '
            || 'cuántas personas, ni la fecha. Pregúntaselo.';
    end if;

    select nombre_paquete into v_evento
    from tipos_evento where id_evento = v_r.tipo_evento_id;

    select nombre_sede into v_sede
    from sedes where id_sede = v_r.sede_id;

    -- Los aforos que ya se cotizaron de ESTE evento. Es lo que sostiene el
    -- "sin repetir": si 100 ya salio, no se vuelve a mandar solo.
    select string_agg(invitados::text, ', ' order by invitados) into v_aforos
    from cotizaciones_aforos
    where lead_id = v_lead_id and tipo_evento_id = v_r.tipo_evento_id;

    select string_agg(
               coalesce(te.nombre_paquete, 'evento sin definir')
               || coalesce(' para ' || r2.num_invitados || ' personas', ''),
               '; ' order by r2.updated_at desc)
      into v_pausadas
    from reservas r2
    left join tipos_evento te on te.id_evento = r2.tipo_evento_id
    where r2.lead_id = v_lead_id and r2.estado = 'pausada';

    v_out :=
         'EVENTO: '            || coalesce(v_evento, c_falta)
      || E'\nPERSONAS: '       || coalesce(v_r.num_invitados::text, c_falta)
      || E'\nFECHA DEL EVENTO: '
         || coalesce(fn_fecha_en_letras(v_r.fecha_evento), c_falta)
      || E'\nSALÓN ELEGIDO: '  || coalesce(v_sede, 'todavía no ha elegido')
      || E'\nNOMBRE: '         || coalesce(nullif(btrim(v_r.nombre_cliente), ''), c_falta)
      || E'\nNÚMERO DE CONTACTO CONFIRMADO: '
         || coalesce(nullif(btrim(v_r.telefono_contacto), ''),
                     'todavía no lo has confirmado con él');

    if v_aforos is not null then
        v_out := v_out || E'\nAFOROS DE ESTE EVENTO QUE YA LE COTIZASTE: ' || v_aforos
                       || ' — de esos ya tiene la cotización en el chat, no la repitas.';
    end if;

    if v_pausadas is not null then
        v_out := v_out || E'\nCOTIZACIONES SUYAS QUE QUEDARON A MEDIAS: ' || v_pausadas
                       || ' — solo las retomas si él las menciona.';
    end if;

    return v_out;
end;
$function$
;

comment on function fn_reserva_ficha(text) is
  'La ficha del cliente en texto, lista para inyectar en el system message. Ver 20260828000004.';


-- Anota lo que el cliente acaba de decir y devuelve la ficha ya actualizada.
--
-- Devuelve la ficha -- y no solo un "ok" -- a proposito: el agente llama a esto
-- como herramienta, y asi en la misma vuelta se entera de que le sigue faltando
-- sin tener que consultar otra vez.
--
-- Todo parametro es opcional y un null NO borra: `coalesce(nuevo, viejo)`. Un
-- turno en el que el cliente solo dice su nombre no puede tumbar el aforo que
-- dijo tres turnos antes.
CREATE OR REPLACE FUNCTION public.fn_reserva_anotar(p_telefono text, p_tipo_evento text DEFAULT NULL::text, p_invitados text DEFAULT NULL::text, p_fecha text DEFAULT NULL::text, p_sede text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_telefono_contacto text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
    v_lead_id   uuid;
    v_tipo_id   uuid;
    v_tipo_nom  text;
    v_invitados int;
    v_fecha     date;
    v_sede_id   uuid;
    v_n_sedes   int;
    v_nombre    text := nullif(btrim(coalesce(p_nombre, '')), '');
    v_contacto  text := nullif(btrim(coalesce(p_telefono_contacto, '')), '');
    v_id        uuid;
    v_abierta   reservas%rowtype;
begin
    select id into v_lead_id from leads where telefono = p_telefono;
    if v_lead_id is null then
        return 'No encontré a este cliente. No anoté nada.';
    end if;

    -- Tipo de evento. Se resuelve con la MISMA funcion que usa el guion de la
    -- cotizacion: el agente escribe "15 Anos" o "Cumpleanos" sin tilde a cada
    -- rato, y un ilike sobre eso devuelve cero filas sin avisar.
    v_tipo_nom := fn_resolver_tipo_evento(p_tipo_evento);
    if v_tipo_nom is not null then
        select id_evento into v_tipo_id from tipos_evento where nombre_paquete = v_tipo_nom;
    end if;

    -- Invitados: mismo redondeo de a 10 y mismo tope que la cotizacion, para
    -- que la ficha diga exactamente el aforo con el que se cotizo.
    --
    -- Puede venir una lista ("50,100,130") porque enviar_medios acepta varios
    -- aforos en una sola llamada. La ficha guarda UNO: el ULTIMO de la lista,
    -- que es el ultimo que el cliente nombro. No hay una respuesta obviamente
    -- correcta aqui -- el cliente esta comparando tres -- pero el ultimo es el
    -- que deja bien el caso que el negocio describio ("para 100 es asi, si
    -- luego quiere 150 entonces dice para 150 es asi"), y los tres quedan
    -- igual en `cotizaciones_aforos`, que es de donde sale la linea de
    -- "aforos que ya le cotizaste" de la ficha.
    begin
        select least(200, greatest(50, (ceil(n.valor / 10.0) * 10)::int))
          into v_invitados
        from (
            select nullif(btrim(t.raw), '')::numeric as valor, t.pos
            from unnest(string_to_array(coalesce(p_invitados, ''), ','))
                 with ordinality as t(raw, pos)
        ) n
        where n.valor is not null and n.valor > 0
        order by n.pos desc
        limit 1;
    exception when others then
        v_invitados := null;   -- "cien", "100 o 120": no es un numero, se ignora
    end;

    -- Fecha: si no parsea, se ignora en silencio. Anotar mal es peor que no
    -- anotar, porque la ficha se lee como verdad en el turno siguiente.
    begin
        v_fecha := nullif(btrim(coalesce(p_fecha, '')), '')::date;
    exception when others then
        v_fecha := null;
    end;

    -- Sede: el mismo ilike que fn_verificar_disponibilidad_evento, y solo si
    -- hay UNA coincidencia. Con dos, no se apunta ninguna.
    if nullif(btrim(coalesce(p_sede, '')), '') is not null then
        -- (array_agg(...))[1] y no min(): Postgres no define min() para uuid.
        select count(*), (array_agg(id_sede))[1] into v_n_sedes, v_sede_id
        from sedes where nombre_sede ilike '%' || btrim(p_sede) || '%';
        if v_n_sedes <> 1 then
            v_sede_id := null;
        end if;
    end if;

    select * into v_abierta
    from reservas
    where lead_id = v_lead_id and estado = 'abierta'
    order by updated_at desc
    limit 1;

    if v_tipo_id is not null then
        -- ¿Ya hay una reserva de este mismo evento? Se retoma, esté abierta o
        -- pausada. Es el caso de "volvamos a lo de los 15".
        select id into v_id
        from reservas
        where lead_id = v_lead_id and tipo_evento_id = v_tipo_id
        order by (estado = 'abierta') desc, updated_at desc
        limit 1;

        if v_id is null and v_abierta.id is not null and v_abierta.tipo_evento_id is null then
            -- La abierta todavía no tenía evento (el cliente dio el nombre
            -- antes que el evento): se adopta en vez de dejarla huérfana.
            v_id := v_abierta.id;
        end if;

        if v_id is null then
            -- Evento distinto: la anterior queda a medias y se abre una nueva.
            --
            -- El nombre y el número de contacto SÍ se heredan: son de la
            -- persona, no del evento, y volver a pedirlos en la segunda
            -- cotización es exactamente la redundancia que esto vino a
            -- quitar. Las personas, la fecha y el salón NO se heredan: el
            -- prompt es explícito en que casi nunca coinciden entre un evento
            -- y otro, y arrastrarlas haría que el agente diera por sabido algo
            -- que el cliente no dijo.
            update reservas set estado = 'pausada', updated_at = now()
             where lead_id = v_lead_id and estado = 'abierta';
            insert into reservas (lead_id, tipo_evento_id, nombre_cliente, telefono_contacto)
            select v_lead_id, v_tipo_id, v_abierta.nombre_cliente, v_abierta.telefono_contacto
            returning id into v_id;
        elsif v_id <> coalesce(v_abierta.id, '00000000-0000-0000-0000-000000000000'::uuid) then
            update reservas set estado = 'pausada', updated_at = now()
             where lead_id = v_lead_id and estado = 'abierta' and id <> v_id;
            update reservas set estado = 'abierta' where id = v_id;
        end if;
    else
        v_id := v_abierta.id;
        if v_id is null then
            insert into reservas (lead_id) values (v_lead_id) returning id into v_id;
        end if;
    end if;

    -- coalesce(nuevo, viejo): lo que no venga en esta llamada se queda como
    -- estaba. Ninguna llamada puede vaciar un campo que ya tenía dato.
    update reservas
       set tipo_evento_id    = coalesce(v_tipo_id,   tipo_evento_id),
           num_invitados     = coalesce(v_invitados, num_invitados),
           fecha_evento      = coalesce(v_fecha,     fecha_evento),
           sede_id           = coalesce(v_sede_id,   sede_id),
           nombre_cliente    = coalesce(v_nombre,    nombre_cliente),
           telefono_contacto = coalesce(v_contacto,  telefono_contacto),
           updated_at        = now()
     where id = v_id;

    return fn_reserva_ficha(p_telefono);
end;
$function$
;

comment on function fn_reserva_anotar(text, text, text, text, text, text, text) is
  'Anota datos del evento en la reserva abierta y devuelve la ficha. Ver 20260828000004.';


-- El comando /new: deja al cliente como si escribiera por primera vez.
--
-- Es para probar, no para el cliente. Borra memoria, fragmentos, material
-- enviado, cotizaciones y reservas, y devuelve al lead a 'nuevo'.
--
-- Lo que NO borra son las citas ni las fechas apartadas: esas viven tambien en
-- Google Calendar y en la agenda que ven los demas clientes, asi que borrarlas
-- desde aqui dejaria a los dos lados desincronizados. Por eso las CUENTA y
-- devuelve cuantas quedaron vivas -- para que quien reinicia sepa que tiene que
-- ir a limpiarlas a mano.
CREATE OR REPLACE FUNCTION public.fn_reiniciar_chat(p_telefono text)
 RETURNS TABLE(resultado text, citas_vivas integer)
 LANGUAGE plpgsql
AS $function$
declare
    v_lead_id uuid;
    v_citas   int := 0;
begin
    select id into v_lead_id from leads where telefono = p_telefono;

    delete from n8n_chat_histories  where session_id = p_telefono;
    delete from mensajes_fragmentos where telefono   = p_telefono;

    if v_lead_id is not null then
        -- Se cuentan TODAS, con evento de Calendar o sin el. Una fila de
        -- agenda_reservas en 'bloqueado_temporal' sigue bloqueando esa fecha
        -- para los demas clientes aunque todavia no tenga google_event_id: el
        -- aviso es sobre lo que /new NO borro, no sobre lo que quedaria
        -- huerfano en Google.
        select count(*) into v_citas
        from (
            select 1 from citas
             where telefono = p_telefono or lead_id = v_lead_id
            union all
            select 1 from agenda_reservas
             where lead_id = v_lead_id
        ) x;

        delete from envios_medios       where lead_id = v_lead_id;
        delete from cotizaciones_aforos where lead_id = v_lead_id;
        delete from reservas            where lead_id = v_lead_id;

        update leads
           set nombre             = null,
               estado             = 'nuevo',
               requiere_humano    = false,
               no_insistir        = false,
               seguimiento_etapa  = 0,
               seguimiento_ultimo_envio = null,
               num_invitados      = null,
               fecha_evento_deseada = null,
               tipo_evento_interes  = null,
               sede_interes         = null,
               updated_at         = now()
         where id = v_lead_id;
    end if;

    return query select
        'Chat reiniciado: memoria, fragmentos, material enviado, cotizaciones y '
        'reservas borrados.'::text,
        v_citas;
end;
$function$
;

comment on function fn_reiniciar_chat(text) is
  'Comando /new: reinicia el chat de un cliente. No toca citas ni agenda: las cuenta y avisa. Ver 20260828000004.';
