-- Fuera Granada Premium: no es de la empresa.
--
-- Lo dijo el cliente el 2026-09-02, preguntado a propósito: «el salón premium
-- debes ignorarlo completamente, para nosotros es como si no existiera porque
-- es de una administración diferente». El que trabajan es el Gold.
--
-- La sede se había creado el día antes (20260901000000) porque el Excel del
-- equipo lleva DOS calendarios de Granada y la hoja VALORES los cotiza por
-- separado. Eso era cierto y sigue siéndolo -- son dos salones que se usan el
-- mismo día: hay 13 fechas con un evento en cada uno, de clientes distintos --
-- pero el segundo no es de esta empresa. Que su calendario esté en el mismo
-- libro no lo hace suyo.
--
-- SE BORRA, no se desactiva. `sedes` no tiene una columna para apagar una sede,
-- y las dos formas de simularlo salen peor:
--
--   * Dejarla sin precios y sin video (como estaba) NO la esconde del todo: si
--     un cliente la nombra, `fn_verificar_disponibilidad_evento` la resuelve y
--     le contesta si está libre u ocupada, como si fuera de la casa.
--   * Ponerle `es_propia = false` es peor todavía: pasaría a ser una sede
--     aliada, y el agente las ofrece, derivando la confirmación al asesor.
--
-- Y BORRARLA ARREGLA ALGO MÁS. Mientras existían las dos, "Granada" a secas era
-- ambiguo: `fn_verificar_disponibilidad_evento` y `fn_reserva_anotar` casan la
-- sede con un ilike y solo aceptan UNA coincidencia, así que un cliente que
-- dijera "la Granada" se llevaba un "sé más específico" en vez de una
-- respuesta. Con una sola Granada en el catálogo, eso se resuelve solo.
--
-- LO QUE SE PIERDE, y dónde está por si hace falta. Las 32 fechas que la sede
-- tenía apartadas eran ventas de la otra administración: para este agente no
-- protegían nada, porque nunca iba a ofrecer ese salón. Sus filas están
-- escritas una a una en 20260901000000, y las hojas `GRANADA 2026`,
-- `GRANADA 2027` y `GRANADA` del Excel nuevo son copia fiel del libro del
-- equipo. Si algún día vuelve, se rehace desde ahí.
--
-- OJO CON UNA FECHA DE CASA 4. `Casa 4 2026-12-27` (DIEGO MONTOYA) se cargó en
-- 20260902000002 y salió de la hoja `GRANADA 2026`, que ahora sabemos que es de
-- la otra administración. Se deja bloqueada a propósito: la sede se dedujo del
-- precio (17.100.000 para 120 personas es la tarifa de Casa 4 en la hoja
-- VALORES del equipo, no la de Granada), así que lo más probable es que sea un
-- evento suyo anotado en el libro del vecino. Bloquear de más cuesta una
-- consulta al asesor; bloquear de menos cuesta un evento doble. Conviene
-- confirmarlo igual.

-- El orden importa: `agenda_reservas.sede_id` es NO ACTION, así que la sede no
-- se puede borrar mientras le queden fechas colgando.
delete from agenda_reservas
 where sede_id in (select id_sede from sedes where nombre_sede = 'Sede Granada Premium');

-- `reservas.sede_id` es SET NULL y `leads.sede_interes` NO ACTION; hoy no hay
-- ninguna de las dos apuntando aquí, pero el update deja el camino limpio para
-- que esto se pueda aplicar también sobre una base con datos de clientes.
update leads set sede_interes = null
 where sede_interes in (select id_sede from sedes where nombre_sede = 'Sede Granada Premium');

delete from sedes where nombre_sede = 'Sede Granada Premium';
