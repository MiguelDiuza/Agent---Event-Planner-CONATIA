-- El ultimo ILIKE sobre nombre_paquete (2026-08-26).
--
-- 20260826000006 arreglo los dos nodos que arman la cotizacion, pero quedaban
-- dos funciones con exactamente el mismo patron: la rama `tipo_evento` de
-- fn_medios_para_enviar y la de fn_medios_diagnostico, que resuelven "mandame
-- material de este tipo de evento" con `nombre_paquete ilike v_patron`. Mismo
-- bug: "15 Anos" o "Cumpleanos" sin tilde no encuentran nada.
--
-- Hoy la rama esta dormida -- no hay ningun medio colgado de un tipo_evento,
-- todos cuelgan de una sede o son institucionales -- asi que no se rompe nada
-- en produccion. Se arregla igual: el dia que alguien catalogue fotos de
-- montajes de quince, esto fallaria en silencio y nadie se acordaria de por que.
--
-- El `order by` que desempataba entre paquetes se cae con el cambio:
-- fn_resolver_tipo_evento ya devuelve uno solo, y lo elige mejor.
--
-- Las definiciones se sacaron de pg_get_functiondef y se les cambio unicamente
-- ese bloque; el resto de las dos funciones queda igual, incluidas las guardas
-- de 20260814000008 (normalizacion y validacion de p_categoria/p_tipo_medio,
-- teléfono obligatorio para el anti-repeticion).

CREATE OR REPLACE FUNCTION public.fn_medios_para_enviar(p_categoria text, p_referencia text, p_telefono text, p_tipo_medio text DEFAULT 'ambos'::text)
 RETURNS TABLE(id uuid, tipo text, url text, caption text, descripcion text)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    v_categoria  text := lower(btrim(coalesce(p_categoria, '')));
    v_tipo_medio text := lower(btrim(coalesce(p_tipo_medio, '')));
    v_referencia text := btrim(coalesce(p_referencia, ''));
    v_patron text := '%' ||
        replace(replace(replace(v_referencia, '\', '\\'), '%', '\%'), '_', '\_')
        || '%';
begin
    if v_categoria not in ('sede', 'tipo_evento', 'servicio', 'institucional') then
        raise exception
            'p_categoria invalida: %. Valores aceptados: sede, tipo_evento, servicio, institucional.',
            coalesce(quote_literal(p_categoria), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_para_enviar(categoria, referencia, telefono, tipo_medio).';
    end if;

    if v_tipo_medio not in ('imagen', 'video', 'ambos') then
        raise exception
            'p_tipo_medio invalido: %. Valores aceptados: imagen, video, ambos.',
            coalesce(quote_literal(p_tipo_medio), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_para_enviar(categoria, referencia, telefono, tipo_medio).';
    end if;

    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    return query
    select m.id, m.tipo, m.url, m.caption, m.descripcion
    from medios m
    where m.activo
      and (v_tipo_medio = 'ambos' or m.tipo = v_tipo_medio)
      and case v_categoria
            when 'sede' then (length(v_referencia) > 0
                and m.sede_id = (
                    select s.id_sede from sedes s
                    where s.nombre_sede ilike v_patron escape '\'
                    order by (lower(s.nombre_sede) = lower(v_referencia)) desc,
                             length(s.nombre_sede), s.nombre_sede
                    limit 1))
            when 'tipo_evento' then (length(v_referencia) > 0
                and m.tipo_evento_id = (
                    select te.id_evento from tipos_evento te
                    -- Resuelto por funcion y no por ilike: el ilike no encontraba
                    -- '15 Anos' ni 'Cumpleanos' sin tilde (ver 20260826000006). La
                    -- funcion ya devuelve un solo paquete, asi que sobra el desempate.
                    where te.nombre_paquete = fn_resolver_tipo_evento(v_referencia)
                    limit 1))
            when 'servicio' then (length(v_referencia) > 0
                and m.servicio_id = (
                    select sv.id from servicios_adicionales_upselling sv
                    where sv.servicio ilike v_patron escape '\'
                    order by (lower(sv.servicio) = lower(v_referencia)) desc,
                             length(sv.servicio), sv.servicio
                    limit 1))
            when 'institucional' then (
                m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null
                and (length(v_referencia) = 0 or m.etiqueta ilike v_patron escape '\'))
          end
      and not exists (
            select 1 from envios_medios e
            join leads l on l.id = e.lead_id
            where e.medio_id = m.id and l.telefono = p_telefono
      )
    order by m.orden, m.created_at, m.id
    limit 3;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_medios_diagnostico(p_categoria text, p_referencia text, p_tipo_medio text DEFAULT 'ambos'::text)
 RETURNS TABLE(total_existentes bigint, referencias_disponibles text)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    v_categoria  text := lower(btrim(coalesce(p_categoria, '')));
    v_tipo_medio text := lower(btrim(coalesce(p_tipo_medio, '')));
    v_referencia text := btrim(coalesce(p_referencia, ''));
    v_patron text := '%' ||
        replace(replace(replace(v_referencia, '\', '\\'), '%', '\%'), '_', '\_')
        || '%';
begin
    if v_categoria not in ('sede', 'tipo_evento', 'servicio', 'institucional') then
        raise exception
            'p_categoria invalida: %. Valores aceptados: sede, tipo_evento, servicio, institucional.',
            coalesce(quote_literal(p_categoria), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_diagnostico(categoria, referencia, tipo_medio) NO recibe telefono.';
    end if;

    if v_tipo_medio not in ('imagen', 'video', 'ambos') then
        raise exception
            'p_tipo_medio invalido: %. Valores aceptados: imagen, video, ambos.',
            coalesce(quote_literal(p_tipo_medio), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_diagnostico(categoria, referencia, tipo_medio) NO recibe telefono.';
    end if;

    return query
    select
        (select count(*)
         from medios m
         where m.activo
           and (v_tipo_medio = 'ambos' or m.tipo = v_tipo_medio)
           and case v_categoria
                 when 'sede' then (length(v_referencia) > 0
                     and m.sede_id = (
                         select s.id_sede from sedes s
                         where s.nombre_sede ilike v_patron escape '\'
                         order by (lower(s.nombre_sede) = lower(v_referencia)) desc,
                                  length(s.nombre_sede), s.nombre_sede
                         limit 1))
                 when 'tipo_evento' then (length(v_referencia) > 0
                     and m.tipo_evento_id = (
                         select te.id_evento from tipos_evento te
                         -- Resuelto por funcion y no por ilike: el ilike no encontraba
                         -- '15 Anos' ni 'Cumpleanos' sin tilde (ver 20260826000006). La
                         -- funcion ya devuelve un solo paquete, asi que sobra el desempate.
                         where te.nombre_paquete = fn_resolver_tipo_evento(v_referencia)
                         limit 1))
                 when 'servicio' then (length(v_referencia) > 0
                     and m.servicio_id = (
                         select sv.id from servicios_adicionales_upselling sv
                         where sv.servicio ilike v_patron escape '\'
                         order by (lower(sv.servicio) = lower(v_referencia)) desc,
                                  length(sv.servicio), sv.servicio
                         limit 1))
                 when 'institucional' then (
                     m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null
                     and (length(v_referencia) = 0 or m.etiqueta ilike v_patron escape '\'))
               end),
        (select string_agg(distinct v.referencia, ', ' order by v.referencia)
         from vista_catalogo_medios v
         where v.categoria = v_categoria);
end;
$function$;

-- Que las dos sigan compilando y resolviendo: un tipo sin tilde tiene que
-- llegar al mismo paquete que el nombre canonico.
do $test$
begin
    if fn_resolver_tipo_evento('15 Anos') is distinct from '15 Años' then
        raise exception 'el resolver dejo de funcionar para 15 Anos';
    end if;
    -- Las dos funciones se invocan para comprobar que compilan y no revientan
    -- con una referencia sin tilde. Cero filas es la respuesta correcta hoy:
    -- no hay medios colgados de un tipo de evento.
    perform * from fn_medios_para_enviar('tipo_evento', 'Cumpleanos', 'test-migracion', 'ambos');
    perform * from fn_medios_diagnostico('tipo_evento', 'Cumpleanos', 'ambos');
end;
$test$;
