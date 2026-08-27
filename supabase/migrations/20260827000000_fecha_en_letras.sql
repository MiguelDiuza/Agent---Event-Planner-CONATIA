-- Nombrar una fecha en español, con su día de la semana.
--
-- Existe por una razón concreta (2026-08-27): cuando el cliente da una fecha
-- que ya pasó, el agente tiene que preguntarle si se refería a esa misma fecha
-- del año siguiente, y para que el cliente lo pueda verificar de un vistazo la
-- fecha tiene que ir con su día de la semana -- "el domingo 15 de marzo de
-- 2027", no "2027-03-15". El mismo día y mes cae en otro día de la semana el
-- año que viene, así que el nombre no se puede reutilizar del año actual.
--
-- No se usa `to_char(..., 'TMDay')` a propósito: eso depende del `lc_time` del
-- servidor, que en Supabase es inglés y no se puede cambiar por conexión sin
-- ensuciar todo lo demás. Los nombres van escritos aquí, que además es donde
-- se pueden leer.
create or replace function fn_fecha_en_letras(p_fecha date)
returns text
language sql
immutable
as $$
  select case when p_fecha is null then null else
    (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])
      [extract(isodow from p_fecha)::int]
    || ' ' || extract(day from p_fecha)::int || ' de '
    || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
              'septiembre','octubre','noviembre','diciembre'])
      [extract(month from p_fecha)::int]
    || ' de ' || extract(year from p_fecha)::int
  end
$$;

comment on function fn_fecha_en_letras(date) is
  'Nombra una fecha en español con su día de la semana: "domingo 15 de marzo de 2027".';
