-- El rotulo de cada video, definicion final del negocio (2026-08-26).
--
-- Queda asi:
--
--     Salón Sawa - valor PROMOCIONAL: $15.000.000 - 100 personas
--
-- Dos cambios sobre 20260826000001: la palabra "Salón" delante del nombre, y
-- los dos puntos despues de PROMOCIONAL.
--
-- Por que "Salón" no se le pega a todos por igual. Nueve de los catorce nombres
-- YA dicen que tipo de espacio son -- Sede Norte, Casa 4, Mansión Vallano,
-- Hacienda El Talismán, Gran Salón -- y prefijarlos produce "Salón Gran Salón"
-- y "Salón Sede Norte", que se lee como un error de sistema. La palabra se
-- agrega solo cuando el nombre no la trae, que son los cinco que sin ella
-- quedan sueltos: Sawa, Valdemoro, Orquideorama, Pilas Premium y Marquez De
-- Loyola. El negocio pidio el formato con "Salón Sawa" de ejemplo, y Sawa es
-- justamente uno de esos cinco.
--
-- El otro problema que cierra esta migracion: hasta hoy el MISMO video tenia
-- dos nombres segun por donde saliera. En la tanda de cotizacion salia con el
-- rotulo de precio, y si el cliente despues pedia ese salon suelto,
-- fn_medios_para_enviar devolvia `medios.caption`, que seguia diciendo "Así se
-- ve Sawa ✨". El cliente veia dos etiquetas distintas para el mismo archivo.
-- Ahora las dos rutas nombran el salon igual, con fn_nombre_salon.

-- Como se nombra un salon. Una sola definicion, para que la tanda y el envio
-- suelto no puedan discrepar.
create or replace function fn_nombre_salon(p_nombre_sede text)
returns text
language sql
immutable
as $fn$
    -- \M es fin de palabra: "Gran Salón" casa con 'gran', pero un futuro
    -- "Granada Real" no, y llevaria su "Salón" delante como corresponde.
    select case
        when p_nombre_sede is null then null
        when p_nombre_sede ~* '^(sal[oó]n|sede|casa|mansi[oó]n|hacienda|gran)\M'
            then p_nombre_sede
        else 'Salón ' || p_nombre_sede
    end
$fn$;

comment on function fn_nombre_salon(text) is
    'El nombre del salon como se le muestra al cliente. Antepone "Salón" solo '
    'si el nombre no dice ya de que tipo de espacio se trata: evita "Salón Gran '
    'Salón" y "Salón Sede Norte".';

-- La tanda de la cotizacion. Identica a 20260826000001 salvo el caption.
create or replace function fn_medios_sedes_cotizacion(
    p_telefono  text,
    p_invitados int default null
)
returns table (id uuid, tipo text, url text, caption text, descripcion text)
language plpgsql
stable
as $fn$
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
           fn_nombre_salon(s.nombre_sede)
             || coalesce(
                    ' - valor PROMOCIONAL: $'
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
$fn$;

comment on function fn_medios_sedes_cotizacion(text, int) is
    'Una pieza por salon con material cargado -- el video si lo hay, la foto si '
    'no -- con el nombre del salon, el valor PROMOCIONAL y la cantidad de '
    'personas ya escritos en el caption. El precio es el del escalon del '
    'cliente, o el del mas cercano con la aclaracion "hasta/desde N personas". '
    'Sin invitados, devuelve todos sin precio. No repite lo que ese telefono ya '
    'recibio.';

-- Y el envio suelto deja de decir "Así se ve X ✨". El caption de la fila no
-- puede llevar precio -- esa ruta no sabe cuantos invitados son -- pero si el
-- mismo nombre, que es lo que hacia que el cliente viera dos etiquetas para el
-- mismo video.
update medios m
   set caption = fn_nombre_salon(s.nombre_sede),
       descripcion = case m.tipo when 'video' then 'Video de ' else 'Foto de ' end
                     || fn_nombre_salon(s.nombre_sede)
  from sedes s
 where s.id_sede = m.sede_id;

-- Nadie puede quedar con el rotulo viejo ni sin nombre.
do $test$
declare v_malos text;
begin
    select string_agg(coalesce(s.nombre_sede, '(sin sede)') || ' -> ' || coalesce(m.caption, '(null)'),
                      ', ' order by s.nombre_sede)
      into v_malos
      from medios m
      join sedes s on s.id_sede = m.sede_id
     where m.caption is distinct from fn_nombre_salon(s.nombre_sede);

    if v_malos is not null then
        raise exception 'Medios de sede con el caption sin actualizar: %', v_malos;
    end if;

    if fn_nombre_salon('Gran Salón') <> 'Gran Salón'
       or fn_nombre_salon('Sede Norte') <> 'Sede Norte'
       or fn_nombre_salon('Casa 4') <> 'Casa 4'
       or fn_nombre_salon('Mansión Vallano') <> 'Mansión Vallano'
       or fn_nombre_salon('Hacienda El Talismán') <> 'Hacienda El Talismán'
       or fn_nombre_salon('Sawa') <> 'Salón Sawa'
       or fn_nombre_salon('Valdemoro') <> 'Salón Valdemoro'
       or fn_nombre_salon('Orquideorama') <> 'Salón Orquideorama'
       or fn_nombre_salon('Pilas Premium') <> 'Salón Pilas Premium'
       or fn_nombre_salon('Marquez De Loyola') <> 'Salón Marquez De Loyola'
    then
        raise exception 'fn_nombre_salon no nombra los salones como se espera';
    end if;
end;
$test$;
