-- fn_medios_sedes_cotizacion: la tanda de videos de la cotización.
-- Correr con: supabase test db
begin;
select plan(16);

-- Sedes de prueba baratísimas a propósito: así caen primero en el orden y su
-- posición relativa no depende de los precios del catálogo real.
insert into sedes (id_sede, nombre_sede, tipo_espacio) values
    ('22222222-2222-2222-2222-222222222201', 'Zeta Prueba Cerrado', 'cerrado'),
    ('22222222-2222-2222-2222-222222222202', 'Zeta Prueba Campestre', 'campestre'),
    ('22222222-2222-2222-2222-222222222203', 'Zeta Prueba Sin Clasificar', null),
    ('22222222-2222-2222-2222-222222222204', 'Zeta Prueba Grande', 'cerrado');

insert into precios_sedes (sede_id, capacidad_invitados, precio_total) values
    ('22222222-2222-2222-2222-222222222201', 60, 1000000),
    ('22222222-2222-2222-2222-222222222201', 200, 4000000),
    ('22222222-2222-2222-2222-222222222202', 60, 2000000),
    ('22222222-2222-2222-2222-222222222203', 60, 1500000),
    ('22222222-2222-2222-2222-222222222204', 200, 5000000);

insert into medios (id, tipo, url, descripcion, cuando_usar, sede_id) values
    ('22222222-2222-2222-2222-222222222211', 'video', 'https://ejemplo.test/zeta-cerrado.mp4',
     'Recorrido Zeta Cerrado', 'en la tanda de la cotización',
     '22222222-2222-2222-2222-222222222201'),
    ('22222222-2222-2222-2222-222222222212', 'imagen', 'https://ejemplo.test/zeta-cerrado.jpg',
     'Foto Zeta Cerrado', 'cuando el cliente compara',
     '22222222-2222-2222-2222-222222222201'),
    ('22222222-2222-2222-2222-222222222213', 'video', 'https://ejemplo.test/zeta-campestre.mp4',
     'Recorrido Zeta Campestre', 'en la tanda de la cotización',
     '22222222-2222-2222-2222-222222222202'),
    ('22222222-2222-2222-2222-222222222214', 'video', 'https://ejemplo.test/zeta-sin-clasificar.mp4',
     'Recorrido Zeta Sin Clasificar', 'no debería enviarse',
     '22222222-2222-2222-2222-222222222203'),
    ('22222222-2222-2222-2222-222222222215', 'video', 'https://ejemplo.test/zeta-grande.mp4',
     'Recorrido Zeta Grande', 'en la tanda de la cotización',
     '22222222-2222-2222-2222-222222222204');

insert into leads (id, telefono) values
    ('22222222-2222-2222-2222-222222222221', '573009998877');

select has_column('sedes', 'tipo_espacio', 'sedes tiene la columna tipo_espacio');

select has_function('fn_medios_sedes_cotizacion', array['text', 'integer'],
    'existe fn_medios_sedes_cotizacion(text, int)');

select is(
    (select count(*) from sedes where tipo_espacio is not null and nombre_sede not like 'Zeta%'),
    11::bigint,
    'quedan 11 sedes reales clasificadas: 3 cerradas y 8 campestres'
);

select is(
    (select count(*) from medios where etiqueta = 'testimonio' and activo),
    0::bigint,
    'los testimonios están fuera de circulación: ninguna función los devuelve'
);

select is(
    (select count(*) from fn_medios_sedes_cotizacion('573009998877', 60)
      where url = 'https://ejemplo.test/zeta-cerrado.mp4'),
    1::bigint,
    'la tanda incluye el video de una sede clasificada'
);

select is(
    (select caption from fn_medios_sedes_cotizacion('573009998877', 60)
      where url = 'https://ejemplo.test/zeta-sin-clasificar.mp4'),
    'Así se ve Zeta Prueba Sin Clasificar - $1.500.000 ✨',
    'una sede sin tipo_espacio entra igual, pero sin el rótulo de tipo'
);

select ok(
    (select max(pos) from (select row_number() over () as pos, url
                             from fn_medios_sedes_cotizacion('573009998877', 60)) t
      where t.url in ('https://ejemplo.test/zeta-cerrado.mp4',
                      'https://ejemplo.test/zeta-campestre.mp4'))
    <
    (select min(pos) from (select row_number() over () as pos, url
                             from fn_medios_sedes_cotizacion('573009998877', 60)) t
      where t.url = 'https://ejemplo.test/zeta-sin-clasificar.mp4'),
    'las sedes sin clasificar van al final, después de cerrados y campestres'
);

select is(
    (select count(*) from fn_medios_sedes_cotizacion('573009998877', 60)
      where url = 'https://ejemplo.test/zeta-cerrado.jpg'),
    0::bigint,
    'la tanda manda videos, no fotos'
);

select is(
    (select caption from fn_medios_sedes_cotizacion('573009998877', 60)
      where url = 'https://ejemplo.test/zeta-cerrado.mp4'),
    'Así se ve Zeta Prueba Cerrado (salón cubierta cerrada) - $1.000.000 ✨',
    'el caption trae nombre, tipo de espacio y precio con separador de miles'
);

select is(
    (select caption from fn_medios_sedes_cotizacion('573009998877', 55)
      where url = 'https://ejemplo.test/zeta-cerrado.mp4'),
    'Así se ve Zeta Prueba Cerrado (salón cubierta cerrada) - $1.000.000 ✨',
    '55 invitados cotizan en el escalón de 60, igual que el cotizador'
);

select is(
    (select caption from fn_medios_sedes_cotizacion('573009998877', null)
      where url = 'https://ejemplo.test/zeta-campestre.mp4'),
    'Así se ve Zeta Prueba Campestre (salón campestre) ✨',
    'sin invitados el caption va sin precio en vez de inventar un escalón'
);

select is(
    (select caption from fn_medios_sedes_cotizacion('573009998877', 200)
      where url = 'https://ejemplo.test/zeta-campestre.mp4'),
    'Así se ve Zeta Prueba Campestre (salón campestre) - $2.000.000 hasta 60 invitados ✨',
    'un salón que no alcanza para esa cantidad igual se muestra, y el rótulo lo aclara'
);

select is(
    (select caption from fn_medios_sedes_cotizacion('573009998877', 60)
      where url = 'https://ejemplo.test/zeta-grande.mp4'),
    'Así se ve Zeta Prueba Grande (salón cubierta cerrada) - $5.000.000 desde 200 invitados ✨',
    'y al revés: un salón cuyo escalón mínimo es mayor dice "desde"'
);

select ok(
    (select min(pos) from (select row_number() over () as pos, url
                             from fn_medios_sedes_cotizacion('573009998877', 60)) t
      where t.url = 'https://ejemplo.test/zeta-cerrado.mp4')
    <
    (select min(pos) from (select row_number() over () as pos, url
                             from fn_medios_sedes_cotizacion('573009998877', 60)) t
      where t.url = 'https://ejemplo.test/zeta-campestre.mp4'),
    'los cerrados salen antes que los campestres'
);

insert into envios_medios (lead_id, medio_id) values
    ('22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222211');

select is(
    (select count(*) from fn_medios_sedes_cotizacion('573009998877', 60)
      where url = 'https://ejemplo.test/zeta-cerrado.mp4'),
    0::bigint,
    'no repite un video que ese teléfono ya recibió'
);

select is(
    (select count(*) from fn_medios_sedes_cotizacion('', 60)),
    0::bigint,
    'sin teléfono no devuelve nada'
);

select * from finish();
rollback;
