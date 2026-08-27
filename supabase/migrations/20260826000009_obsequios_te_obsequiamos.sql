-- El globo de obsequios vuelve al marco "Te OBSEQUIAMOS" (2026-08-26).
--
-- La migracion 20260826000005 lo habia dejado como "Adicional: *OBSEQUIOS*✨"
-- con la linea del licor cerrando en negrita. El negocio reescribio ese marco:
--
--   Te OBSEQUIAMOS ✨            <- cabecera, antes "Adicional: *OBSEQUIOS*✨"
--   - <viñetas del paquete>      <- SIN CAMBIOS
--                                <- linea en blanco
--   (Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)
--                                <- linea en blanco
--   Por obtener este paquete✨️   <- remate nuevo
--
-- Tres detalles que importan y son deliberados:
--
-- 1. El cierre del licor va entre PARENTESIS y SIN asteriscos. Deja de salir en
--    negrita en WhatsApp; es como lo mando el negocio y no es un descuido.
-- 2. La cabecera lleva ✨ pelado (U+2728) y el remate lleva ✨️ con selector de
--    variacion (U+2728 U+FE0F). Se ven casi igual y no son el mismo caracter:
--    estan copiados tal cual del mensaje original.
-- 3. Las viñetas de cada paquete NO se tocan, y `mensajes_cotizacion` TAMPOCO.
--    Verificado antes de aplicar: los tres globos de los 7 paquetes salen del
--    generador identicos a los que ya estaban en la base.
--
-- Origen actualizado en docs/paquetes.txt; regenerado con
--   node scripts/guion-cotizacion.js docs/paquetes.txt --sql-obsequios

update tipos_evento set mensaje_obsequio = $m$Te OBSEQUIAMOS ✨
- Vestido de 15 años (americano) 👸🏻
- Vestido de cambio 💎
- Vestido para mamá💃🏽 y traje para papá🕺🏽
- Volcanes en pólvora fría 🎇

(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)

Por obtener este paquete✨️$m$
where nombre_paquete = $m$15 Años$m$;

update tipos_evento set mensaje_obsequio = $m$Te OBSEQUIAMOS ✨
- Vestido de novia en alquiler y velo 👰 
- Vestido de gala para el novio 🤵🏻‍♂
- Vestido de gala Adicional 🕺🏻👗
- Cojín para las argollas 💍💍
- Volcanes en pólvora fría 🎇

(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)

Por obtener este paquete✨️$m$
where nombre_paquete = $m$Matrimonio$m$;

update tipos_evento set mensaje_obsequio = $m$Te OBSEQUIAMOS ✨
- Alquiler de vestido o traje de cóctel para el o la graduad@ 👗👔
- Vestido para dos acompañante 💃🏽🕺🏽
- Volcanes en pólvora fría 🎇

(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)

Por obtener este paquete✨️$m$
where nombre_paquete = $m$Grado$m$;

update tipos_evento set mensaje_obsequio = $m$Te OBSEQUIAMOS ✨
- Alquiler de vestido o traje de cóctel para el o la cumpleañer@👗👔
- Vestido para dos acompañante 💃🏽🕺🏽
- Volcanes en pólvora fría 🎇

(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)

Por obtener este paquete✨️$m$
where nombre_paquete = $m$Cumpleaños$m$;

update tipos_evento set mensaje_obsequio = $m$Te OBSEQUIAMOS ✨
- Sillas cristal 🪑
- Alquiler de 3 vestidos o traje de cóctel 👗👔
- Volcanes en pólvora fría 🎇

(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)

Por obtener este paquete✨️$m$
where nombre_paquete = $m$Empresa$m$;

update tipos_evento set mensaje_obsequio = $m$Te OBSEQUIAMOS ✨
- Alquiler de vestido o traje de primera comunión 🕯️
- Vestido para mamá💃🏽 y traje para papá🕺🏽
- Volcanes en pólvora fría 🎇

(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)

Por obtener este paquete✨️$m$
where nombre_paquete = $m$Primera Comunión$m$;

update tipos_evento set mensaje_obsequio = $m$Te OBSEQUIAMOS ✨
- Vestido para mamá💃🏽 y traje para papá 🕺🏻
- Vestido de gala para un acompañante 🤵🏻‍♂👗
- Volcanes en pólvora fría 🎇

(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)

Por obtener este paquete✨️$m$
where nombre_paquete = $m$Baby Shower$m$;

-- Invariantes del marco nuevo, sobre los 7 paquetes:
--   - la cabecera abre el globo,
--   - el cierre del licor aparece UNA vez y entre parentesis,
--   - el remate cierra,
--   - y la cotizacion sigue en tres partes, sin la linea del licor adentro.
do $$
declare v_mal text;
begin
    select string_agg(nombre_paquete, ', ' order by nombre_paquete)
      into v_mal
      from tipos_evento
     where mensaje_obsequio not like 'Te OBSEQUIAMOS%'
        or mensaje_obsequio not like '%(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)%'
        or mensaje_obsequio not like '%Por obtener este paquete%'
        or mensaje_obsequio like '%*TODO INCLUIDO*%'
        or mensaje_obsequio like '%Adicional: *OBSEQUIOS*%'
        or array_length(mensajes_cotizacion, 1) is distinct from 3
        or array_to_string(mensajes_cotizacion, ' ') like '%excepto el licor%';

    if v_mal is not null then
        raise exception 'Paquetes con el globo de obsequios mal armado: %', v_mal;
    end if;

    if (select count(*) from tipos_evento) <> 7 then
        raise exception 'Se esperaban 7 paquetes y hay %', (select count(*) from tipos_evento);
    end if;
end;
$$;
