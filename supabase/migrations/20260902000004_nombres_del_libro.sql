-- Los nombres con los que el equipo llama a sus salones.
--
-- POR QUE. `fn_sincronizar_agenda_desde_hoja` casa la sede por el nombre del
-- catalogo: primero la clave exacta, y si no, por contenido. Eso alcanzaba
-- mientras el unico que escribia era el modelo, que copia del catalogo. Pero
-- quien va a escribir es el equipo, y el equipo NO usa los nombres del
-- catalogo: usa los de su libro. Probado contra la base el 2026-09-02:
--
--   AVDA 3 NORTE    -> 0 sedes      AV 3 NTE     -> 0 sedes
--   LAS PILAS       -> 0 sedes      3RA NORTE    -> 0 sedes
--   H. TALISMAN     -> 0 sedes
--
-- Cinco de los nombres que el equipo escribe todos los dias no resuelven a
-- nada. El dia que empiecen a usar la pestana `Reservas` -- que es el plan --
-- cada una de esas filas saldria rechazada, y una fila rechazada es una fecha
-- vendida que el agente sigue viendo libre.
--
-- Y HAY UNO PEOR. "GRANADA" a secas resuelve HOY a `Sede Granada Gold`, por el
-- casado por contenido. El libro del equipo lleva DOS calendarios de Granada y
-- los distingue en su propia columna de salon -- `GRANADA` y `GOLD` -- con
-- clientes distintos el mismo dia (12 de diciembre: ADRIANA en uno, NATALIA
-- PLAZA en el otro). El primero es el salon que el cliente mando ignorar el
-- 2026-09-02: "es de una administracion diferente", ratificado hoy. Asi que
-- una fila que diga GRANADA a secas es del salon del vecino, y hoy entraria
-- BLOQUEANDO UNA FECHA DEL GOLD que en realidad esta libre. Adivinar en ese
-- caso es exactamente lo que no se puede hacer: se rechaza y se dice por que.

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
-- `sede_id` en null NO es un hueco: es "este nombre se ignora a proposito", y
-- `motivo` dice por que. Es la unica forma de que un nombre pueda significar
-- "no es nuestro" en vez de "no lo encuentro" -- que para quien lee la hoja
-- son dos cosas muy distintas.
create table if not exists public.sedes_alias (
    alias   text primary key,
    sede_id uuid references sedes(id_sede) on delete cascade,
    motivo  text,
    check (sede_id is not null or motivo is not null)
);

comment on table sedes_alias is
  'Como llama el equipo a cada salon en su libro. sede_id null = nombre que se ignora a proposito, con el motivo al lado. Ver 20260902000004.';
comment on column sedes_alias.alias is
  'La clave normalizada por fn_clave_sede: sin mayusculas, tildes ni signos.';

-- Se siembra con los nombres tal como estan escritos en el libro; la clave se
-- calcula con la misma funcion que se usa para leer lo que teclea una persona,
-- para que las dos puntas no puedan separarse.
insert into sedes_alias (alias, sede_id, motivo)
-- distinct: `AVDA 3 NORTE` y `AVDA3 NORTE` dan la misma clave, y un insert con
-- dos filas para la misma clave revienta contra el on conflict.
select distinct on (1) fn_clave_sede(v.escrito), s.id_sede, null
from (values
    -- Sede Norte: las cuatro formas que aparecen en el libro y en VALORES.
    ('AVDA 3 NORTE',   'Sede Norte'),
    ('AV 3 NTE',       'Sede Norte'),
    ('3RA NORTE',      'Sede Norte'),
    ('AVENIDA 3 NORTE','Sede Norte'),
    -- Sur 66: la pestana se llama MUNDO FOTO y VALORES la cotiza como
    -- SALON CHRISTIANS 66. Son el mismo salon.
    ('MUNDO FOTO',           'Sede Sur 66 Mundo Foto'),
    ('SALON CHRISTIANS 66',  'Sede Sur 66 Mundo Foto'),
    ('CHRISTIANS 66',        'Sede Sur 66 Mundo Foto'),
    ('SUR 66',               'Sede Sur 66 Mundo Foto'),
    ('CIUDAD JARDIN',                  'Casa Christian''s Ciudad Jardín'),
    ('CASA CHRISTIANS CIUDAD JARDIN',  'Casa Christian''s Ciudad Jardín'),
    -- Granada: SOLO el Gold. Ver el bloque de ignorados, abajo.
    ('GRANADA GOLD', 'Sede Granada Gold'),
    ('GOLD',         'Sede Granada Gold'),
    ('LAS PILAS',      'Pilas Premium'),
    ('LAS PILAS PREM', 'Pilas Premium'),
    ('PILAS',          'Pilas Premium'),
    ('H. TALISMAN',           'Hacienda El Talismán'),
    ('HACIENDA EL TALISMAN',  'Hacienda El Talismán'),
    ('TALISMAN',              'Hacienda El Talismán'),
    -- Estos ya casaban solos por contenido. Se escriben igual para que la
    -- sincronizacion no dependa de un `like` que manana puede volverse ambiguo
    -- si entra otra sede con un nombre parecido.
    ('CASA 4',          'Casa 4'),
    ('CASA 5',          'Casa 5'),
    ('CASA 74',         'Casa 74'),
    ('ORQUIDEORAMA',    'Orquideorama'),
    ('ORQUIDEORAMA 1',  'Orquideorama'),
    -- Está así en el maestro de 2026, fila 59 (NICOLLE ANDREA MARQUEZ). Es un
    -- dedazo, pero es el que hay escrito, y no se parece a ningún otro salón:
    -- vale más aceptarlo aquí que rechazar una fecha vendida por una letra.
    ('ORQUIDEOGRAMA',   'Orquideorama'),
    ('VALLANO',         'Mansión Vallano'),
    ('MANSION VALLANO', 'Mansión Vallano'),
    ('MARQUEZ',         'Marquez De Loyola'),
    ('VALDEMORO',       'Valdemoro'),
    ('GRAN SALON',      'Gran Salón'),
    ('SAWA',            'Sawa')
) as v(escrito, catalogo)
join sedes s on s.nombre_sede = v.catalogo
on conflict (alias) do update
   set sede_id = excluded.sede_id, motivo = null;

-- Los que se ignoran a proposito.
--
-- No es lo mismo que no existir: si esto no estuviera, "GRANADA" casaria por
-- contenido con `Sede Granada Gold` y una venta del salon del vecino acabaria
-- tapando una fecha buena del Gold.
insert into sedes_alias (alias, sede_id, motivo)
select fn_clave_sede(v.escrito), null, v.motivo
from (values
    ('GRANADA',
     'el libro lleva dos Granadas y esta es la que no manejamos (otra administración): si es del Gold, escribe "Granada Gold"'),
    ('GRANADA PREMIUM',
     'Granada Premium es de otra administración: no se agenda desde aquí'),
    ('GRANADA 2026',
     'esa pestaña es del salón que no manejamos: si es del Gold, escribe "Granada Gold"'),
    ('GRANADA 2027',
     'esa pestaña es del salón que no manejamos: si es del Gold, escribe "Granada Gold"')
) as v(escrito, motivo)
on conflict (alias) do update
   set sede_id = null, motivo = excluded.motivo;


-- ---------------------------------------------------------------------------
-- 2. Resolver un nombre de salon, en un solo sitio
-- ---------------------------------------------------------------------------
-- Vive aparte de la sincronizacion por una razon practica: `auditar-fechas-
-- excel.js` tiene que poder preguntar "¿a que salon iria esta fila?" SIN
-- escribir nada. Si la respuesta la diera solo la sincronizacion, auditar
-- significaria sincronizar, o significaria una segunda copia de estas reglas
-- que manana no diria lo mismo.
--
-- `estado` sale de este juego:
--   ok         resuelta: sede_id y nombre_sede vienen llenos
--   ignorada   es un salon que se ignora a proposito; `detalle` dice por que
--   ambigua    lo escrito casa con varias; `detalle` dice con cuantas
--   no_existe  no casa con nada
create or replace function public.fn_resolver_sede(p_texto text)
returns table (sede_id uuid, nombre_sede text, estado text, detalle text)
language plpgsql
stable
as $function$
declare
    v_clave    text;
    v_ignorado text;
    v_n        int;
begin
    if nullif(btrim(coalesce(p_texto, '')), '') is null then
        return query select null::uuid, null::text, 'no_existe'::text, 'falta la sede'::text;
        return;
    end if;

    v_clave := fn_clave_sede(p_texto);

    -- 1. Como lo llama el equipo. Un alias sin sede es un "no es nuestro"
    --    escrito a proposito, y se contesta con su motivo.
    select a.sede_id, a.motivo, s.nombre_sede
      into sede_id, v_ignorado, nombre_sede
      from sedes_alias a
      left join sedes s on s.id_sede = a.sede_id
     where a.alias = v_clave;

    if v_ignorado is not null then
        return query select null::uuid, null::text, 'ignorada'::text, v_ignorado;
        return;
    end if;
    if sede_id is not null then
        return query select sede_id, nombre_sede, 'ok'::text, null::text;
        return;
    end if;

    -- 2. El nombre del catalogo, clavado.
    select count(*), (array_agg(s.id_sede))[1], (array_agg(s.nombre_sede))[1]
      into v_n, sede_id, nombre_sede
      from sedes s where fn_clave_sede(s.nombre_sede) = v_clave;
    if v_n = 1 then
        return query select sede_id, nombre_sede, 'ok'::text, null::text;
        return;
    end if;

    -- 3. Un alias DENTRO de lo escrito. Es lo que salva a "GRANADA GOLD 2026"
    --    y a "AVDA 3 NORTE (segundo piso)": el equipo le pega el ano o una
    --    aclaracion al nombre del salon. Se exige que todos los alias que
    --    quepan dentro apunten a la MISMA sede.
    if length(v_clave) >= 4 then
        select count(distinct a.sede_id), (array_agg(a.sede_id))[1], (array_agg(s.nombre_sede))[1]
          into v_n, sede_id, nombre_sede
          from sedes_alias a
          join sedes s on s.id_sede = a.sede_id
         where a.sede_id is not null
           and v_clave like '%' || a.alias || '%';
        if v_n = 1 then
            return query select sede_id, nombre_sede, 'ok'::text, null::text;
            return;
        elsif v_n > 1 then
            return query select null::uuid, null::text, 'ambigua'::text,
                '"' || p_texto || '" casa con ' || v_n || ' salones: escríbelo como en el catálogo';
            return;
        end if;
    end if;

    -- 4. La comprobacion que faltaba: si nada de lo anterior caso y lo escrito
    --    lleva dentro un nombre de los que se ignoran, NO se resuelve por
    --    parecido. "GRANADA" se parece a "Sede Granada Gold" y no es el mismo
    --    salon. Va despues del paso 3 a proposito: asi "GRANADA GOLD 2026" se
    --    resuelve por su alias y solo cae aqui lo que no dice Gold por
    --    ningun lado.
    select a.motivo into v_ignorado
      from sedes_alias a
     where a.sede_id is null
       and v_clave like '%' || a.alias || '%'
     limit 1;
    if v_ignorado is not null then
        return query select null::uuid, null::text, 'ignorada'::text, v_ignorado;
        return;
    end if;

    -- 5. Por contenido contra el catalogo, y solo si hay UNA.
    if length(v_clave) >= 4 then
        select count(*), (array_agg(s.id_sede))[1], (array_agg(s.nombre_sede))[1]
          into v_n, sede_id, nombre_sede
          from sedes s where fn_clave_sede(s.nombre_sede) like '%' || v_clave || '%';
        if v_n = 1 then
            return query select sede_id, nombre_sede, 'ok'::text, null::text;
            return;
        elsif v_n > 1 then
            return query select null::uuid, null::text, 'ambigua'::text,
                '"' || p_texto || '" casa con ' || v_n || ' sedes: escríbela completa';
            return;
        end if;
    end if;

    return query select null::uuid, null::text, 'no_existe'::text,
        'no existe la sede "' || p_texto || '"';
end;
$function$;

comment on function fn_resolver_sede(text) is
  'A que salon del catalogo se refiere un nombre escrito por una persona, o por que no se resuelve. La usan la sincronizacion y la auditoria. Ver 20260902000004.';


-- ---------------------------------------------------------------------------
-- 3. La sincronizacion la usa, y deja de adivinar
-- ---------------------------------------------------------------------------
-- Solo cambia el bloque (c), el de la sede: ahora es una llamada. El resto se
-- copia tal cual de 20260902000001 -- Postgres no deja reemplazar media
-- funcion -- y los comentarios de las decisiones viven alli.
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

        -- (a) Lo que el workflow ya dio por perdido antes de llegar aqui.
        if v_motivo is not null then
            resultado := 'rechazada';
            detalle   := v_motivo;
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
  'Mete en agenda_reservas las fechas que el equipo escribio a mano en el Excel, y devuelve que hizo con cada fila. Los nombres de sede salen de sedes_alias. Ver 20260902000001 y 20260902000004.';
