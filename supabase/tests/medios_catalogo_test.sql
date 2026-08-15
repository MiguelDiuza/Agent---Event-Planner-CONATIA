-- Vista de resumen del catálogo: es lo que el agente lee para saber qué
-- material existe y cuándo usarlo.
-- Correr con: supabase test db
begin;
select plan(6);

insert into sedes (id_sede, nombre_sede)
values ('11111111-1111-1111-1111-111111111111', 'Salón Prueba Alfa');
insert into tipos_evento (id_evento, nombre_paquete, inclusiones_base, obsequios, excepciones)
values ('11111111-1111-1111-1111-111111111112', 'Prueba Quince', '-', '-', '-'),
       ('11111111-1111-1111-1111-111111111116', 'Prueba Boda', '-', '-', '-');

-- Foto que cuelga de la sede Y del tipo de evento.
insert into medios (id, tipo, url, descripcion, cuando_usar, sede_id, tipo_evento_id)
values ('11111111-1111-1111-1111-111111111113', 'imagen', 'https://ejemplo.test/a.jpg',
        'Montaje de quince', 'cuando el cliente compara sedes',
        '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111112');

-- Video de la misma sede: mismo lugar, otro momento de uso.
insert into medios (id, tipo, url, descripcion, cuando_usar, sede_id)
values ('11111111-1111-1111-1111-111111111114', 'video', 'https://ejemplo.test/b.mp4',
        'Recorrido del salón', 'cuando el cliente duda antes de cerrar',
        '11111111-1111-1111-1111-111111111111');

-- Medio dado de baja.
insert into medios (id, tipo, url, descripcion, cuando_usar, sede_id, activo)
values ('11111111-1111-1111-1111-111111111115', 'imagen', 'https://ejemplo.test/c.jpg',
        'Montaje viejo', 'ya no se usa',
        '11111111-1111-1111-1111-111111111111', false);

select results_eq($$
    select cantidad::int from vista_catalogo_medios
    where categoria = 'sede' and referencia = 'Salón Prueba Alfa' and tipo = 'imagen'
$$, $$ values (1) $$, 'el medio inactivo no aparece en el resumen');

select results_eq($$
    select cantidad::int from vista_catalogo_medios
    where categoria = 'tipo_evento' and referencia = 'Prueba Quince' and tipo = 'imagen'
$$, $$ values (1) $$, 'la misma foto aparece también bajo su tipo de evento');

select results_eq($$
    select cuando_usar from vista_catalogo_medios
    where categoria = 'sede' and referencia = 'Salón Prueba Alfa' and tipo = 'video'
$$, $$ values ('cuando el cliente duda antes de cerrar') $$,
   'fotos y videos se resumen por separado, cada uno con su momento de uso');

select ok(
    (select count(*) from vista_catalogo_medios where categoria = 'institucional') = 0,
    'sin medios institucionales cargados, la categoría no aparece en el resumen'
);

-- El texto de esta vista se concatena dentro del system message en cada turno.
-- Si el orden de los `cuando_usar` dependiera del plan de ejecución, el prompt
-- cambiaría sin que cambie ningún dato: se rompe el cacheo de prompt y los
-- diffs entre turnos dejan de significar algo. Se insertan tres videos en un
-- orden distinto del alfabético para fijar la garantía por comportamiento.
insert into medios (tipo, url, descripcion, cuando_usar, tipo_evento_id)
values ('video', 'https://ejemplo.test/o3.mp4', 'Tercero', 'zeta: al cerrar',
        '11111111-1111-1111-1111-111111111116'),
       ('video', 'https://ejemplo.test/o1.mp4', 'Primero', 'alfa: al abrir',
        '11111111-1111-1111-1111-111111111116'),
       ('video', 'https://ejemplo.test/o2.mp4', 'Segundo', 'mu: a mitad de camino',
        '11111111-1111-1111-1111-111111111116');

select results_eq($$
    select cuando_usar from vista_catalogo_medios
    where categoria = 'tipo_evento' and referencia = 'Prueba Boda' and tipo = 'video'
$$, $$ values ('alfa: al abrir; mu: a mitad de camino; zeta: al cerrar') $$,
   'los cuando_usar se concatenan en orden estable, no en el que devuelva el plan');

-- Y la garantía queda escrita en la definición de la vista, no confiada al
-- ordenamiento incidental que hoy introduce el `distinct` del agregado: los
-- cuatro `string_agg` del UNION ALL llevan su propio `order by`.
select is(
    (select count(*)::int from regexp_matches(
        pg_get_viewdef('vista_catalogo_medios'::regclass),
        'ORDER BY m.cuando_usar', 'g')),
    4,
    'los cuatro string_agg de la vista ordenan explícitamente por cuando_usar'
);

select * from finish();
rollback;
