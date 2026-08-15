-- Funciones que consume el sub-workflow enviar_medios.
-- Correr con: supabase test db
begin;
select plan(39);

insert into sedes (id_sede, nombre_sede)
values ('11111111-1111-1111-1111-111111111116', 'Salón Prueba Alfa Anexo'),
       ('11111111-1111-1111-1111-111111111111', 'Salón Prueba Alfa');
insert into tipos_evento (id_evento, nombre_paquete, inclusiones_base, obsequios, excepciones)
values ('11111111-1111-1111-1111-111111111121', 'Prueba Quince', '-', '-', '-');
insert into servicios_adicionales_upselling (id, servicio, precio, detalles)
values ('11111111-1111-1111-1111-111111111122', 'Prueba Pirotecnia', 100, '-');
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

-- Las otras tres categorías necesitan material propio: hasta la revisión final
-- solo se ejercitaba `sede`, y los seis sitios ILIKE de 000006 se reescribieron
-- para las cuatro.
insert into medios (id, tipo, url, descripcion, cuando_usar, tipo_evento_id, orden)
values ('11111111-1111-1111-1111-111111111123', 'imagen', 'https://ejemplo.test/q.jpg',
        'Montaje de quince', 'cuando el cliente pide ver montajes de quince',
        '11111111-1111-1111-1111-111111111121', 1);
insert into medios (id, tipo, url, descripcion, cuando_usar, servicio_id, orden)
values ('11111111-1111-1111-1111-111111111124', 'video', 'https://ejemplo.test/p.mp4',
        'Show de pirotecnia', 'cuando el cliente pregunta qué incluye el show',
        '11111111-1111-1111-1111-111111111122', 1);
insert into medios (id, tipo, url, descripcion, cuando_usar, orden)
values ('11111111-1111-1111-1111-111111111125', 'imagen', 'https://ejemplo.test/i.jpg',
        'Portada institucional', 'cuando el cliente todavía no sabe quiénes somos', 1);

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (2) $$, 'devuelve todo el material de la sede');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (2) $$, 'una referencia parcial encuentra la sede completa');

select results_eq($$
    select tipo from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'video')
$$, $$ values ('video') $$, 'tipo_medio filtra: fotos y videos sirven en momentos distintos');

-- El spec pide los tres valores de tipo_medio; 'imagen' no se ejercitaba.
select results_eq($$
    select tipo from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'imagen')
$$, $$ values ('imagen') $$, 'tipo_medio = imagen devuelve solo fotos');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Sede Inexistente', '573001112233', 'ambos')
$$, $$ values (0) $$, 'una referencia que no existe devuelve cero filas, sin error');

-- Un espacio final en la referencia es salida rutinaria de un LLM. El guard y
-- la preferencia por coincidencia exacta ya recortaban, pero el patrón ILIKE
-- usaba el valor crudo: la referencia válida se volvía inencontrable y el
-- diagnóstico respondía "no hay material para esa referencia" nombrando esa
-- misma referencia. Se comprueban los seis sitios ILIKE, dos por categoría.
select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa ', '573009998877', 'ambos')
$$, $$ values (2) $$, 'un espacio final en la referencia no esconde la sede');

select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('sede', 'Salón Prueba Alfa ', 'ambos')
$$, $$ values (2) $$, 'el diagnóstico de sede también recorta la referencia');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('tipo_evento', 'Prueba Quince', '573001112233', 'ambos')
$$, $$ values (1) $$, 'la categoría tipo_evento encuentra su material');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('tipo_evento', 'Prueba Quince ', '573009998877', 'ambos')
$$, $$ values (1) $$, 'un espacio final no esconde el tipo de evento');

select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('tipo_evento', 'Prueba Quince ', 'ambos')
$$, $$ values (1) $$, 'el diagnóstico de tipo_evento también recorta la referencia');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('tipo_evento', '%', '573001112233', 'ambos')
$$, $$ values (0) $$, 'metacaracteres LIKE escapados también en tipo_evento');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('servicio', 'Prueba Pirotecnia', '573001112233', 'ambos')
$$, $$ values (1) $$, 'la categoría servicio encuentra su material');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('servicio', 'Prueba Pirotecnia ', '573009998877', 'ambos')
$$, $$ values (1) $$, 'un espacio final no esconde el servicio');

select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('servicio', 'Prueba Pirotecnia ', 'ambos')
$$, $$ values (1) $$, 'el diagnóstico de servicio también recorta la referencia');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('servicio', '%', '573001112233', 'ambos')
$$, $$ values (0) $$, 'metacaracteres LIKE escapados también en servicio');

-- Institucional ignora la referencia por diseño: son los medios sin ninguna FK.
select results_eq($$
    select count(*)::int from fn_medios_para_enviar('institucional', '', '573001112233', 'ambos')
$$, $$ values (1) $$, 'la categoría institucional devuelve el material sin dueño');

select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('institucional', '', 'ambos')
$$, $$ values (1) $$, 'el diagnóstico de institucional cuenta el material sin dueño');

-- El modelo escribe 'Sede', 'Video' o 'ambos ' con la misma naturalidad que las
-- formas canónicas. Antes eso devolvía cero filas en silencio, y en el
-- diagnóstico además dejaba `referencias_disponibles` en NULL: al agente se le
-- decía que la categoría entera está vacía justo en la rama diseñada para
-- entregarle la lista con la que corregirse.
select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('Sede', 'Salón Prueba Alfa', 'ambos')
$$, $$ values (2) $$, 'la categoría se normaliza: ''Sede'' vale igual que ''sede''');

select results_eq($$
    select referencias_disponibles from fn_medios_diagnostico('Sede', 'Salón Prueba Alfa', 'ambos')
$$, $$ values ('Salón Prueba Alfa, Salón Prueba Alfa Anexo') $$,
   'referencias_disponibles trae la lista con la que el agente se autocorrige');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573009998877', 'Video')
$$, $$ values (1) $$, 'el tipo de medio se normaliza: ''Video'' vale igual que ''video''');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573009998877', 'ambos ')
$$, $$ values (2) $$, 'el tipo de medio se recorta: ''ambos '' vale igual que ''ambos''');

-- Las dos funciones se llaman posicionalmente desde nodos n8n adyacentes y su
-- tercer parámetro significa cosas distintas: teléfono en fn_medios_para_enviar,
-- tipo de medio en fn_medios_diagnostico. Como todos los parámetros son `text`,
-- copiar la expresión de un nodo al otro pasa el chequeo de tipos y devuelve
-- cero filas para siempre — el agente le diría a un cliente que no tiene fotos
-- de un salón del que sí las tiene. Debe reventar al construir el workflow.
select throws_ok($$
    select * from fn_medios_diagnostico('sede', 'Salón Prueba Alfa', '573001112233')
$$, '22023', null, 'un teléfono en la ranura de tipo_medio revienta en el diagnóstico');

select throws_ok($$
    select * from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', 'ambos', '573001112233')
$$, '22023', null, 'teléfono y tipo_medio intercambiados revientan en la selección');

select throws_ok($$
    select * from fn_medios_para_enviar('Salón Prueba Alfa', 'sede', '573001112233', 'ambos')
$$, '22023', null, 'una categoría fuera del enum revienta en la selección');

select throws_ok($$
    select * from fn_medios_diagnostico('sedes', 'Salón Prueba Alfa', 'ambos')
$$, '22023', null, 'una categoría fuera del enum revienta en el diagnóstico');

-- Anti-repetición: se marca la foto como ya enviada a este lead.
insert into envios_medios (lead_id, medio_id)
values ('11111111-1111-1111-1111-111111111117', '11111111-1111-1111-1111-111111111113');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573001112233', 'ambos')
$$, $$ values (1) $$, 'no reenvía material que ese lead ya recibió');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '573009998877', 'ambos')
$$, $$ values (2) $$, 'el filtro de repetición es por lead, no global');

-- Sin teléfono utilizable el `not exists` del anti-repetición es vacuamente
-- verdadero y el filtro desaparece: todos los clientes recibirían el mismo
-- material en cada petición, para siempre. Y como fn_registrar_envio con ese
-- mismo teléfono inserta cero filas, la bitácora queda vacía y parece que nunca
-- se envió nada: las dos fallas se tapan entre sí. Sin teléfono, cero filas.
select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '', 'imagen')
$$, $$ values (0) $$, 'con teléfono vacío no se entrega material: el anti-repetición no puede aplicarse');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', null, 'imagen')
$$, $$ values (0) $$, 'con teléfono nulo no se entrega material');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('sede', 'Salón Prueba Alfa', '   ', 'imagen')
$$, $$ values (0) $$, 'con teléfono en blanco no se entrega material');

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

-- Y debe llevar el `cuando_usar`, no solo el nombre: que el momento de uso
-- llegue al contexto del agente es la propiedad sobre la que descansa el
-- requisito rector (agregar contenido sin tocar prompt ni workflow). Si solo
-- viajara el nombre, el agente sabría qué existe pero no cuándo enviarlo.
select matches(
    fn_catalogo_digest(),
    'cuando el cliente compara sedes',
    'el resumen lleva el cuando_usar de cada medio, no solo su referencia'
);

-- Catálogo vacío: el digest debe producir texto, no NULL, o el system message
-- del agente quedaría con un hueco. Va al final porque vacía las dos tablas;
-- el rollback del final del archivo deshace el borrado.
delete from envios_medios;
delete from medios;

select is(
    fn_catalogo_digest(),
    'Sin material cargado.'::text,
    'con el catálogo vacío el resumen dice "Sin material cargado." y no NULL'
);

select * from finish();
rollback;
