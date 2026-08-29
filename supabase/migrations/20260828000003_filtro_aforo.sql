-- RECONSTRUIDA EL 2026-08-29 DESDE LA BASE DE PRODUCCIÓN.
--
-- Esta migración se aplicó el 2026-08-28 sin que su archivo llegara al repo, y
-- `supabase_migrations.schema_migrations` la registró con `statements` vacío,
-- así que el SQL original no existe en ninguna parte. Lo que hay aquí se sacó
-- de la base con `pg_get_functiondef` y de `information_schema`: reproduce el
-- estado que corre hoy, no necesariamente el texto que se escribió entonces.
--
-- Se reconstruye porque sin ella un `supabase db reset` daba una base DISTINTA
-- de producción, en silencio: faltaría `fn_hay_material_sedes`, y `Diagnóstico` no
-- podría distinguir "no hay material para ese aforo" de "ya se lo mandaste todo".
--
-- Todo va en `create or replace` / `if not exists`, así que volver a aplicarla
-- sobre la base actual no cambia nada.

-- ¿Le queda a este cliente algún salón por ver, de los que sirven para ESE
-- aforo?
--
-- El matiz que justifica la función: hasta el 2026-08-28 se miraba si quedaba
-- material sin mandar SIN mirar el aforo. Con eso, un cliente de 200 personas
-- -- que solo tiene ocho salones disponibles -- daba "sí queda material"
-- porque los otros siete nunca se le habían mandado, y el diagnóstico le decía
-- al agente que reenviara algo que no existía para su tamaño de evento.
--
-- `p_aforos` es un arreglo porque el cliente puede pedir varios de una
-- ("50,100,130"). `p_reenviar` en true ignora lo ya enviado: es el caso del
-- que perdió el chat y pide todo otra vez.
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
          ))
    );
$function$
;

comment on function fn_hay_material_sedes(text, integer[], boolean) is
  'Si a este cliente le queda algun salon por ver entre los que sirven para esos aforos. Ver 20260828000003.';
