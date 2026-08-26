-- El rotulo de la tanda de videos y quien entra en ella (2026-08-26).
--
-- Tres cambios que pidio el negocio al reordenar el cierre de venta.
--
-- 1. EL ROTULO. Pasa de "Asi se ve X (salon campestre) - $15.000.000 ✨" a
--    "X - valor PROMOCIONAL $15.000.000 - 100 personas". Dos cosas cambian a
--    proposito:
--
--      * PROMOCIONAL va en mayusculas y es lo que el negocio quiere que el
--        cliente registre: que ese numero es de promocion y no la tarifa.
--      * Aparece la cantidad de personas. El cliente relee estos captions dias
--        despues, cuando ya no recuerda con cuantos invitados cotizo, y un
--        precio sin capacidad al lado se lee como el precio del salon.
--
--    Se cae el "(salon campestre)" / "(salon cubierta cerrada)". Fue decision
--    del negocio: el rotulo queda con nombre, valor y capacidad, nada mas. El
--    tipo de espacio sigue viviendo en `sedes.tipo_espacio` y sigue usandose
--    donde de verdad decide algo -- el valor de separacion, $1.000.000 los
--    cerrados y $2.000.000 los campestres -- y el agente lo dice de viva voz al
--    presentar cada salon.
--
-- 2. UNA PIEZA POR SEDE, Y LA FOTO VALE. El filtro era `m.tipo = 'video'`, asi
--    que una sede sin video quedaba fuera de la tanda entera aunque tuviera
--    material. Era el caso de Gran Salon. La regla del negocio es que no se le
--    esconde ningun salon al cliente, asi que ahora entra el video si lo hay y
--    la foto si no. El `distinct on` acota la tanda a una pieza por sede: sin
--    el, una sede con video y fotos mandaria todo junto (Pilas Premium tiene
--    las dos cosas) y la tanda se volveria interminable.
--
-- 3. EL ORDEN, SOLO POR PRECIO. Antes agrupaba cerrados, campestres y al final
--    los sin clasificar. Ese agrupamiento se justificaba porque el rotulo decia
--    de que tipo era cada uno; sin esa etiqueta el cliente solo ve precios, y
--    agrupados asi le saltan de $9.000.000 a $15.000.000 y vuelven a bajar. De
--    menor a mayor precio es lo que se lee como una lista de precios, que es lo
--    que es. Ademas dejaba de ultimas a Sede Granada Gold, que esta sin
--    clasificar pero es de las mas economicas.
--
-- Lo que NO cambia: el precio lo sigue armando la base y no el agente, con el
-- mismo redondeo del cotizador (55 invitados cotizan como 60); una sede sin ese
-- escalon sale con el mas cercano y el rotulo lo aclara; y no se repite lo que
-- ese telefono ya recibio.
create or replace function fn_medios_sedes_cotizacion(
    p_telefono  text,
    p_invitados int default null
)
returns table (id uuid, tipo text, url text, caption text, descripcion text)
language plpgsql
stable
as $$
declare
    -- Escalones de 50 a 200 de a 10, redondeando hacia arriba: 55 -> 60. Fuera
    -- de rango se pega al extremo, que es lo que hace el agente a mano hoy.
    v_escalon int := case
        when p_invitados is null or p_invitados <= 0 then null
        else least(200, greatest(50, (ceil(p_invitados / 10.0) * 10)::int))
    end;
begin
    -- Sin telefono no hay a quien enviarle ni con que filtrar lo ya enviado.
    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    return query
    with elegido as (
        -- Una pieza por sede: el video si lo hay, la foto si no.
        select distinct on (m.sede_id)
               m.id, m.tipo, m.url, m.descripcion, m.sede_id
        from medios m
        where m.activo
          and m.sede_id is not null
          -- El mismo filtro anti-repeticion de fn_medios_para_enviar.
          and not exists (
                select 1
                from envios_medios e
                join leads l on l.id = e.lead_id
                where e.medio_id = m.id
                  and l.telefono = p_telefono
          )
        order by m.sede_id, (m.tipo = 'video') desc, m.orden, m.created_at
    )
    select e.id,
           e.tipo,
           e.url,
           s.nombre_sede
             || coalesce(
                    ' - valor PROMOCIONAL $'
                    || replace(to_char(pr.precio_total, 'FM999,999,999'), ',', '.')
                    || ' - '
                    -- Cuando la sede no tiene ese escalon, el precio es el del
                    -- escalon mas cercano y la linea lo dice. Callarlo seria
                    -- cotizar un salon que no le cabe.
                    || case
                           when pr.capacidad_invitados = v_escalon
                               then pr.capacidad_invitados || ' personas'
                           when pr.capacidad_invitados < v_escalon
                               then 'hasta ' || pr.capacidad_invitados || ' personas'
                           else 'desde ' || pr.capacidad_invitados || ' personas'
                       end,
                    ''
                ) as caption,
           e.descripcion
    from elegido e
    join sedes s on s.id_sede = e.sede_id
    -- Precio del escalon del cliente; si la sede no lo tiene, el mas cercano.
    left join lateral (
        select p.precio_total, p.capacidad_invitados
        from precios_sedes p
        where p.sede_id = s.id_sede
          and v_escalon is not null
        order by (p.capacidad_invitados = v_escalon) desc,
                 abs(p.capacidad_invitados - v_escalon),
                 p.capacidad_invitados
        limit 1
    ) pr on true
    -- De la mas economica a la mas cara: es como se lee una lista de precios, y
    -- es como se presenta a mano. Sin precio (sin invitados) van al final.
    order by pr.precio_total nulls last, s.nombre_sede;
end;
$$;

comment on function fn_medios_sedes_cotizacion(text, int) is
    'Una pieza por salon con material cargado -- el video si lo hay, la foto si '
    'no -- con el nombre, el valor PROMOCIONAL y la cantidad de personas ya '
    'escritos en el caption. El precio es el del escalon del cliente, o el del '
    'mas cercano con la aclaracion "hasta/desde N personas". Sin invitados, '
    'devuelve todos sin precio. No repite lo que ese telefono ya recibio. Sin '
    'limite de filas: la cota es cuantas sedes tengan material.';
