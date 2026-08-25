-- Marca explicita para no perseguir a un lead.
--
-- El seguimiento automatico solo debe reenganchar conversaciones que quedaron
-- A MEDIAS: le pasamos precios y nos dejo en visto. Todo lo demas es acoso.
--
-- Hay dos formas de saber que una conversacion NO quedo a medias:
--
--   1. Derivada de los hechos (no depende del modelo): el lead tiene una cita
--      futura, o ya aparto una fecha, o pidio hablar con alguien. Eso se
--      consulta contra `citas` y `agenda_reservas` y no puede fallar por un
--      olvido del modelo.
--
--   2. Declarada por el agente: el cliente pregunto lo que queria y se
--      despidio, o dijo que no le interesa. Eso no deja rastro en ninguna
--      tabla, asi que hace falta que el agente lo diga. Para eso es esta
--      columna, que el agente pone en true con la herramienta cerrar_seguimiento.
--
-- Se separa de `estado` a proposito: `estado` describe donde esta el lead en
-- el embudo (nuevo/perfilado/cotizado/separado/perdido), mientras que esto
-- responde una pregunta distinta -- si le volvemos a escribir o no -- y las
-- dos cosas no siempre coinciden.
alter table leads
    add column no_insistir boolean not null default false;

comment on column leads.no_insistir is
    'true = la conversacion concluyo; el seguimiento automatico no debe escribirle';
