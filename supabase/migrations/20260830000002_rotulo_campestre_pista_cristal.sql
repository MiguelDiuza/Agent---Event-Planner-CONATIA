-- Agrega rotulo de (Campestre), (Incluye pista de cristal) o ambos al caption de los videos de sedes.
--
-- Definición del negocio (2026-08-30):
-- En los videos donde aparece el precio, se debe especificar si el salón es campestre
-- y/o si incluye pista de cristal de lujo. Si no aplica ninguna de las dos, el mensaje
-- se deja tal como estaba.
--
-- Formato resultante:
-- - Si es campestre y tiene pista de cristal (Casa Christian's Ciudad Jardín):
--     "Casa Christian's Ciudad Jardín (Campestre - Incluye pista de cristal) - valor PROMOCIONAL: $17.000.000 - 150 personas"
-- - Si solo incluye pista de cristal (Sede Norte, Sede Granada Gold):
--     "Sede Norte (Incluye pista de cristal) - valor PROMOCIONAL: $13.000.000 - 150 personas"
-- - Si solo es campestre (Casa 4, Casa 5, Casa 74, Mansión Vallano, Marquez De Loyola, Sawa, Hacienda El Talismán):
--     "Casa 4 (Campestre) - valor PROMOCIONAL: $20.000.000 - 150 personas"
-- - Si no tiene ninguna (Sede Sur 66, Pilas Premium, Gran Salón, Valdemoro, Orquideorama):
--     "Sede Sur 66 Mundo Foto - valor PROMOCIONAL: $12.000.000 - 150 personas"

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

    v_clave := fn_aforos_clave(v_aforos);

    return query
    with elegido as (
        select distinct on (m.sede_id)
               m.id, m.tipo, m.url, m.descripcion, m.sede_id
        from medios m
        where m.activo
          and m.sede_id is not null
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
    aforos_sede as (
        select e.id as medio_id, p.capacidad_invitados as aforo, p.precio_total
        from elegido e
        join precios_sedes p
          on p.sede_id = e.sede_id
         and p.capacidad_invitados = any(v_aforos)
    ),
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
                   || case
                          when s.tipo_espacio = 'campestre' and s.incluye_pista_cristal then ' (Campestre - Incluye pista de cristal)'
                          when s.tipo_espacio = 'campestre' then ' (Campestre)'
                          when s.incluye_pista_cristal then ' (Incluye pista de cristal)'
                          else ''
                      end
                   || ' - valor PROMOCIONAL: $'
                   || replace(to_char(pu.precio_total, 'FM999,999,999'), ',', '.')
                   || ' - ' || pu.aforo || ' personas'
               else
                   fn_nombre_salon(s.nombre_sede)
                   || case
                          when s.tipo_espacio = 'campestre' and s.incluye_pista_cristal then ' (Campestre - Incluye pista de cristal)'
                          when s.tipo_espacio = 'campestre' then ' (Campestre)'
                          when s.incluye_pista_cristal then ' (Incluye pista de cristal)'
                          else ''
                      end
                   || ' - Disponible para ' || rm.aforos_texto || ' personas'
           end as caption,
           e.descripcion
    from elegido e
    join sedes s on s.id_sede = e.sede_id
    left join precio_unico  pu on pu.medio_id = e.id
    left join resumen_multi rm on rm.medio_id = e.id
    where case when array_length(v_aforos, 1) = 1
               then pu.medio_id is not null
               else rm.medio_id is not null
          end
    order by (case when array_length(v_aforos, 1) = 1 then pu.precio_total end) nulls last,
             s.nombre_sede;
end;
$function$;

comment on function fn_medios_sedes_cotizacion(text, text, boolean) is
    'Tanda de la cotización con rotulo de precio y badges de (Campestre) y/o (Incluye pista de cristal). Multi-aforo compatible.';

-- Actualiza también medios.caption para envíos sueltos individuales
update medios m
   set caption = fn_nombre_salon(s.nombre_sede)
                 || case
                        when s.tipo_espacio = 'campestre' and s.incluye_pista_cristal then ' (Campestre - Incluye pista de cristal)'
                        when s.tipo_espacio = 'campestre' then ' (Campestre)'
                        when s.incluye_pista_cristal then ' (Incluye pista de cristal)'
                        else ''
                    end
  from sedes s
 where s.id_sede = m.sede_id;
