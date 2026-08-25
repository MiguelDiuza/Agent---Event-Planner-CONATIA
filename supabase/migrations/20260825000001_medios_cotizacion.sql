-- La tanda de videos de la cotización (2026-08-25).
--
-- Regla del negocio: después de cotizar, el cliente recibe el video de TODOS
-- los salones juntos, cada uno etiquetado con su nombre, si es cerrado o
-- campestre, y el precio para SU cantidad de invitados.
--
-- Estar en la tanda depende de tener un video activo en `medios`, nada más. La
-- clasificación (`sedes.tipo_espacio`) solo decide el rótulo: una sede sin
-- clasificar manda su video sin decir de qué tipo es.
--
-- "TODOS" es literal (2026-08-25): no se filtra por capacidad. Un salón que no
-- alcanza para esa cantidad de invitados igual se muestra, con el precio de su
-- escalón más cercano y la aclaración "hasta N invitados" en el rótulo. La
-- decisión es del negocio: prefieren que el cliente vea todo el inventario y
-- ajustar después, antes que esconderle salones.
--
-- Por qué es una función y no varias llamadas a fn_medios_para_enviar:
--
-- 1. El precio del caption lo arma la base. Si lo escribiera el agente, el
--    número del video y el número que dijo al cotizar podrían discrepar, y el
--    caption es lo que el cliente relee después.
-- 2. El escalón se redondea aquí con la misma regla que usa el cotizador (55
--    invitados cotizan como 60), así que no hay dos verdades sobre el precio.
-- 3. fn_medios_para_enviar tiene `limit 3` y resuelve UNA referencia por
--    llamada. Servía para "muéstrame ese salón"; no para la tanda completa.
--
-- Comparte la forma de salida con fn_medios_para_enviar (id, tipo, url,
-- caption, descripcion) para que el bucle de envío del sub-workflow no cambie.
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
    -- Sin teléfono no hay a quién enviarle ni con qué filtrar lo ya enviado.
    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    return query
    select m.id,
           m.tipo,
           m.url,
           -- El rotulo que pidio el negocio: "Asi se ve X (salon cubierta
           -- cerrada) - $1.000.000". El precio lo pone la base y no el agente
           -- para que el numero del video y el que dijo al cotizar no puedan
           -- discrepar.
           'Así se ve ' || s.nombre_sede
             -- Una sede sin clasificar va sin rótulo de tipo, no fuera de la
             -- tanda: el negocio prefiere que el video salga igual y ponerle la
             -- etiqueta después (2026-08-25).
             || coalesce(case s.tipo_espacio
                    when 'cerrado'   then ' (salón cubierta cerrada)'
                    when 'campestre' then ' (salón campestre)'
                end, '')
             || coalesce(
                    ' - $' || replace(to_char(pr.precio_total, 'FM999,999,999'), ',', '.')
                    -- Cuando la sede no tiene ese escalon, el precio es el del
                    -- escalon mas cercano y la linea lo dice. Callarlo seria
                    -- cotizar un salon que no le cabe.
                    || case
                           when pr.capacidad_invitados = v_escalon then ''
                           when pr.capacidad_invitados < v_escalon
                               then ' hasta ' || pr.capacidad_invitados || ' invitados'
                           else ' desde ' || pr.capacidad_invitados || ' invitados'
                       end,
                    ''
                )
             || ' ✨' as caption,
           m.descripcion
    from medios m
    join sedes s on s.id_sede = m.sede_id
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
    where m.activo
      -- Solo video: la tanda es de recorridos. Las fotos siguen saliendo por
      -- fn_medios_para_enviar cuando el cliente pregunta por un salon suelto.
      and m.tipo = 'video'
      -- El mismo filtro anti-repeticion de fn_medios_para_enviar.
      and not exists (
            select 1
            from envios_medios e
            join leads l on l.id = e.lead_id
            where e.medio_id = m.id
              and l.telefono = p_telefono
      )
    -- Cerrados, campestres y al final las que todavia no tienen tipo (el
    -- booleano da NULL y los NULL van ultimos). Dentro de cada grupo, de menor
    -- a mayor precio: el cliente ve primero la opcion mas economica, que es
    -- como se presenta a mano.
    order by (s.tipo_espacio = 'campestre'), pr.precio_total nulls last, s.nombre_sede;
end;
$$;

comment on function fn_medios_sedes_cotizacion(text, int) is
    'Videos de todos los salones con material cargado, con el nombre, el tipo '
    'de espacio (si está clasificado) y el precio ya escritos en el caption. El '
    'precio es el del escalón del cliente, o el del más cercano con la '
    'aclaración "hasta/desde N invitados". Sin invitados, devuelve todos sin '
    'precio. No repite lo que ese teléfono ya recibió. Sin límite de filas: la '
    'cota es cuántas sedes estén clasificadas.';
