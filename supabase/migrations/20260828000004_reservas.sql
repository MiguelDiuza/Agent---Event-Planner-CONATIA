-- La reserva que se va llenando sola, y el comando /new (2026-08-28).
--
-- EL PEDIDO DEL NEGOCIO, literal: "aveces le dicen que es para x cantidad de
-- personas y sigue preguntando en otro momento de la conversacion, para no ser
-- redundante, deberiamos ir creando como la reserva y a medida que el cliente
-- de la informacion se va llenando, si quiere otra cotizacion se llena una
-- nueva para que asi no pida varias veces lo mismo".
--
-- POR QUE PASABA. Hasta hoy, lo unico que el agente sabia de un cliente era el
-- historial de los ultimos 30 mensajes. `leads` tiene desde el primer dia las
-- columnas `num_invitados`, `fecha_evento_deseada`, `tipo_evento_interes` y
-- `sede_interes`, y NINGUNA se escribe nunca: se puede comprobar con un grep
-- de `update leads` sobre los cinco workflows. O sea que el perfil del cliente
-- no existia en ninguna parte fuera de la ventana del modelo, y cuando esa
-- ventana se corria -- o simplemente cuando el modelo se distraia -- volvia a
-- preguntar lo que ya le habian dicho.
--
-- Y el modo de fallar no era solo repreguntar. En una conversacion real del
-- 2026-08-28 (+573145755349, mensajes 42-45) el cliente NUNCA dio una fecha, y
-- el agente igual respondio "para el jueves 12 de agosto de 2027 esta
-- disponible": sin un lugar donde leer la fecha, se la invento. Repreguntar es
-- molesto; inventar es peor.
--
-- LA REGLA NUEVA
--
--   1. Cada cosa que el cliente quiere cotizar es una fila de `reservas`, que
--      se va llenando de a poco: evento, personas, fecha, salon, nombre y
--      numero de contacto.
--   2. Se llena SOLA, como efecto lateral de las herramientas que el agente ya
--      llamaba (enviar_medios, verificar_disponibilidad_evento, agendar_cita,
--      separar_fecha_evento), mas una herramienta chica -- `anotar_datos` --
--      para lo que el cliente suelta sin que ninguna otra herramienta lo vea:
--      sobre todo la fecha, que casi siempre llega en el turno 2 y no se
--      consulta hasta el turno 4.
--   3. En CADA turno, `fn_reserva_ficha` vuelca esa fila al system prompt. El
--      agente ya no depende de acordarse: lo lee.
--   4. Cuando cambia el TIPO DE EVENTO se abre una reserva nueva y la anterior
--      queda 'pausada' -- a medias, por si el cliente la retoma; no se borra.
--      Cambiar solo la cantidad de personas NO abre una reserva nueva:
--      actualiza la que esta abierta, que es lo que el negocio pidio ("si
--      quiere cotizar diferentes paquetes o precios se actualiza... para 100
--      es asi, si luego quiere 150 entonces dice para 150 es asi").
--
-- Y de paso el comando /new, que es la otra mitad del mismo problema: hasta
-- hoy, para que un chat volviera a empezar habia que correr
-- scripts/resetear-lead.js desde una maquina con el .env cargado.

-- ---------------------------------------------------------------------------
-- 1. reservas: una fila por cosa que el cliente quiere cotizar.
-- ---------------------------------------------------------------------------
create table reservas (
    id                uuid primary key default gen_random_uuid(),
    lead_id           uuid not null references leads(id) on delete cascade,
    tipo_evento_id    uuid references tipos_evento(id_evento) on delete set null,
    num_invitados     int check (num_invitados between 50 and 200),
    fecha_evento      date,
    sede_id           uuid references sedes(id_sede) on delete set null,
    nombre_cliente    text,
    telefono_contacto text,
    -- 'abierta'  la que se esta llenando ahora. Como mucho una por lead.
    -- 'pausada'  quedo a medias porque el cliente se paso a otro evento.
    estado            text not null default 'abierta'
                      check (estado in ('abierta', 'pausada')),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index idx_reservas_lead        on reservas (lead_id, estado, updated_at desc);
create index idx_reservas_lead_evento on reservas (lead_id, tipo_evento_id);

comment on table reservas is
    'Borrador de reserva por cada cosa que el cliente quiere cotizar. Se llena '
    'sola con lo que el cliente va diciendo y se vuelca al system prompt en '
    'cada turno, para que el agente no vuelva a preguntar lo que ya sabe. '
    'Cambiar el tipo de evento abre una nueva y pausa la anterior; cambiar '
    'solo el aforo actualiza la abierta.';

comment on column reservas.estado is
    'abierta = la que se esta llenando (como mucho una por lead). pausada = '
    'quedo a medias porque el cliente se paso a otro evento; se conserva por '
    'si la retoma.';

-- ---------------------------------------------------------------------------
-- 2. fn_reserva_ficha: la reserva abierta, en texto, para el system prompt.
--
--    Sale en texto y no en JSON a proposito: esto lo lee un modelo, no un
--    programa, y "PERSONAS: todavia no lo sabes" es una instruccion mas clara
--    que un null. Lo que NO se sabe se dice explicitamente -- si se omitiera,
--    el modelo no tendria como distinguir "no se lo preguntaron" de "no cabe
--    en la ficha", que es justo el hueco por el que se invento una fecha.
-- ---------------------------------------------------------------------------
create or replace function fn_reserva_ficha(p_telefono text)
returns text
language plpgsql
stable
as $$
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
$$;

comment on function fn_reserva_ficha(text) is
    'La reserva abierta de este cliente, en texto plano, para inyectar en el '
    'system prompt del agente en cada turno. Lo que falta se nombra: el modelo '
    'tiene que poder distinguir "no lo sabe" de "no está en la ficha".';

-- ---------------------------------------------------------------------------
-- 3. fn_reserva_anotar: apunta lo que se sepa, sin borrar lo que ya estaba.
--
--    Todos los parametros llegan como TEXTO y todos son opcionales. Es a
--    proposito: quien la llama es un $fromAI o un nodo de n8n, y los dos
--    mandan cadenas -- vacias cuando no hay dato. Una cadena vacia significa
--    "de esto no se nada ahora", nunca "borralo".
-- ---------------------------------------------------------------------------
create or replace function fn_reserva_anotar(
    p_telefono          text,
    p_tipo_evento       text default null,
    p_invitados         text default null,
    p_fecha             text default null,
    p_sede              text default null,
    p_nombre            text default null,
    p_telefono_contacto text default null
) returns text
language plpgsql
volatile
as $$
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
$$;

comment on function fn_reserva_anotar(text, text, text, text, text, text, text) is
    'Apunta en la reserva abierta lo que se sepa del evento del cliente. Todos '
    'los parámetros son opcionales y vacío significa "no lo sé ahora", nunca '
    '"bórralo". Cambiar el tipo de evento pausa la reserva anterior y abre una '
    'nueva. Devuelve la ficha actualizada.';

-- ---------------------------------------------------------------------------
-- 4. fn_reiniciar_chat: el comando /new.
--
--    QUE BORRA Y QUE NO. Borra todo lo que hace que el agente "recuerde":
--    memoria, fragmentos a medias, qué material ya se envió, qué aforos ya se
--    cotizaron y las reservas. El lead se conserva -- es el único registro de
--    quién escribió -- pero se le limpian el nombre y el estado.
--
--    NO borra `citas` ni `agenda_reservas`, y no es un olvido: esas dos filas
--    tienen un `google_event_id` que este workflow no puede borrar del
--    calendario. Borrar la fila y dejar el evento deja una fecha real
--    bloqueada que la base ya no sabe que existe. Ya pasó una vez: hay quince
--    eventos huérfanos de las pruebas de agosto, documentados en
--    docs/ESTADO-Y-CONTINUACION.md. Si hay alguna, se avisa en el texto que
--    devuelve, para que quede a la vista de quien corra el comando.
-- ---------------------------------------------------------------------------
create or replace function fn_reiniciar_chat(p_telefono text)
returns table (resultado text, citas_vivas int)
language plpgsql
volatile
as $$
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
$$;

comment on function fn_reiniciar_chat(text) is
    'El comando /new. Deja el chat como si el cliente escribiera por primera '
    'vez: borra memoria, fragmentos, envios_medios, cotizaciones_aforos y '
    'reservas, y limpia el lead. NO toca citas ni agenda_reservas porque sus '
    'eventos de Google Calendar quedarían huérfanos bloqueando fechas reales; '
    'devuelve cuántas hay para que quien reinicie lo sepa.';
