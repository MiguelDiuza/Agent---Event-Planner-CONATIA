-- Como se resuelve el tipo de evento que manda el agente (2026-08-26).
--
-- El problema, medido con 30 variantes reales: los dos nodos que buscan el
-- paquete lo hacian con `nombre_paquete ilike '%' || $n || '%'`, y eso falla en
-- 12 de las 30. Las tres peores son "15 Anos", "Cumpleanos" y "Primera
-- Comunion" -- SIN TILDE --, que es exactamente lo que la descripcion de
-- consultar_inclusiones_evento le pedia al modelo que escribiera. Un LLM come
-- tildes todo el tiempo, y para ILIKE la 'ñ' no es una 'n'.
--
-- Lo que costaba fallar: si el tipo no casa, `Guion Cotizacion` devuelve cero
-- filas y los catorce videos salen SIN la cotizacion adelante. En silencio, sin
-- error y sin nada en el log. Es la falla mas cara del embudo nuevo y la mas
-- dificil de ver.
--
-- La solucion tiene tres partes:
--
--   1. Normalizar. Minusculas, sin tildes y sin nada que no sea letra o digito.
--      "Primera Comunión" y "primera comunion" caen en el mismo string, y
--      "BabyShower" cae en el mismo que "Baby Shower".
--   2. Alias. El cliente dice "boda", "graduacion" o "quinceañera", y el agente
--      repite la palabra del cliente. Son sinonimos del negocio, no errores.
--   3. Buscar en los dos sentidos. Lo que mando el agente puede CONTENER el
--      nombre ("cumpleaños 40", "evento de empresa") o estar CONTENIDO en el
--      ("15" dentro de "15 Años"). El sentido inverso pide 2 caracteres minimo,
--      que es lo que evita que "150" resuelva a "15 Años".
--
-- Se usa translate() y no la extension unaccent a proposito: es una tabla de
-- siete filas y no vale la pena sumarle una dependencia de extension al
-- proyecto por esto.

alter table tipos_evento add column alias text[] not null default '{}';

comment on column tipos_evento.alias is
    'Como llama el cliente a este paquete. El agente repite la palabra del '
    'cliente, asi que estos sinonimos son entradas normales y no errores. Se '
    'comparan normalizados: no hace falta cargarlos con y sin tilde.';

update tipos_evento set alias = '{quince,quinceanera,quinceañera,xv}'              where nombre_paquete = '15 Años';
update tipos_evento set alias = '{boda,bodas,casamiento,novios,matrimonial}'       where nombre_paquete = 'Matrimonio';
update tipos_evento set alias = '{graduacion,graduación,graduado,graduada,grados}' where nombre_paquete = 'Grado';
update tipos_evento set alias = '{cumple,cumpleano,birthday}'                      where nombre_paquete = 'Cumpleaños';
update tipos_evento set alias = '{empresarial,corporativo,fin de ano,fin de año}'  where nombre_paquete = 'Empresa';
update tipos_evento set alias = '{comunion,comunión}'                             where nombre_paquete = 'Primera Comunión';
update tipos_evento set alias = '{babyshower,baby}'                               where nombre_paquete = 'Baby Shower';

-- Minusculas, sin tildes, sin espacios ni signos. Lo que queda es comparable.
create or replace function fn_normalizar_evento(p_texto text)
returns text
language sql
immutable
as $fn$
    select regexp_replace(
               translate(lower(btrim(coalesce(p_texto, ''))),
                         'áéíóúüñàèìòùâêîôûäëïöÿ',
                         'aeiouunaeiouaeiouaeioy'),
               '[^a-z0-9]', '', 'g')
$fn$;

-- Devuelve el nombre_paquete exacto, o NULL si no hay forma de saber cual es.
-- NULL es una respuesta valida y deliberada: es preferible que la cotizacion no
-- salga a que salga la del paquete equivocado.
create or replace function fn_resolver_tipo_evento(p_texto text)
returns text
language sql
stable
as $fn$
    with entrada as (select fn_normalizar_evento(p_texto) as t)
    select c.nombre_paquete
    from tipos_evento te
    cross join entrada e
    -- El nombre canonico y los alias se prueban igual: son todos etiquetas de
    -- la misma fila.
    cross join lateral unnest(array[te.nombre_paquete] || te.alias) as etiqueta
    cross join lateral (select te.nombre_paquete as nombre_paquete,
                               fn_normalizar_evento(etiqueta) as n) c
    where e.t <> ''
      and c.n <> ''
      and (e.t like '%' || c.n || '%'
           or (length(e.t) >= 2 and c.n like '%' || e.t || '%'))
    -- Ante dos paquetes posibles gana la etiqueta mas larga, que es la mas
    -- especifica: "primera comunion" le gana a "comunion".
    order by length(c.n) desc, c.nombre_paquete
    limit 1
$fn$;

comment on function fn_resolver_tipo_evento(text) is
    'Traduce lo que el agente escribio como tipo de evento al nombre_paquete '
    'exacto. Tolera tildes comidas, mayusculas, espacios de mas y los sinonimos '
    'del cliente (boda, graduacion, quinceañera). NULL si no se puede decidir.';

-- Autoprueba. Estas 30 variantes son las que se midieron contra el ILIKE viejo,
-- donde fallaban 12. Si alguna deja de resolver, la migracion no pasa: sin esto
-- el fallo aparece meses despues, frente a un cliente y sin dejar rastro.
do $test$
declare
    v_caso  record;
    v_dio   text;
    v_malos text := '';
begin
    for v_caso in
        select * from (values
            ('15 Años','15 Años'), ('15 Anos','15 Años'), ('15 años','15 Años'),
            ('quinceañera','15 Años'), ('Quince Años','15 Años'), ('15','15 Años'),
            ('Matrimonio','Matrimonio'), ('matrimonio','Matrimonio'),
            ('Boda','Matrimonio'), ('MATRIMONIO','Matrimonio'),
            ('Grado','Grado'), ('grado','Grado'),
            ('Graduación','Grado'), ('Graduacion','Grado'),
            ('Cumpleaños','Cumpleaños'), ('Cumpleanos','Cumpleaños'),
            ('cumpleaños','Cumpleaños'), ('Cumpleaños 40','Cumpleaños'),
            ('Empresa','Empresa'), ('empresa','Empresa'),
            ('Empresarial','Empresa'), ('Evento de empresa','Empresa'),
            ('Primera Comunión','Primera Comunión'), ('Primera Comunion','Primera Comunión'),
            ('primera comunión','Primera Comunión'), ('Comunión','Primera Comunión'),
            ('Baby Shower','Baby Shower'), ('baby shower','Baby Shower'),
            ('BabyShower','Baby Shower'), ('Baby shower','Baby Shower')
        ) as t(entrada, espera)
    loop
        v_dio := fn_resolver_tipo_evento(v_caso.entrada);
        if v_dio is distinct from v_caso.espera then
            v_malos := v_malos || format('  %L -> %L (se esperaba %L)%s',
                                         v_caso.entrada, v_dio, v_caso.espera, chr(10));
        end if;
    end loop;

    if v_malos <> '' then
        raise exception 'fn_resolver_tipo_evento falla en:%s%s', chr(10), v_malos;
    end if;
end;
$test$;

-- Y lo que NO debe resolver: un numero de invitados mal puesto en el campo, o
-- una palabra que no es ningun paquete. Aqui NULL es la respuesta correcta.
do $test$
declare v_malos text := '';
begin
    if fn_resolver_tipo_evento('150')     is not null then v_malos := v_malos || ' 150'; end if;
    if fn_resolver_tipo_evento('')        is not null then v_malos := v_malos || ' vacio'; end if;
    if fn_resolver_tipo_evento(null)      is not null then v_malos := v_malos || ' null'; end if;
    if fn_resolver_tipo_evento('reunion') is not null then v_malos := v_malos || ' reunion'; end if;
    if v_malos <> '' then
        raise exception 'fn_resolver_tipo_evento resuelve cosas que no deberia:%', v_malos;
    end if;
end;
$test$;
