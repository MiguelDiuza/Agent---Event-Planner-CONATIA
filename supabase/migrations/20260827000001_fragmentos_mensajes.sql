-- Los mensajes que llegan por partes.
--
-- EL PROBLEMA (reportado en producción, 2026-08-27). Mucha gente en WhatsApp no
-- escribe un mensaje: escribe cuatro.
--
--     quiero
--     que sea
--     para 150
--     personas
--
-- El agente contestaba los cuatro, uno por uno, y ninguna de las cuatro
-- respuestas tenía sentido porque ninguno de los cuatro mensajes lo tenía. Al
-- cliente le queda clarísimo que está hablando con una máquina.
--
-- LA IDEA. Cada mensaje entrante se guarda aquí antes de llegar al agente. Si
-- el mensaje parece un pedazo suelto, la ejecución espera unos segundos; si en
-- ese rato llega otro, la ejecución vieja se calla y la nueva se queda con
-- todos los pedazos juntos. El agente ve un solo mensaje: "quiero que sea para
-- 150 personas".
--
-- LO QUE NO PUEDE PASAR, y por eso el reclamo es una función y no un update
-- suelto: que dos ejecuciones contesten el mismo pedazo, o que un pedazo se
-- pierda sin que nadie lo conteste. `fn_reclamar_fragmentos` resuelve las dos
-- cosas de una: solo la ejecución del mensaje MÁS NUEVO se lleva el lote, y se
-- lo lleva entero.
--
-- Un mensaje que llega completo no espera nada: entra, reclama y sigue. El
-- costo para la conversación que ya funcionaba bien son dos consultas.
create table if not exists mensajes_fragmentos (
    id            bigserial primary key,
    telefono      text        not null,
    texto         text        not null,
    wa_message_id text,
    recibido_en   timestamptz not null default now(),
    consumido_en  timestamptz
);

comment on table mensajes_fragmentos is
  'Mensajes entrantes de WhatsApp a la espera de que se les una el resto. Ver fn_reclamar_fragmentos.';

-- El índice que importa: "los pendientes de este cliente, el más nuevo
-- primero". Parcial, porque los ya consumidos no se consultan nunca.
create index if not exists mensajes_fragmentos_pendientes_idx
    on mensajes_fragmentos (telefono, id) where consumido_en is null;

-- Para que el barrido de viejos no lea la tabla entera.
create index if not exists mensajes_fragmentos_consumidos_idx
    on mensajes_fragmentos (consumido_en) where consumido_en is not null;

alter table mensajes_fragmentos enable row level security;


-- Se lleva los fragmentos pendientes de un cliente, pero SOLO si el que llama
-- sigue siendo el último que llegó.
--
-- Devuelve cero filas cuando ya llegó uno más nuevo: esa es la señal de que
-- esta ejecución tiene que callarse. No es un error ni un caso raro -- en una
-- ráfaga de cuatro mensajes pasa tres veces.
--
-- La ventana de 5 minutos es una red de seguridad, no parte del diseño. Si n8n
-- se reinicia mientras una ejecución está esperando, su fragmento queda
-- pendiente para siempre; sin la ventana, se le pegaría al mensaje que ese
-- cliente escriba tres días después. Los viejos se marcan como consumidos
-- igual, para que no se acumulen, pero no viajan en el texto.
create or replace function fn_reclamar_fragmentos(p_telefono text, p_id bigint)
returns table (texto text, fragmentos integer, descartados integer)
language plpgsql
as $$
declare
    v_ultimo bigint;
begin
    -- Barrido barato de lo ya contestado. Va por el índice parcial.
    delete from mensajes_fragmentos where consumido_en < now() - interval '2 days';

    -- Serializa a los dos posibles competidores: la ejecución que despierta de
    -- su espera y la del mensaje que acaba de entrar.
    perform pg_advisory_xact_lock(hashtext('fragmentos:' || p_telefono));

    select max(m.id) into v_ultimo
      from mensajes_fragmentos m
     where m.telefono = p_telefono and m.consumido_en is null;

    -- Llegó otro después de este (o alguien ya se llevó el lote): callarse.
    if v_ultimo is null or v_ultimo <> p_id then
        return;
    end if;

    return query
    with tomados as (
        update mensajes_fragmentos m
           set consumido_en = now()
         where m.telefono = p_telefono
           and m.consumido_en is null
        returning m.id, m.texto, m.recibido_en
    )
    select
        string_agg(t.texto, ' ' order by t.id)
            filter (where t.recibido_en > now() - interval '5 minutes'),
        count(*) filter (where t.recibido_en > now() - interval '5 minutes')::integer,
        count(*) filter (where t.recibido_en <= now() - interval '5 minutes')::integer
    from tomados t;
end;
$$;

comment on function fn_reclamar_fragmentos(text, bigint) is
  'Une los mensajes pendientes de un cliente en uno solo. Cero filas = llegó uno más nuevo, esta ejecución se calla.';
