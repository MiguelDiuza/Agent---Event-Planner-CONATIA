-- Cada salón es cerrado o campestre. La distinción no es decorativa: cambia el
-- valor de separación ($1.000.000 los cerrados, $2.000.000 los campestres) y el
-- agente la dice en voz alta al presentar cada salón, porque el cliente casi
-- siempre tiene preferencia entre techo y aire libre.
--
-- Hasta hoy la clasificación vivía escrita a mano en el system message del
-- agente, con nombres que además no coincidían con `nombre_sede`. Baja a la base
-- porque es dato del catálogo, y porque la tanda de videos de la cotización
-- (fn_medios_sedes_cotizacion) necesita leerla para etiquetar cada video.
alter table sedes add column tipo_espacio text
    check (tipo_espacio in ('cerrado', 'campestre'));

comment on column sedes.tipo_espacio is
    'cerrado o campestre. Decide el rótulo del video en la tanda de la '
    'cotización, no si la sede entra: entrar depende de tener un video activo '
    'en medios. NULL = el video se manda igual, pero sin decir de qué tipo es '
    'el salón. Clasificarla después es un update y el rótulo aparece solo.';

-- Clasificación entregada por el negocio el 2026-08-25. Los nombres son los de
-- `sedes`, no los comerciales: "Sede 66" es Sede Sur 66 Mundo Foto, "Mansión
-- Casa #5" es Casa 5 y "Marquez del Oyola" es Marquez De Loyola.
update sedes set tipo_espacio = 'cerrado'
where nombre_sede in (
    'Sede Sur 66 Mundo Foto',
    'Sede Norte',
    'Pilas Premium'
);

update sedes set tipo_espacio = 'campestre'
where nombre_sede in (
    'Casa Christian''s Ciudad Jardín',
    'Casa 5',
    'Casa 74',
    'Mansión Vallano',
    'Hacienda El Talismán',
    'Marquez De Loyola',
    -- El negocio la llama "Salón Inti Raimi"; en la base es Sawa, con su
    -- matriz de precios completa. Confirmado por el usuario el 2026-08-25.
    'Sawa',
    -- Y "Jardín Real Casa 4" es Casa 4. Mismo caso: nombre comercial distinto
    -- del que quedó en `sedes`.
    'Casa 4'
);

-- Sede Granada Gold y Valdemoro quedan sin clasificar a propósito: el negocio
-- decidió (2026-08-25) mandar su video igual, con nombre y precio pero sin decir
-- de qué tipo son, hasta que las clasifique.
--
-- Gran Salón y Orquideorama tampoco están clasificadas y además no tienen
-- video, así que hoy no aparecen en ninguna tanda.
--
-- Sawa y Casa 5 sí están clasificadas pero les falta el archivo de video: en
-- cuanto se suba y se catalogue entran en la tanda sin tocar nada más.
