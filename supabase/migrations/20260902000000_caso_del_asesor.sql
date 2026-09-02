-- Después de la cita, el caso es del asesor (2026-09-02).
--
-- Cuando un cliente ya tuvo su llamada o su visita y vuelve a escribir, lo que
-- pregunta casi siempre es sobre algo que ajustó EN esa reunión: un descuento
-- que le hicieron de palabra, una fecha que movieron, un abono. Angie no estuvo
-- ahí y no tiene forma de saberlo, así que si contesta, contesta mal -- y lo
-- hace con la seguridad con la que contesta todo lo demás, que es lo que lo
-- vuelve caro. Lo correcto es decirle que el asesor lo retoma, avisarle al
-- asesor, y callarse.
--
-- La detección es determinista y no se le pregunta al modelo: o hay una cita
-- con `fin` en el pasado, o no la hay. Distinguir "el cliente está preguntando
-- algo" de "el cliente dio las gracias" sí exigiría criterio, y por eso no se
-- intenta: después de una reunión el caso es del asesor de todos modos. Un
-- "gracias" que le llega al asesor no cuesta nada; una pregunta que el bot
-- contesta mal cuesta la venta.

-- Cuándo se le avisó al asesor de esta cita. `null` = todavía no.
--
-- Es lo que hace que el aviso salga UNA vez y no en cada mensaje. El freno de
-- verdad es `leads.requiere_humano`, que corta el flujo en `¿Bot activo?`
-- antes de llegar aquí; esta columna es el segundo cerrojo, para el caso en que
-- alguien despause el chat a mano y el cliente escriba otra vez. Además deja
-- ver, desde la tabla, cuándo se enteró el asesor.
alter table citas
    add column if not exists notificado_asesor_en timestamptz;

comment on column citas.notificado_asesor_en is
  'Cuándo se le avisó al asesor de que el cliente volvió a escribir. Ver 20260902000000.';

-- Los casos sin avisar se buscan por aquí en cada mensaje entrante, así que el
-- índice es parcial: las citas ya avisadas -- que con el tiempo son casi todas
-- -- no ocupan sitio en él.
create index if not exists idx_citas_sin_avisar
    on citas (lead_id, fin desc)
    where notificado_asesor_en is null;

-- ¿Este cliente ya tuvo su cita y todavía nadie le avisó al asesor?
--
-- Devuelve SIEMPRE exactamente una fila, igual que `fn_reserva_ficha`: el nodo
-- IF de n8n lee `hay_caso`, y una función que a veces devuelve cero filas
-- dejaría la rama sin datos y el flujo tirado en silencio.
--
-- Se busca por `lead_id` y también por `telefono` porque `citas` guarda los
-- dos, y el `lead_id` puede haber quedado en null: `Registrar Cita` lo resuelve
-- con un `left join` contra `leads`, así que una cita agendada antes de que el
-- lead existiera no lo tiene.
create or replace function fn_caso_asesor(p_telefono text)
returns table (
    hay_caso       boolean,
    id_cita        uuid,
    nombre_cliente text,
    tipo_cita      text,
    cuando_legible text
)
language plpgsql
stable
as $$
declare
    v_lead_id uuid;
    v_c       citas%rowtype;
begin
    select id into v_lead_id from leads where telefono = p_telefono;

    select * into v_c
      from citas c
     where (v_lead_id is not null and c.lead_id = v_lead_id
            or c.telefono = p_telefono)
       and c.fin < now()
       and c.notificado_asesor_en is null
     order by c.fin desc
     limit 1;

    if v_c.id_cita is null then
        return query select false, null::uuid, null::text, null::text, null::text;
        return;
    end if;

    return query select
        true,
        v_c.id_cita,
        v_c.nombre_cliente,
        v_c.tipo_cita,
        -- La hora no se nombra a propósito: al asesor le sirve para ubicar de
        -- qué reunión le hablan, y el día basta. La cita se guarda en UTC, así
        -- que hay que traerla a Bogotá antes de quedarnos con la fecha: una a
        -- las 7 p. m. cae al día siguiente si se mira en UTC.
        fn_fecha_en_letras((v_c.inicio at time zone 'America/Bogota')::date);
end;
$$;

comment on function fn_caso_asesor(text) is
  'Si el cliente ya tuvo su cita y al asesor no se le ha avisado, devuelve el caso. Ver 20260902000000.';

-- Cierra el caso: marca la cita como avisada y calla al bot en ese chat.
--
-- Las dos cosas van en UNA sentencia, no en dos nodos, porque separarlas deja
-- una ventana en la que el asesor ya recibió el aviso pero el bot sigue
-- contestando -- o al revés, el bot callado y el asesor sin enterarse. Un CTE
-- las hace caer juntas o no caer.
create or replace function fn_caso_asesor_cerrar(p_id_cita uuid, p_telefono text)
returns text
language sql
as $$
    with marcada as (
        update citas set notificado_asesor_en = now()
         where id_cita = p_id_cita
           and notificado_asesor_en is null
        returning id_cita
    ),
    pausado as (
        update leads set requiere_humano = true, updated_at = now()
         where telefono = p_telefono
        returning id
    )
    select case
        when (select count(*) from marcada) = 0 then 'ya estaba avisado'
        when (select count(*) from pausado) = 0 then 'avisado, pero ese telefono no tiene lead'
        else 'avisado y bot en pausa'
    end
$$;

comment on function fn_caso_asesor_cerrar(uuid, text) is
  'Marca la cita como avisada y pone requiere_humano en el lead, en una sola sentencia. Ver 20260902000000.';
