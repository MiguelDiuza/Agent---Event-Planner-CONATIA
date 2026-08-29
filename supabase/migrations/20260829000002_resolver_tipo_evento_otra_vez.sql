-- El resolver de tipo_evento, otra vez.
--
-- 20260826000007 ya había cambiado estas funciones para resolver el tipo de
-- evento con `fn_resolver_tipo_evento` en vez de un `ilike`, porque el ilike no
-- encuentra "15 Anos" ni "Cumpleanos" sin tilde -- y el modelo escribe esas
-- formas constantemente.
--
-- Tres días después, 20260826000010 volvió a crear `fn_medios_para_enviar` para
-- añadirle `p_reenviar`, y lo hizo, textual en su comentario, con el "mismo
-- cuerpo de 20260814000008": un cuerpo ANTERIOR al arreglo. El resolver se
-- perdió ahí, sin que nada lo dijera.
--
-- No se notó porque la rama estaba dormida: no había ni un solo medio colgado
-- de un tipo de evento. 20260826000007 lo había previsto por escrito -- "el día
-- que alguien catalogue material de quince, esto fallaría en silencio" -- y eso
-- es exactamente lo que pasó hoy al catalogar el video de los vestidos: la
-- clienta pregunta por los vestidos, el agente pide 'tipo_evento' / '15 Anos',
-- y no sale nada.
--
-- Esta vez el cuerpo se saca de la definición VIVA con pg_get_functiondef y se
-- le cambia ÚNICAMENTE ese bloque, que es lo que había que hacer la otra vez.
-- Y queda una prueba que lo vigila: scripts/probar-medios-evento.js.

CREATE OR REPLACE FUNCTION public.fn_medios_para_enviar(p_categoria text, p_referencia text, p_telefono text, p_tipo_medio text DEFAULT 'ambos'::text, p_reenviar boolean DEFAULT false)
 RETURNS TABLE(id uuid, tipo text, url text, caption text, descripcion text)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    v_categoria  text := lower(btrim(coalesce(p_categoria, '')));
    v_tipo_medio text := lower(btrim(coalesce(p_tipo_medio, '')));
    v_referencia text := btrim(coalesce(p_referencia, ''));
    v_reenviar   boolean := coalesce(p_reenviar, false);
    -- Escape de metacaracteres LIKE: la referencia viene de un LLM que relaya
    -- mensajes de desconocidos. Sin esto, un '%' convierte "busca una sede" en
    -- "devuelve todas". Backslash primero, luego % y _.
    v_patron text := '%' ||
        replace(replace(replace(v_referencia, '\', '\\'), '%', '\%'), '_', '\_')
        || '%';
begin
    if v_categoria not in ('sede', 'tipo_evento', 'servicio', 'institucional') then
        raise exception
            'p_categoria invalida: %. Valores aceptados: sede, tipo_evento, servicio, institucional.',
            coalesce(quote_literal(p_categoria), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_para_enviar(categoria, referencia, telefono, tipo_medio, reenviar).';
    end if;

    if v_tipo_medio not in ('imagen', 'video', 'ambos') then
        raise exception
            'p_tipo_medio invalido: %. Valores aceptados: imagen, video, ambos.',
            coalesce(quote_literal(p_tipo_medio), 'NULL')
            using errcode = '22023',
                  hint = 'Revisa el orden de los parametros: fn_medios_para_enviar(categoria, referencia, telefono, tipo_medio, reenviar).';
    end if;

    -- Sin telefono utilizable no hay forma de saber que vio ya este cliente.
    -- Devolver material seria reenviarlo a ciegas; se devuelve nada. Vale
    -- tambien con p_reenviar: sin telefono `fn_registrar_envio` no inserta y
    -- el envio quedaria fuera de la bitacora.
    if p_telefono is null or btrim(p_telefono) = '' then
        return;
    end if;

    return query
    select m.id, m.tipo, m.url, m.caption, m.descripcion
    from medios m
    where m.activo
      and (v_tipo_medio = 'ambos' or m.tipo = v_tipo_medio)
      -- Si la referencia no existe, la subconsulta da NULL, la comparacion da
      -- NULL y no sale ninguna fila: el caso de error se resuelve sin logica
      -- adicional. El orden prefiere coincidencias exactas, luego nombres
      -- cortos (mas probable que sean el registro concreto), luego alfabetico.
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
                    -- Resuelto por funcion y no por ilike: el ilike no encuentra
                    -- '15 Anos' ni 'Cumpleanos' sin tilde, y el modelo escribe esas
                    -- formas. La funcion ya devuelve un solo paquete, asi que sobra
                    -- el desempate. Ver 20260826000006.
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
                m.sede_id is null and m.tipo_evento_id is null and m.servicio_id is null)
          end
      -- El anti-repeticion. Es la regla por defecto, y solo la levanta un
      -- pedido explicito del cliente que el agente traduce en p_reenviar.
      and (v_reenviar or not exists (
            select 1 from envios_medios e
            join leads l on l.id = e.lead_id
            where e.medio_id = m.id and l.telefono = p_telefono
      ))
    order by m.orden, m.created_at, m.id
    limit 3;
end;
$function$
;
