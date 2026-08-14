-- Esquema del catálogo de medios.
-- Correr con: supabase test db
begin;
select plan(9);

select has_table('public', 'medios', 'existe la tabla medios');
select has_table('public', 'envios_medios', 'existe la tabla envios_medios');

select col_not_null('public', 'medios', 'cuando_usar',
    'cuando_usar es obligatorio: un medio sin momento de uso nunca se enviaría');
select col_is_null('public', 'medios', 'sede_id',
    'sede_id es opcional: un medio institucional no cuelga de ninguna sede');

insert into sedes (id_sede, nombre_sede)
values ('11111111-1111-1111-1111-111111111111', 'Salón Prueba Alfa');
insert into tipos_evento (id_evento, nombre_paquete, inclusiones_base, obsequios, excepciones)
values ('11111111-1111-1111-1111-111111111112', 'Prueba Quince', '-', '-', '-');

select lives_ok($$
    insert into medios (tipo, url, descripcion, cuando_usar, sede_id, tipo_evento_id, peso_bytes)
    values ('imagen', 'https://ejemplo.test/a.jpg', 'Montaje del salón',
            'cuando el cliente pregunta cómo se ve el salón montado',
            '11111111-1111-1111-1111-111111111111',
            '11111111-1111-1111-1111-111111111112', 400000)
$$, 'una foto puede colgar de una sede y de un tipo de evento a la vez');

select throws_ok($$
    insert into medios (tipo, url, descripcion, cuando_usar, peso_bytes)
    values ('video', 'https://ejemplo.test/b.mp4', 'Promo', 'al cerrar', 20971520)
$$, '23514', null, 'un video de 20MB excede el límite de WhatsApp y se rechaza');

select throws_ok($$
    insert into medios (tipo, url, descripcion, cuando_usar, peso_bytes)
    values ('imagen', 'https://ejemplo.test/c.jpg', 'Fachada', 'al abrir', 6291456)
$$, '23514', null, 'una imagen de 6MB excede el límite de WhatsApp y se rechaza');

select throws_ok($$
    insert into medios (tipo, url, descripcion, cuando_usar)
    values ('gif', 'https://ejemplo.test/d.gif', 'X', 'nunca')
$$, '23514', null, 'solo se aceptan los tipos imagen y video');

select results_eq($$
    select public from storage.buckets where id = 'medios'
$$, $$ values (true) $$, 'el bucket medios existe y es público');

select * from finish();
rollback;
