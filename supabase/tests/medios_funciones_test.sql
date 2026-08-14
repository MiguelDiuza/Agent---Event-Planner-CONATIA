-- Funciones que consume el sub-workflow enviar_medios.
-- Correr con: supabase test db
begin;
select plan(14);

insert into sedes (id_sede, nombre_sede)
values ('11111111-1111-1111-1111-111111111116', 'Salón Prueba Alfa Anexo'),
       ('11111111-1111-1111-1111-111111111111', 'Salón Prueba Alfa');
insert into leads (id, telefono)
values ('11111111-1111-1111-1111-111111111117', '573001112233');

insert into medios (id, tipo, url, descripcion, cuando_usar, sede_id, orden)
values ('11111111-1111-1111-1111-111111111113', 'imagen', 'https://ejemplo.test/a.jpg',
        'Fachada', 'cuando el cliente compara sedes',
        '11111111-1111-1111-1111-111111111111', 1),
       ('11111111-1111-1111-1111-111111111114', 'video', 'https://ejemplo.test/b.mp4',
        'Recorrido', 'cuando el cliente duda antes de cerrar',
        '11111111-1111-1111-1111-111111111111', 2),
       ('11111111-1111-1111-1111-111111111115', 'imagen', 'https://ejemplo.test/c.jpg',
        'Entrada Anexo', 'para salón Alfa Anexo',
        '11111111-1111-1111-1111-111111111116', 1);

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (2) $$, 'devuelve todo el material de la sede');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (2) $$, 'una referencia parcial encuentra la sede completa');

select results_eq($$
    select tipo from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'video')
$$, $$ values ('video') $$, 'tipo_medio filtra: fotos y videos sirven en momentos distintos');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Sede Inexistente', '573001112233', 'ambos')
$$, $$ values (0) $$, 'una referencia que no existe devuelve cero filas, sin error');

-- Nombres exactos ganan sobre substrings ambigüos: 'Salón Prueba Alfa' es un
-- substring exacto de ambos 'Salón Prueba Alfa' y 'Salón Prueba Alfa Anexo'.
-- Sin ORDER BY con preferencia exacta, Postgres elige arbitrariamente. Con la
-- nueva lógica, el match exacto gana y solo retorna media de Alfa (2).
select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (2) $$, 'nombre exacto gana sobre substring: ''Alfá'' ≠ ''Alfá Anexo''');

-- Anti-repetición: se marca la foto como ya enviada a este lead.
insert into envios_medios (lead_id, medio_id)
values ('11111111-1111-1111-1111-111111111117', '11111111-1111-1111-1111-111111111113');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (1) $$, 'no reenvía material que ese lead ya recibió');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573009998877', 'ambos')
$$, $$ values (2) $$, 'el filtro de repetición es por lead, no global');

-- Las dos ramas sin resultados deben decir cosas distintas: confundirlas
-- hace que el agente diga "no tengo fotos" a quien acaba de recibirlas.
select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('sede', 'Salón Prueba Alfa', 'imagen')
$$, $$ values (1) $$, 'diagnóstico: la referencia existe, el material ya se envió');

select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('sede', 'Sede Inexistente', 'ambos')
$$, $$ values (0) $$, 'diagnóstico: la referencia no existe, el agente eligió mal');

-- Escaping de metacaracteres LIKE: % no debe emparejar todo.
select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', '%', '573001112233', 'ambos')
$$, $$ values (0) $$, 'metacaracteres LIKE escapados: % no empareja todas las sedes');

-- Referencias vacías o solo espacios no deben emparejar nada.
select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', '', '573001112233', 'ambos')
$$, $$ values (0) $$, 'referencia vacía no empareja nada');

-- Registro de envíos: fn_registrar_envio deja constancia de que un medio ya
-- se le envió a este lead. Antes de esta llamada envios_medios ya tiene una
-- fila para este teléfono (la del anti-repetición arriba); esta suma la
-- segunda.
-- count(*) sobre una subconsulta que envuelve la llamada siempre da 1, sin
-- importar si la función insertó algo o devolvió NULL: una función escalar
-- en el SELECT list produce exactamente una fila de salida. count(expr), en
-- cambio, cuenta valores no nulos: si la función devuelve NULL (el teléfono
-- no resuelve a ningún lead), el conteo cae a 0. Así la aserción sí puede
-- fallar cuando la función falla.
select results_eq($$
    select count(fn_registrar_envio('11111111-1111-1111-1111-111111111114', '573001112233'))::int
$$, $$ values (1) $$, 'registrar un envío devuelve el id de la fila creada');

select results_eq($$
    select count(*)::int from envios_medios e
    join leads l on l.id = e.lead_id
    where l.telefono = '573001112233'
$$, $$ values (2) $$, 'el envío queda asociado al lead por su teléfono');

-- Resumen del catálogo: fn_catalogo_digest debe mencionar las referencias
-- reales para que el system message del agente sepa qué existe.
select matches(
    fn_catalogo_digest(),
    'Salón Prueba Alfa',
    'el resumen del catálogo menciona la referencia y llega al system message'
);

select * from finish();
rollback;
