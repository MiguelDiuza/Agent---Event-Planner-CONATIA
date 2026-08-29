-- El cliente que cambia de aforo recibía 2 salones en vez de 15.
--
-- Chat real del 2026-08-29 (ejecuciones 4635 y 4845 del VPS). Juan pidió
-- cotización de 15 Años para 60 personas y recibió los 13 salones que sirven
-- para ese aforo. Más tarde, en el mismo chat, pidió Matrimonio para 100. La
-- tanda de 100 tiene 15 salones. Le llegaron dos.
--
-- LA CAUSA. El anti-repetición de `fn_medios_sedes_cotizacion` excluía un
-- salón si el cliente había recibido CUALQUIER pieza suya alguna vez:
--
--     and not exists (... where m2.sede_id = m.sede_id and l.telefono = ...)
--
-- Sin mirar con qué aforo se la mandó. Los 13 que ya había visto a 60 quedaron
-- fuera, y solo pasaron los dos que no existen a 60 y sí a 100 -- Gran Salón y
-- Valdemoro. El síntoma parece un límite de 3 (y `fn_medios_para_enviar` tiene
-- uno), pero ese es otro camino: aquí no había límite ninguno, había un filtro
-- que borraba casi todo.
--
-- Por qué no se veía: `envios_medios` no guardaba el aforo, así que no había
-- forma de distinguir "ya vio Casa 5" de "ya vio Casa 5 al precio de 100
-- personas". Y probar la función contra una base recién vaciada -- sin envíos
-- -- devuelve los 15 y da por buena la tanda: el filtro solo aparece en el
-- segundo pedido del mismo cliente.
--
-- LO QUE CAMBIA. El caption del video de un salón lo arma la base y lleva
-- dentro el PRECIO de ese aforo ("Casa 5 - valor PROMOCIONAL: $20.500.000 -
-- 150 personas"). O sea que la misma pieza con dos aforos distintos son dos
-- mensajes distintos, y el anti-repetición tiene que contar el aforo como
-- parte de la identidad de lo enviado. `envios_medios.aforo_clave` guarda con
-- qué aforo salió cada pieza, y el filtro compara sede + aforo.
--
-- Consecuencias, todas queridas:
--   - Mismo aforo otra vez  -> sigue sin repetirse (rama (a) del Diagnóstico).
--   - Otro aforo            -> sale la tanda entera con los precios nuevos.
--   - Salón suelto y luego la tanda -> el salón vuelve a salir, ahora con
--     precio. Antes quedaba fuera para siempre por haberlo visto sin precio.
--
-- Las filas que ya existen quedan con `aforo_clave` nulo: para ellas el filtro
-- se comporta como si se hubieran mandado sin aforo, así que la primera tanda
-- posterior a esta migración vuelve a salir entera. La base está vacía hoy, así
-- que no afecta a nadie.

-- ---------------------------------------------------------------------------
-- La normalización de aforos, en UN solo sitio.
--
-- Estaba copiada en tres: dentro de fn_medios_sedes_cotizacion, en el nodo
-- `Guion Cotización` y en fn_reserva_anotar. Ahora que el aforo además se
-- GUARDA, dos copias que se separen dejan de encontrarse entre sí y el filtro
-- se rompe en silencio -- que es el fallo que esta migración arregla.
--
-- Escalón de 10 en 10, con piso 50 y techo 200: los escalones que existen en
-- `precios_sedes`. "55" sube a 60, "10" sube a 50, "210" baja a 200.
create or replace function fn_aforos_normalizar(p_invitados text)
returns int[]
language sql
immutable
as $function$
    select array_agg(distinct v.aforo order by v.aforo)
    from (
        select least(200, greatest(50, (ceil(n.valor / 10.0) * 10)::int)) as aforo
        from unnest(string_to_array(coalesce(p_invitados, ''), ',')) as t(raw)
        cross join lateral (select nullif(btrim(t.raw), '')::numeric as valor) as n
        where n.valor is not null and n.valor > 0
    ) v;
$function$;

comment on function fn_aforos_normalizar(text) is
  'Los aforos de un pedido ("100" o "50,100,130") llevados a los escalones del catalogo. Ver 20260829000003.';


-- La huella del aforo con el que salió una pieza. Es lo que se guarda en
-- `envios_medios` y lo que compara el anti-repetición: dos envíos son "el
-- mismo" solo si coinciden la sede Y esta clave.
--
-- Un solo aforo da '100'; varios dan '50,100,130' -- y son captions distintos
-- (los de varios aforos no llevan precio, solo "Disponible para ..."), así que
-- tampoco deben taparse entre sí.
create or replace function fn_aforos_clave(p_aforos int[])
returns text
language sql
immutable
as $function$
    select nullif(array_to_string(coalesce(p_aforos, '{}'::int[]), ','), '');
$function$;

comment on function fn_aforos_clave(integer[]) is
  'La clave de aforo que identifica un envio de la tanda. Ver 20260829000003.';


-- ¿Este pedido es la TANDA de cotización, o un salón concreto?
--
-- La condición estaba escrita a mano en tres nodos (`Seleccionar Medios`,
-- `Diagnóstico`, `Guion Cotización`). Aquí hace falta una cuarta vez -- para
-- decidir si el envío lleva aforo -- y una cuarta copia de la misma frase es
-- justo como empiezan las divergencias mudas de este proyecto.
create or replace function fn_es_tanda(p_categoria text, p_referencia text)
returns boolean
language sql
immutable
as $function$
    select lower(btrim(coalesce(p_categoria, ''))) = 'sede'
       and lower(btrim(coalesce(p_referencia, ''))) in ('', 'todas', 'todos', 'todas las sedes');
$function$;

comment on function fn_es_tanda(text, text) is
  'Si un pedido a enviar_medios es la tanda de cotizacion y no un salon suelto. Ver 20260829000003.';


-- ---------------------------------------------------------------------------
-- El aforo con el que salió cada pieza.
alter table envios_medios add column if not exists aforo_clave text;

comment on column envios_medios.aforo_clave is
  'Con que aforo salio la pieza ("100", "50,100,130"). NULL = fuera de la tanda. Ver 20260829000003.';

-- El anti-repetición pregunta siempre por (lead, aforo_clave).
create index if not exists idx_envios_medios_lead_aforo
    on envios_medios (lead_id, aforo_clave);


-- ---------------------------------------------------------------------------
-- Registrar el envío, ahora anotando el aforo.
--
-- Los tres parámetros nuevos son OBLIGATORIOS a propósito: con valores por
-- defecto, la llamada de dos argumentos del nodo viejo quedaría ambigua entre
-- las dos versiones y Postgres la rechazaría ("function is not unique") en
-- medio de un despliegue. Sin defaults, cada aridad resuelve a una sola
-- función y el workflow se puede actualizar después de la migración sin dejar
-- ni un segundo de envíos sin registrar.
create or replace function fn_registrar_envio(
    p_medio_id   uuid,
    p_telefono   text,
    p_categoria  text,
    p_referencia text,
    p_invitados  text
)
returns uuid
language sql
as $function$
    insert into envios_medios (lead_id, medio_id, aforo_clave)
    select l.id,
           p_medio_id,
           case when fn_es_tanda(p_categoria, p_referencia)
                then fn_aforos_clave(fn_aforos_normalizar(p_invitados))
           end
    from leads l
    where l.telefono = p_telefono
    returning id;
$function$;

comment on function fn_registrar_envio(uuid, text, text, text, text) is
  'Anota que se le mando una pieza a un cliente, y con que aforo. Ver 20260829000003.';

-- La versión de dos argumentos se queda como envoltorio: registra sin aforo,
-- que es lo que hacía antes. Cualquier llamador que no se haya actualizado
-- sigue funcionando, y se le nota -- deja `aforo_clave` nulo.
create or replace function fn_registrar_envio(p_medio_id uuid, p_telefono text)
returns uuid
language sql
as $function$
    select fn_registrar_envio(p_medio_id, p_telefono, null::text, null::text, null::text);
$function$;

comment on function fn_registrar_envio(uuid, text) is
  'Envoltorio historico: registra sin aforo. Usa la version de 5 argumentos. Ver 20260829000003.';


-- ---------------------------------------------------------------------------
-- LA TANDA. Igual que antes salvo el anti-repetición, que ahora mira el aforo.
CREATE OR REPLACE FUNCTION public.fn_medios_sedes_cotizacion(p_telefono text, p_invitados text, p_reenviar boolean DEFAULT false)
 RETURNS TABLE(id uuid, tipo text, url text, caption text, descripcion text)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    v_reenviar boolean := coalesce(p_reenviar, false);
    v_aforos   int[];
    v_clave    text;
begin
    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    v_aforos := fn_aforos_normalizar(p_invitados);

    if v_aforos is null or array_length(v_aforos, 1) = 0 then
        return;
    end if;

    -- Con esta clave salieron -- o no salieron -- las piezas de esta tanda.
    v_clave := fn_aforos_clave(v_aforos);

    return query
    with elegido as (
        select distinct on (m.sede_id)
               m.id, m.tipo, m.url, m.descripcion, m.sede_id
        from medios m
        where m.activo
          and m.sede_id is not null
          -- EL ANTI-REPETICION. Se compara sede + aforo, no sede a secas: el
          -- caption lleva dentro el precio de ESTE aforo, asi que el mismo
          -- video con otro aforo es otro mensaje y tiene que poder salir.
          -- `is not distinct from` y no `=` porque las filas de fuera de la
          -- tanda tienen la clave nula y nunca deben tapar una tanda.
          and (v_reenviar or not exists (
                select 1
                from envios_medios e
                join leads  l  on l.id = e.lead_id
                join medios m2 on m2.id = e.medio_id
                where m2.sede_id = m.sede_id
                  and l.telefono = p_telefono
                  and e.aforo_clave is not distinct from v_clave
          ))
        order by m.sede_id, (m.tipo = 'video') desc, m.orden, m.created_at
    ),
    -- EL FILTRO. Un join, no un `order by ... limit 1`: el salon que no tiene
    -- fila para el aforo pedido se cae aqui y no llega al select final.
    aforos_sede as (
        select e.id as medio_id, p.capacidad_invitados as aforo, p.precio_total
        from elegido e
        join precios_sedes p
          on p.sede_id = e.sede_id
         and p.capacidad_invitados = any(v_aforos)
    ),
    -- Lista en espanol: comas entre todos menos los dos ultimos, "y" antes
    -- del ultimo. "130" con uno solo, "100 y 130" con dos, "50, 100 y 130"
    -- con tres o mas.
    resumen_multi as (
        select medio_id,
               case
                   when array_length(arr, 1) = 1 then arr[1]::text
                   else array_to_string(arr[1 : array_length(arr, 1) - 1], ', ')
                        || ' y ' || arr[array_length(arr, 1)]::text
               end as aforos_texto
        from (
            select medio_id, array_agg(aforo order by aforo) as arr
            from aforos_sede
            group by medio_id
        ) t
    ),
    -- Con un solo aforo el precio sale del mismo join filtrado: ya no hay
    -- "el escalon mas cercano", solo el escalon pedido.
    precio_unico as (
        select a.medio_id, a.precio_total, a.aforo
        from aforos_sede a
        where array_length(v_aforos, 1) = 1
    )
    select e.id,
           e.tipo,
           e.url,
           case
               when array_length(v_aforos, 1) = 1 then
                   fn_nombre_salon(s.nombre_sede)
                   || ' - valor PROMOCIONAL: $'
                   || replace(to_char(pu.precio_total, 'FM999,999,999'), ',', '.')
                   || ' - ' || pu.aforo || ' personas'
               else
                   fn_nombre_salon(s.nombre_sede) || ' - Disponible para ' || rm.aforos_texto || ' personas'
           end as caption,
           e.descripcion
    from elegido e
    join sedes s on s.id_sede = e.sede_id
    left join precio_unico  pu on pu.medio_id = e.id
    left join resumen_multi rm on rm.medio_id = e.id
    -- Con un aforo manda precio_unico; con varios, resumen_multi. En los dos
    -- casos, no estar ahi significa que el salon no aplica a lo que pidieron.
    where case when array_length(v_aforos, 1) = 1
               then pu.medio_id is not null
               else rm.medio_id is not null
          end
    order by (case when array_length(v_aforos, 1) = 1 then pu.precio_total end) nulls last,
             s.nombre_sede;
end;
$function$;


-- ---------------------------------------------------------------------------
-- Y lo que decide la antesala del guion, con el MISMO filtro.
--
-- Si esta función y la tanda no aplican el mismo anti-repetición, la antesala
-- promete videos que luego no salen -- o calla los que sí van a salir. Antes
-- del 2026-08-29 las dos miraban sede a secas; ahora las dos miran sede +
-- aforo.
CREATE OR REPLACE FUNCTION public.fn_hay_material_sedes(p_telefono text, p_aforos integer[], p_reenviar boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    select exists (
        select 1
        from medios m
        join precios_sedes p
          on p.sede_id = m.sede_id
         and p.capacidad_invitados = any(coalesce(p_aforos, '{}'::int[]))
        where m.activo
          and m.sede_id is not null
          and (coalesce(p_reenviar, false) or not exists (
                select 1
                from envios_medios e
                join leads  l  on l.id = e.lead_id
                join medios m2 on m2.id = e.medio_id
                where m2.sede_id = m.sede_id
                  and l.telefono = p_telefono
                  and e.aforo_clave is not distinct from fn_aforos_clave(p_aforos)
          ))
    );
$function$;
