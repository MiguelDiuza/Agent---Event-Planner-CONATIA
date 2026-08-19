-- Etiqueta institucional: promocion.mp4 y los 2 testimonios no deben viajar
-- juntos en la misma llamada.
-- Correr con: supabase test db
begin;
select plan(10);

insert into leads (id, telefono)
values ('22222222-2222-2222-2222-222222222201', '573002220001');

-- Tres medios institucionales reales: uno de promoción, dos de testimonios.
-- Antes de esta migración, los tres caían en la misma rama institucional sin
-- nada que los distinguiera.
insert into medios (id, tipo, url, descripcion, cuando_usar, etiqueta)
values
    ('22222222-2222-2222-2222-222222222210', 'video', 'https://ejemplo.test/promo.mp4',
     'Video promocional evento todo incluido',
     'cuando el cliente pregunta por promociones', 'promocion'),
    ('22222222-2222-2222-2222-222222222211', 'video', 'https://ejemplo.test/testimonio1.mp4',
     'Testimonio de cliente 1',
     'cuando el cliente duda o pide referencias', 'testimonio'),
    ('22222222-2222-2222-2222-222222222212', 'video', 'https://ejemplo.test/testimonio2.mp4',
     'Testimonio de cliente 2',
     'cuando el cliente duda o pide referencias', 'testimonio');

select col_is_null('public', 'medios', 'etiqueta',
    'etiqueta es opcional: no aplica a medios de sede/tipo_evento/servicio');

-- Si el filtro por etiqueta no existiera, esta llamada devolvería las 3
-- filas institucionales (tope del limit 3), no 1.
select results_eq($$
    select count(*)::int from fn_medios_para_enviar('institucional', 'promocion', '573002220001', 'ambos')
$$, $$ values (1) $$, 'referencia=promocion trae solo el video de promoción, no los testimonios');

select results_eq($$
    select descripcion from fn_medios_para_enviar('institucional', 'promocion', '573002220001', 'ambos')
$$, $$ values ('Video promocional evento todo incluido') $$,
   'y es específicamente el correcto, no cualquiera de los tres');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('institucional', 'testimonio', '573002220002', 'ambos')
$$, $$ values (2) $$, 'referencia=testimonio trae los 2 testimonios, no el promocional');

select results_eq($$
    select count(*)::int from fn_medios_para_enviar('institucional', '', '573002220003', 'ambos')
$$, $$ values (3) $$, 'referencia en blanco sigue significando "cualquier institucional" (compatibilidad)');

-- La vista: institucional deja de colapsar en una sola fila.
select results_eq($$
    select count(*)::int from vista_catalogo_medios where categoria = 'institucional'
$$, $$ values (2) $$, 'la vista muestra promocion y testimonio como líneas separadas, no una fusionada');

select results_eq($$
    select cantidad::int from vista_catalogo_medios
    where categoria = 'institucional' and referencia = 'promocion' and tipo = 'video'
$$, $$ values (1) $$, 'la línea de promocion cuenta solo su propio medio');

select results_eq($$
    select cantidad::int from vista_catalogo_medios
    where categoria = 'institucional' and referencia = 'testimonio' and tipo = 'video'
$$, $$ values (2) $$, 'la línea de testimonio cuenta sus dos medios');

-- Diagnóstico: una etiqueta que no existe debe listar las etiquetas reales,
-- no decir que la categoría institucional está vacía.
select results_eq($$
    select total_existentes::int from fn_medios_diagnostico('institucional', 'noexiste', 'ambos')
$$, $$ values (0) $$, 'diagnóstico: etiqueta inexistente da cero, no confunde con "categoría vacía"');

select results_eq($$
    select referencias_disponibles from fn_medios_diagnostico('institucional', 'noexiste', 'ambos')
$$, $$ values ('promocion, testimonio') $$,
   'y ofrece las etiquetas reales para que el agente se autocorrija');

select * from finish();
rollback;
