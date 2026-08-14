-- Vista de resumen del catálogo: es lo que el agente lee para saber qué
-- material existe y cuándo usarlo.
-- Correr con: supabase test db
begin;
select plan(4);

insert into sedes (id_sede, nombre_sede)
values ('11111111-1111-1111-1111-111111111111', 'Salón Prueba Alfa');
insert into tipos_evento (id_evento, nombre_paquete, inclusiones_base, obsequios, excepciones)
values ('11111111-1111-1111-1111-111111111112', 'Prueba Quince', '-', '-', '-');

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

select * from finish();
rollback;
